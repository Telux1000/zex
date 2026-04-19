import type { SupabaseClient } from '@supabase/supabase-js';
import { createPaymentLink } from '@/lib/stripe';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { buildInvoiceEmailSubject } from '@/lib/invoices/email-subject';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import { notifyBusinessEvent } from '@/services/notifications';
import { canManageAutoReminders } from '@/lib/invoices/auto-reminders-eligibility';
import { buildInvoicePdfBase64ForInvoiceId } from '@/lib/invoices/invoice-pdf-data';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export type ReminderDeliveryKind = 'manual' | 'scheduled' | 'offset';

export async function deliverInvoicePaymentReminder(
  supabase: SupabaseClient,
  opts: {
    invoiceId: string;
    ownerUserId?: string | null;
    kind: ReminderDeliveryKind;
    dedupeKey?: string;
  }
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, status, total, currency, customer_id, customer_name, customer_email, issue_date, due_date, amount_paid, balance_due'
    )
    .eq('id', opts.invoiceId)
    .single();

  if (!invoice) return { ok: false, error: 'Invoice not found' };
  const inv = invoice as {
    status?: string;
    total?: number | null;
    amount_paid?: number | null;
    balance_due?: number | null;
  };
  const amountPaid = Number((invoice as { amount_paid?: number }).amount_paid ?? 0);
  const balanceDue = resolveInvoiceBalanceDue({
    status: inv.status,
    total: inv.total,
    amount_paid: amountPaid,
  });
  if (
    !canManageAutoReminders({
      status: inv.status,
      total: inv.total,
      amount_paid: inv.amount_paid,
      balance_due: balanceDue,
    })
  ) {
    return { ok: true, skipped: true };
  }

  const email = String((invoice as { customer_email?: string | null }).customer_email ?? '').trim();
  if (!email) return { ok: false, error: 'Customer email is required' };

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, email, owner_id, payment_settings')
    .eq('id', (invoice as { business_id: string }).business_id)
    .single();

  if (!business) return { ok: false, error: 'Business not found' };

  if (opts.ownerUserId != null && (business as { owner_id: string }).owner_id !== opts.ownerUserId) {
    return { ok: false, error: 'Forbidden' };
  }

  if (balanceDue <= 0.005) return { ok: true, skipped: true };

  if (opts.dedupeKey) {
    const { data: existing } = await supabase
      .from('invoice_reminder_sent_log')
      .select('id')
      .eq('invoice_id', opts.invoiceId)
      .eq('dedupe_key', opts.dedupeKey)
      .maybeSingle();
    if (existing) return { ok: true, skipped: true };
  }

  const epd = computeEarlyPaymentDiscount({
    settings: (business as { payment_settings?: unknown }).payment_settings ?? null,
    issue_date: (invoice as { issue_date?: string }).issue_date ?? null,
    now: new Date(),
    balance_due: balanceDue,
  });
  const payable = epd.enabled && epd.eligible ? epd.payable_now : balanceDue;

  const { url, sessionId } = await createPaymentLink({
    invoiceId: (invoice as { id: string }).id,
    invoiceNumber: String((invoice as { invoice_number?: string }).invoice_number),
    businessId: (invoice as { business_id: string }).business_id,
    amount: payable,
    currency: String((invoice as { currency?: string }).currency ?? 'USD'),
    customerEmail: email,
    successUrl: `${APP_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${APP_URL}/pay/cancel`,
  });
  const paymentUrl = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;

  await supabase
    .from('invoices')
    .update({ stripe_payment_link_id: sessionId })
    .eq('id', opts.invoiceId);

  const invoiceNumberText = String((invoice as { invoice_number?: string }).invoice_number ?? '');
  const customerNameText = String((invoice as { customer_name?: string }).customer_name ?? 'customer');
  /** Only used when `POSTMARK_TEMPLATE_PAYMENT_REMINDER` is unset (local/dev). */
  const fallbackHtml = paymentUrl
    ? `<p>Payment reminder: Invoice ${invoiceNumberText}</p><p><a href="${paymentUrl}">Pay now</a></p>`
    : `<p>Payment reminder: Invoice ${invoiceNumberText}</p>`;

  /** Must match merge fields in your Postmark `payment-reminder` (or alias) template. */
  const paymentReminderTemplateModel = {
    invoiceNumber: invoiceNumberText,
    companyName: String((business as { name?: string }).name ?? ''),
    dueDate: String((invoice as { due_date?: string }).due_date ?? ''),
    customerName: customerNameText,
    amountDue: Number(payable),
    currency: String((invoice as { currency?: string }).currency ?? 'USD'),
    paymentUrl: paymentUrl ?? '',
    paymentLinkText: 'View payment link',
    hasPaymentUrl: Boolean(paymentUrl),
  };

  const pdfOwnerUserId = String((business as { owner_id?: string }).owner_id ?? '').trim();
  let invoicePdfAttachment:
    | Array<{
        Name: string;
        Content: string;
        ContentType: string;
      }>
    | undefined;
  if (pdfOwnerUserId) {
    try {
      const { base64, invoiceNumber: pdfInvoiceNumber } = await buildInvoicePdfBase64ForInvoiceId(supabase, {
        invoiceId: opts.invoiceId,
        ownerUserId: pdfOwnerUserId,
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
      console.error('Invoice PDF generation failed for payment reminder; sending without attachment', err);
    }
  }

  await notifyBusinessEvent(supabase, {
    businessId: String((invoice as { business_id: string }).business_id),
    eventType: 'payment_reminder_upcoming',
    title: `Payment reminder for Invoice ${invoiceNumberText}`,
    message: `Reminder sent to ${customerNameText}.`,
    entityType: 'invoice',
    entityId: String((invoice as { id: string }).id),
    severity: 'info',
    groupKey: `payment_reminder:${String((invoice as { id: string }).id)}:${sessionId}:${opts.kind}`,
    email: {
      to: email,
      subject: buildInvoiceEmailSubject({
        state: 'reminder',
        invoiceNumber: invoiceNumberText,
        companyName: String((business as { name?: string }).name ?? ''),
        dueDate: String((invoice as { due_date?: string }).due_date ?? ''),
      }),
      htmlBody: fallbackHtml,
      textBody: paymentUrl
        ? `Payment reminder: Invoice ${invoiceNumberText} — Pay here: ${paymentUrl}`
        : `Payment reminder: Invoice ${invoiceNumberText}`,
      templateEnvKey: 'POSTMARK_TEMPLATE_PAYMENT_REMINDER',
      templateModel: paymentReminderTemplateModel,
      tag: 'invoice_payment_reminder',
      attachments: invoicePdfAttachment,
    },
  });

  const kind: 'offset' | 'scheduled' | 'manual' =
    opts.kind === 'offset' ? 'offset' : opts.kind === 'scheduled' ? 'scheduled' : 'manual';
  if (opts.dedupeKey) {
    await supabase.from('invoice_reminder_sent_log').insert({
      invoice_id: opts.invoiceId,
      business_id: (invoice as { business_id: string }).business_id,
      kind,
      dedupe_key: opts.dedupeKey,
    });
  }

  let auditName = 'System';
  let auditUserId: string | null = null;
  let reminderSource: 'cron' | 'manual' | 'assistant' = 'manual';
  if (opts.ownerUserId) {
    auditUserId = opts.ownerUserId;
    auditName = (await resolveActorDisplayName(supabase, opts.ownerUserId)) ?? 'User';
    reminderSource = 'manual';
  } else if (opts.kind === 'scheduled' || opts.kind === 'offset') {
    auditName = 'System';
    reminderSource = 'cron';
  } else {
    auditName = 'Assistant';
    reminderSource = 'assistant';
  }
  await logAuditEvent(supabase, {
    businessId: String((invoice as { business_id: string }).business_id),
    entityType: 'invoice',
    entityId: opts.invoiceId,
    action: 'reminder_sent',
    performedByUserId: auditUserId,
    performedByName: auditName,
    metadata: {
      invoice_number: invoiceNumberText,
      kind: opts.kind,
      stripe_session_id: sessionId,
      reminder_source: reminderSource,
    },
  });

  return { ok: true };
}
