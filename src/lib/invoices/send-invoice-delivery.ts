import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';
import { createPaymentLink } from '@/lib/stripe';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { buildInvoiceEmailSubject } from '@/lib/invoices/email-subject';
import { createActivity } from '@/lib/activity';
import { logAuditEvent } from '@/lib/audit-log';
import { notifyBusinessEvent } from '@/services/notifications';
import { buildInvoicePdfBase64ForInvoiceId } from '@/lib/invoices/invoice-pdf-data';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import type { InvoiceSettings } from '@/lib/database.types';
import {
  appendZenzexEmailBrandingHtml,
  appendZenzexEmailBrandingText,
  zenzexEmailBrandingTemplateModel,
} from '@/lib/invoices/zenzex-invoice-branding';

const APP_URL = resolveAppBaseUrl() ?? 'http://localhost:3000';

export type InvoiceSendSource = 'manual' | 'scheduled_send';

type InvoiceRow = {
  id: string;
  business_id: string;
  invoice_number: string;
  status?: string;
  stripe_payment_link_id?: string | null;
  total?: number | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  currency?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  amount_paid?: number | null;
  balance_due?: number | null;
};

type BusinessRow = {
  id: string;
  name?: string | null;
  payment_settings?: unknown;
  invoice_settings?: InvoiceSettings | null;
};

/**
 * Sends the invoice email + payment link (Postmark), then sets status to sent and clears scheduled send fields.
 * Uses one notifyBusinessEvent call for the customer email — same template/path as manual "Send now".
 * Caller must enforce auth / eligibility.
 */
export async function deliverInvoiceSendEmail(
  supabase: SupabaseClient,
  opts: {
    invoice: InvoiceRow;
    business: BusinessRow;
    invoiceId: string;
    actorUserId: string | null;
    actorName: string;
    /** For PDF generation (business owner). */
    pdfOwnerUserId: string;
    /** Distinguish manual send vs scheduled cron for audit/activity/metadata. */
    sendSource?: InvoiceSendSource;
  }
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const business = opts.business;
  const invoiceId = opts.invoiceId;
  const sendSource: InvoiceSendSource = opts.sendSource ?? 'manual';

  const { data: fresh, error: loadErr } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, status, stripe_payment_link_id, total, subtotal, tax_amount, currency, customer_id, customer_name, customer_email, issue_date, due_date, amount_paid, balance_due'
    )
    .eq('id', invoiceId)
    .single();
  if (loadErr || !fresh) {
    return { ok: false, error: 'Invoice not found' };
  }
  const invoice = fresh as InvoiceRow;

  const st = String(invoice.status ?? '').toLowerCase();
  if (st !== 'draft' && st !== 'pending' && st !== 'sent') {
    return { ok: false, error: 'Invoice must be draft, pending, or sent to email' };
  }

  const amountPaid = Number(invoice.amount_paid ?? 0);
  const balanceDue = resolveInvoiceBalanceDue({
    status: invoice.status,
    total: invoice.total,
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
    invoiceNumber: String(invoice.invoice_number),
    businessId: invoice.business_id,
    amount: payable,
    currency: String(invoice.currency ?? 'USD'),
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
      ownerUserId: opts.pdfOwnerUserId,
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

  const invoiceNumberText = String(invoice.invoice_number);
  const customerNameText = String(invoice.customer_name ?? 'customer');
  const invSettings = (business as BusinessRow).invoice_settings;
  const rawFallbackHtml = paymentUrl
    ? `<p>Invoice ${invoiceNumberText} is ready.</p><p><a href="${paymentUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#3b5cd1;color:#ffffff;text-decoration:none;font-weight:600;">Pay with card</a></p><p style="margin-top:8px;font-size:12px;color:#64748b;">Or <a href="${paymentUrl}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;">view payment link</a></p>`
    : `<p>Invoice ${invoiceNumberText} is ready.</p>`;
  const fallbackHtml = appendZenzexEmailBrandingHtml(rawFallbackHtml, invSettings);

  const notifyResult = await notifyBusinessEvent(supabase, {
    businessId: String(invoice.business_id),
    eventType: 'invoice_sent',
    title: `Invoice ${invoiceNumberText} sent`,
    message: `Invoice ${invoiceNumberText} was sent to ${customerNameText}.`,
    entityType: 'invoice',
    entityId: String(invoice.id),
    severity: 'info',
    metadata: { source: sendSource },
    groupKey: `invoice_sent:${String(invoice.id)}:${sessionId}`,
    email: {
      to: String(invoice.customer_email ?? '').trim() || null,
      subject: buildInvoiceEmailSubject({
        state: 'default',
        invoiceNumber: invoiceNumberText,
        companyName: String(business.name ?? ''),
        dueDate: String(invoice.due_date ?? ''),
      }),
      htmlBody: fallbackHtml,
      textBody: appendZenzexEmailBrandingText(
        paymentUrl
          ? `Invoice ${invoiceNumberText} is ready. Pay here: ${paymentUrl}`
          : `Invoice ${invoiceNumberText} is ready. Please review and complete payment.`,
        invSettings
      ),
      templateEnvKey: 'POSTMARK_TEMPLATE_INVOICE_SENT',
      templateModel: {
        invoiceNumber: invoiceNumberText,
        companyName: String(business.name ?? ''),
        dueDate: String(invoice.due_date ?? ''),
        customerName: String(invoice.customer_name ?? ''),
        amountDue: Number(payable),
        currency: String(invoice.currency ?? 'USD'),
        paymentUrl,
        paymentLinkText: 'View payment link',
        hasPaymentUrl: Boolean(paymentUrl),
        ...zenzexEmailBrandingTemplateModel(invSettings),
      },
      tag: 'invoice_sent',
      attachments: invoicePdfAttachment,
    },
  });

  const outbound = notifyResult.outboundCustomerEmail;
  if (outbound?.attempted && !outbound.ok) {
    return {
      ok: false,
      error: outbound.error?.trim() || 'Email delivery failed. The invoice was not marked as sent.',
    };
  }

  const { error: upErr } = await supabase
    .from('invoices')
    .update({
      stripe_payment_link_id: sessionId,
      status: 'sent',
      scheduled_send_at: null,
      scheduled_send_timezone: null,
      balance_due: balanceDue,
    })
    .eq('id', invoiceId);
  if (upErr) return { ok: false, error: upErr.message };

  await createActivity(supabase, {
    business_id: String(invoice.business_id),
    eventType: 'invoice_sent',
    title: `Invoice ${String(invoice.invoice_number)} sent`,
    description: `Invoice emailed to ${String(invoice.customer_name ?? 'customer')}`,
    entityType: 'invoice',
    entityId: String(invoice.id),
    amount: Number(payable),
    currencyCode: String(invoice.currency || 'USD'),
    metadata: { stripe_session_id: sessionId, source: sendSource },
  });

  const prevStatus = String(invoice.status ?? '');
  const sendAuditAction = prevStatus === 'draft' ? 'sent' : 'resent';
  await logAuditEvent(supabase, {
    businessId: String(invoice.business_id),
    entityType: 'invoice',
    entityId: String(invoice.id),
    action: sendAuditAction,
    performedByUserId: opts.actorUserId,
    performedByName: opts.actorName,
    metadata: {
      invoice_number: String(invoice.invoice_number),
      mode: 'send_invoice',
      stripe_session_id: sessionId,
      source: sendSource,
    },
  });

  return { ok: true, sessionId };
}
