import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';
import { createPaymentLink } from '@/lib/stripe';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { buildInvoiceEmailSubject } from '@/lib/invoices/email-subject';
import { buildInvoicePdfBase64ForInvoiceId } from '@/lib/invoices/invoice-pdf-data';
import { notifyBusinessEvent } from '@/services/notifications';
import { createActivity } from '@/lib/activity';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import type { InvoiceSettings } from '@/lib/database.types';
import {
  appendZenzexEmailBrandingHtml,
  appendZenzexEmailBrandingText,
  zenzexEmailBrandingTemplateModel,
} from '@/lib/invoices/zenzex-invoice-branding';

const APP_URL = resolveAppBaseUrl() ?? 'http://localhost:3000';

export async function autoSendInvoiceIfEligible(
  supabase: SupabaseClient,
  input: { invoiceId: string; businessId: string }
) {
  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, status, stripe_payment_link_id, total, currency, customer_id, customer_name, customer_email, issue_date, due_date, amount_paid, balance_due'
    )
    .eq('id', input.invoiceId)
    .single();
  if (!invoice) return { ok: false as const, skipped: true as const, reason: 'invoice_not_found' };
  if (String(invoice.business_id) !== String(input.businessId)) {
    return { ok: false as const, skipped: true as const, reason: 'business_mismatch' };
  }

  const hasCustomerId = Boolean(String((invoice as { customer_id?: string | null }).customer_id ?? '').trim());
  const hasCustomerName = Boolean(String(invoice.customer_name ?? '').trim());
  const customerEmail = String(invoice.customer_email ?? '').trim();
  if (!hasCustomerId || !hasCustomerName || !customerEmail) {
    return { ok: false as const, skipped: true as const, reason: 'missing_customer_fields' };
  }
  if (!(Number(invoice.total ?? 0) > 0)) {
    return { ok: false as const, skipped: true as const, reason: 'invalid_total' };
  }

  const { data: alreadySent } = await supabase
    .from('email_messages')
    .select('id')
    .eq('business_id', String(invoice.business_id))
    .eq('related_entity_type', 'invoice')
    .eq('related_entity_id', String(invoice.id))
    .eq('event_type', 'invoice_sent')
    .in('status', ['sent', 'delivered', 'opened', 'clicked'])
    .limit(1);
  if ((alreadySent ?? []).length > 0 || String(invoice.status ?? '') === 'sent') {
    return { ok: true as const, skipped: true as const, reason: 'already_sent' };
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, payment_settings, invoice_settings, owner_id')
    .eq('id', String(invoice.business_id))
    .single();
  if (!business) return { ok: false as const, skipped: true as const, reason: 'business_not_found' };
  const ownerUserId = String((business as { owner_id?: string }).owner_id ?? '');

  const amountPaid = Number(invoice.amount_paid ?? 0);
  const balanceDue = resolveInvoiceBalanceDue({
    status: String(invoice.status ?? ''),
    total: invoice.total,
    amount_paid: amountPaid,
  });
  const epd = computeEarlyPaymentDiscount({
    settings: ((business as { payment_settings?: unknown }).payment_settings as any) ?? null,
    issue_date: invoice.issue_date ?? null,
    now: new Date(),
    balance_due: balanceDue,
  });
  const payable = epd.enabled && epd.eligible ? epd.payable_now : balanceDue;

  const { url, sessionId } = await createPaymentLink({
    invoiceId: String(invoice.id),
    invoiceNumber: String(invoice.invoice_number),
    businessId: String(invoice.business_id),
    amount: payable,
    currency: String(invoice.currency),
    customerEmail,
    successUrl: `${APP_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${APP_URL}/pay/cancel`,
  });
  const paymentUrl = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;

  await supabase
    .from('invoices')
    .update({
      stripe_payment_link_id: sessionId,
      status: 'sent',
      balance_due: balanceDue,
    })
    .eq('id', String(invoice.id));

  let invoicePdfAttachment:
    | Array<{
        Name: string;
        Content: string;
        ContentType: string;
      }>
    | undefined;
  try {
    const { base64, invoiceNumber: pdfInvoiceNumber } = await buildInvoicePdfBase64ForInvoiceId(supabase as any, {
      invoiceId: String(invoice.id),
      ownerUserId,
      paymentUrl,
    });
    invoicePdfAttachment = [
      {
        Name: `invoice-${pdfInvoiceNumber}.pdf`,
        Content: base64,
        ContentType: 'application/pdf',
      },
    ];
  } catch {
    invoicePdfAttachment = undefined;
  }

  const invoiceNumberText = String(invoice.invoice_number);
  const customerNameText = String(invoice.customer_name ?? 'customer');
  const invSettings = (business as { invoice_settings?: InvoiceSettings | null }).invoice_settings;
  const rawFallbackHtml = paymentUrl
    ? `<p>Invoice ${invoiceNumberText} is ready.</p><p><a href="${paymentUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#3b5cd1;color:#ffffff;text-decoration:none;font-weight:600;">Pay with card</a></p><p style="margin-top:8px;font-size:12px;color:#64748b;">Or <a href="${paymentUrl}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;">view payment link</a></p>`
    : `<p>Invoice ${invoiceNumberText} is ready.</p>`;
  const fallbackHtml = appendZenzexEmailBrandingHtml(rawFallbackHtml, invSettings);

  await notifyBusinessEvent(supabase as any, {
    businessId: String(invoice.business_id),
    eventType: 'invoice_sent',
    title: `Invoice ${invoiceNumberText} auto-sent`,
    message: `Invoice ${invoiceNumberText} was auto-sent to ${customerNameText}.`,
    entityType: 'invoice',
    entityId: String(invoice.id),
    severity: 'info',
    groupKey: `invoice_auto_sent:${String(invoice.id)}:${sessionId}`,
    email: {
      to: customerEmail,
      subject: buildInvoiceEmailSubject({
        state: 'default',
        invoiceNumber: invoiceNumberText,
        companyName: String((business as { name?: string }).name ?? ''),
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
        companyName: String((business as { name?: string }).name ?? ''),
        dueDate: String(invoice.due_date ?? ''),
        customerName: customerNameText,
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

  await createActivity(supabase as any, {
    business_id: String(invoice.business_id),
    eventType: 'invoice_sent',
    title: `Invoice auto-sent`,
    description: `Invoice ${invoiceNumberText} auto-sent to ${customerNameText}`,
    entityType: 'invoice',
    entityId: String(invoice.id),
    amount: Number(payable),
    currencyCode: String(invoice.currency ?? 'USD'),
    metadata: { source: 'quote_accept_auto_send', stripe_session_id: sessionId },
  });

  return { ok: true as const, skipped: false as const, invoiceId: String(invoice.id), sessionId };
}
