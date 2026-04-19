import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPaymentLink } from '@/lib/stripe';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { buildInvoiceEmailSubject } from '@/lib/invoices/email-subject';
import { createActivity } from '@/lib/activity';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import { notifyBusinessEvent } from '@/services/notifications';
import { buildInvoicePdfBase64ForInvoiceId } from '@/lib/invoices/invoice-pdf-data';
import { deliverInvoiceSendEmail } from '@/lib/invoices/send-invoice-delivery';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const invoiceId = body.invoice_id;
    const mode = String(body.mode ?? 'send_invoice');
    if (!invoiceId) return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 });

    const { data: invoice } = await supabase
      .from('invoices')
      .select(
        'id, business_id, invoice_number, status, stripe_payment_link_id, total, subtotal, tax_amount, currency, customer_id, customer_name, customer_email, issue_date, due_date, reference_po, notes, terms, amount_paid, balance_due, scheduled_send_at'
      )
      .eq('id', invoiceId)
      .single();

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const hasCustomerLink = Boolean(String((invoice as { customer_id?: string | null }).customer_id ?? '').trim());
    const hasCustomerName = Boolean(String(invoice.customer_name ?? '').trim());
    if (!hasCustomerLink || !hasCustomerName) {
      return NextResponse.json({ error: 'Customer is required before sending' }, { status: 400 });
    }

    if (mode === 'send_invoice' || mode === 'email_payment_link') {
      const hasEmail = Boolean(String(invoice.customer_email ?? '').trim());
      if (!hasEmail) {
        return NextResponse.json({ error: 'Customer email is required to send' }, { status: 400 });
      }
    }

    const { data: business } = await supabase
      .from('businesses')
      .select(
        'id, owner_id, name, email, phone, logo_url, address_line1, address_line2, city, state, postal_code, country, payment_settings'
      )
      .eq('id', invoice.business_id)
      .eq('owner_id', user.id)
      .single();
    if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';
    const ownerId = String((business as { owner_id: string }).owner_id);

    if (mode === 'send_invoice') {
      const st = String((invoice as { status?: string }).status ?? '').toLowerCase();
      if (st !== 'draft' && st !== 'pending') {
        return NextResponse.json({ error: 'Only draft invoices can be sent this way.' }, { status: 400 });
      }
      const scheduledAt = (invoice as { scheduled_send_at?: string | null }).scheduled_send_at;
      const force = Boolean(body.force_clear_schedule);
      if (st === 'draft' && scheduledAt && !force) {
        return NextResponse.json(
          {
            error: 'This invoice is scheduled to send later. Confirm to send now instead.',
            needsScheduleOverride: true,
          },
          { status: 409 }
        );
      }

      const r = await deliverInvoiceSendEmail(supabase, {
        invoice: invoice as never,
        business: business as never,
        invoiceId,
        actorUserId: user.id,
        actorName,
        pdfOwnerUserId: ownerId,
        sendSource: 'manual',
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ url: null, sessionId: r.sessionId });
    }

    const amountPaid = Number(invoice.amount_paid ?? 0);
    const balanceDue = resolveInvoiceBalanceDue({
      status: String((invoice as { status?: string }).status ?? ''),
      total: (invoice as { total?: number }).total,
      amount_paid: amountPaid,
    });
    const epd = computeEarlyPaymentDiscount({
      settings: (business.payment_settings as Record<string, unknown> | null) ?? null,
      issue_date: invoice.issue_date ?? null,
      now: new Date(),
      balance_due: balanceDue,
    });
    const payable = epd.enabled && epd.eligible ? epd.payable_now : balanceDue;

    const { url, sessionId } = await createPaymentLink({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      businessId: invoice.business_id,
      amount: payable,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      successUrl: `${APP_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_URL}/pay/cancel`,
    });
    const paymentUrl = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;

    let invoicePdfAttachment:
      | Array<{
          Name: string;
          Content: string;
          ContentType: string;
        }>
      | undefined;
    try {
      const { base64, invoiceNumber: pdfInvoiceNumber } = await buildInvoicePdfBase64ForInvoiceId(supabase, {
        invoiceId: String(invoice.id),
        ownerUserId: user.id,
        paymentUrl,
      });
      invoicePdfAttachment = [
        {
          Name: `invoice-${pdfInvoiceNumber}.pdf`,
          Content: base64,
          ContentType: 'application/pdf',
        },
      ];
    } catch (err) {
      console.error('Invoice PDF generation failed; sending without attachment', err);
    }

    if (mode === 'create_only') {
      return NextResponse.json({ url, sessionId });
    }

    if (mode === 'email_payment_link') {
      const invoiceNumberText = String(invoice.invoice_number);
      const customerNameText = String(invoice.customer_name ?? 'customer');
      const fallbackHtml = paymentUrl
        ? `<p>Payment link for Invoice ${invoiceNumberText}</p><p><a href="${paymentUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#3b5cd1;color:#ffffff;text-decoration:none;font-weight:600;">Pay with card</a></p><p style="margin-top:8px;font-size:12px;color:#64748b;">Or <a href="${paymentUrl}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;">view payment link</a></p>`
        : `<p>Payment link for Invoice ${invoiceNumberText}</p>`;
      await supabase
        .from('invoices')
        .update({
          stripe_payment_link_id: sessionId,
        })
        .eq('id', invoiceId);

      await createActivity(supabase, {
        business_id: String(invoice.business_id),
        eventType: 'invoice_updated',
        title: `Payment link emailed for Invoice ${invoiceNumberText}`,
        description: `Payment link emailed to ${customerNameText}`,
        entityType: 'invoice',
        entityId: String(invoice.id),
        amount: Number(payable),
        currencyCode: String(invoice.currency || 'USD'),
        metadata: { stripe_session_id: sessionId, action: 'email_payment_link' },
      });

      const hadPriorLink = Boolean(
        String((invoice as { stripe_payment_link_id?: string | null }).stripe_payment_link_id ?? '').trim()
      );
      const sendAuditAction = hadPriorLink ? 'resent' : 'sent';
      await logAuditEvent(supabase, {
        businessId: String(invoice.business_id),
        entityType: 'invoice',
        entityId: String(invoice.id),
        action: sendAuditAction,
        performedByUserId: user.id,
        performedByName: actorName,
        metadata: {
          invoice_number: invoiceNumberText,
          mode: 'email_payment_link',
          stripe_session_id: sessionId,
        },
      });

      await notifyBusinessEvent(supabase, {
        businessId: String(invoice.business_id),
        eventType: 'invoice_sent',
        title: `Payment link emailed for Invoice ${invoiceNumberText}`,
        message: `Payment link emailed to ${customerNameText}.`,
        entityType: 'invoice',
        entityId: String(invoice.id),
        severity: 'info',
        groupKey: `payment_link_emailed:${String(invoice.id)}:${sessionId}`,
        email: {
          to: String(invoice.customer_email ?? '').trim() || null,
          subject: buildInvoiceEmailSubject({
            state: 'reminder',
            invoiceNumber: invoiceNumberText,
            companyName: String((business as { name?: string })?.name ?? ''),
            dueDate: String(invoice.due_date ?? ''),
          }),
          htmlBody: fallbackHtml,
          textBody: paymentUrl
            ? `Payment link for Invoice ${invoiceNumberText}: ${paymentUrl}`
            : `Payment link for Invoice ${invoiceNumberText} is currently unavailable.`,
          templateEnvKey: 'POSTMARK_TEMPLATE_PAYMENT_LINK',
          templateModel: {
            invoiceNumber: invoiceNumberText,
            companyName: String((business as { name?: string })?.name ?? ''),
            dueDate: String(invoice.due_date ?? ''),
            customerName: String(invoice.customer_name ?? ''),
            amountDue: Number(payable),
            currency: String(invoice.currency ?? 'USD'),
            paymentUrl,
            paymentLinkText: 'View payment link',
            hasPaymentUrl: Boolean(paymentUrl),
          },
          tag: 'payment_link_emailed',
        },
      });

      return NextResponse.json({ url, sessionId });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create payment link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
