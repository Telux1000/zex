import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';
import { createPaymentLink } from '@/lib/stripe';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import { notifyBusinessEvent } from '@/services/notifications';
import { getNotificationPreferences } from '@/services/notificationPreferences';
import { canManageAutoReminders } from '@/lib/invoices/auto-reminders-eligibility';
import { buildInvoicePdfBase64ForInvoiceId } from '@/lib/invoices/invoice-pdf-data';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { fetchAdminPlatformSettings, platformFallbackReminderTiming } from '@/lib/admin/admin-platform-settings';
import {
  type ReminderTimingEntry,
  calendarOffsetFromDue,
  resolveEffectiveReminderConfig,
} from '@/lib/invoices/reminder-settings';
import {
  buildPostmarkPaymentReminderTemplateModel,
  buildReminderRenderVariables,
  type ReminderMessagePreset,
  type ReminderMessagingSettingsV1,
  classifyPresetFromDateOffset,
  classifyPresetFromOffsetMatch,
  normalizePostmarkPaymentReminderModel,
  reminderMessageToHtmlFragment,
  resolveOutboundSupportEmail,
} from '@/lib/invoices/reminder-messaging';

const APP_URL = resolveAppBaseUrl() ?? 'http://localhost:3000';

export type ReminderDeliveryKind = 'manual' | 'scheduled' | 'offset';

export type DeliverReminderOffsetContext = {
  offset: number;
  matched: ReminderTimingEntry;
  allEntries: ReminderTimingEntry[];
};

function reminderDebugLog(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production') return;
  console.log('[reminder-debug]', payload);
}

function resolveMessagePreset(
  kind: ReminderDeliveryKind,
  now: Date,
  dueDate: string,
  eff: { reminderTiming: ReminderTimingEntry[] },
  offsetCtx?: DeliverReminderOffsetContext | null
): ReminderMessagePreset {
  if (kind === 'offset' && offsetCtx) {
    return classifyPresetFromOffsetMatch(
      offsetCtx.offset,
      offsetCtx.matched,
      offsetCtx.allEntries
    );
  }
  const offset = calendarOffsetFromDue(dueDate, now);
  if (offset == null) {
    return 'overdue';
  }
  return classifyPresetFromDateOffset(offset, eff.reminderTiming);
}

function manualMinuteDedupeKey(invoiceId: string) {
  return `manual:m:${invoiceId}:${Math.floor(Date.now() / 60_000)}`;
}

function isPostgresUniqueViolation(err: { code?: string; message?: string } | null) {
  return err?.code === '23505' || /duplicate key|unique constraint/i.test(String(err?.message ?? ''));
}

export async function deliverInvoicePaymentReminder(
  supabase: SupabaseClient,
  opts: {
    invoiceId: string;
    ownerUserId?: string | null;
    kind: ReminderDeliveryKind;
    dedupeKey?: string;
    /** Set by invoice reminder cron for offset-based automatic sends. */
    offsetContext?: DeliverReminderOffsetContext | null;
  }
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, status, total, currency, customer_id, customer_name, customer_email, issue_date, due_date, amount_paid, balance_due, use_customer_reminder_defaults, reminder_settings, customers ( reminder_settings )'
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
    .select('id, name, email, owner_id, payment_settings, reminder_messaging')
    .eq('id', (invoice as { business_id: string }).business_id)
    .single();

  if (!business) return { ok: false, error: 'Business not found' };

  if (opts.ownerUserId != null && (business as { owner_id: string }).owner_id !== opts.ownerUserId) {
    return { ok: false, error: 'Forbidden' };
  }

  if (balanceDue <= 0.005) return { ok: true, skipped: true };

  const businessId = String((invoice as { business_id: string }).business_id);
  const prefs = await getNotificationPreferences(supabase, businessId);
  if (!prefs.payment_reminders) {
    return { ok: true, skipped: true };
  }

  const now = new Date();
  const platform = await fetchAdminPlatformSettings(supabase);
  const fallbackTiming = platformFallbackReminderTiming(platform);
  const invU = invoice as unknown as {
    use_customer_reminder_defaults?: boolean | null;
    reminder_settings?: unknown;
    customers?: { reminder_settings: unknown } | { reminder_settings: unknown }[] | null;
  };
  const custSettings = Array.isArray(invU.customers) ? invU.customers[0] : invU.customers;
  const useDef = invU.use_customer_reminder_defaults !== false;
  const eff = resolveEffectiveReminderConfig(
    useDef,
    custSettings?.reminder_settings ?? null,
    invU.reminder_settings,
    { fallbackTiming }
  );
  const st = (business as { reminder_messaging?: ReminderMessagingSettingsV1 | null })
    .reminder_messaging as ReminderMessagingSettingsV1 | null;
  const dueDate = String((invoice as { due_date?: string }).due_date ?? '');
  const preset = resolveMessagePreset(
    opts.kind,
    now,
    dueDate,
    eff,
    opts.offsetContext
  );

  if (opts.kind !== 'manual' && !opts.dedupeKey) {
    console.error('[reminder] offset/scheduled send missing dedupeKey', { invoiceId: opts.invoiceId, kind: opts.kind });
    return { ok: false, error: 'Invalid reminder request' };
  }
  const effectiveDedupeKey =
    opts.dedupeKey ?? manualMinuteDedupeKey(String(opts.invoiceId));
  const logKind: 'offset' | 'scheduled' | 'manual' =
    opts.kind === 'offset' ? 'offset' : opts.kind === 'scheduled' ? 'scheduled' : 'manual';
  const triggerSource: 'cron' | 'manual' | 'assistant' =
    opts.ownerUserId != null ? 'manual' : opts.kind === 'offset' || opts.kind === 'scheduled' ? 'cron' : 'assistant';

  {
    const { error: insErr } = await supabase.from('invoice_reminder_sent_log').insert({
      invoice_id: opts.invoiceId,
      business_id: businessId,
      kind: logKind,
      dedupe_key: effectiveDedupeKey,
      reminder_type: preset,
      trigger_source: triggerSource,
    });
    if (insErr) {
      if (isPostgresUniqueViolation(insErr)) {
        reminderDebugLog({
          invoice_id: opts.invoiceId,
          reminder_type: preset,
          use_custom_copy: null,
          has_subject: null,
          has_message: null,
          scheduled_send_at: null,
          decision: 'skip',
          reason: 'already_sent',
        });
        return { ok: true, skipped: true };
      }
      console.error('[reminder] claim insert failed', insErr);
      return { ok: false, error: insErr.message };
    }
  }

  let sendSucceeded = false;
  try {
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
      businessId: businessId,
      amount: payable,
      currency: String((invoice as { currency?: string }).currency ?? 'USD'),
      customerEmail: email,
      successUrl: `${APP_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_URL}/pay/cancel`,
    });
    const paymentUrl = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;

    await supabase.from('invoices').update({ stripe_payment_link_id: sessionId }).eq('id', opts.invoiceId);

    const invoiceNumberText = String((invoice as { invoice_number?: string }).invoice_number ?? '');
    const customerNameText = String((invoice as { customer_name?: string }).customer_name ?? 'customer');
    const currency = String((invoice as { currency?: string }).currency ?? 'USD');
    const support = resolveOutboundSupportEmail(
      (business as { email?: string | null }).email as string | null
    );
    const vars = buildReminderRenderVariables({
      customerName: customerNameText,
      businessName: String((business as { name?: string }).name ?? ''),
      invoiceNumber: invoiceNumberText,
      amount: payable,
      currency,
      dueDateIso: dueDate,
      paymentUrl: paymentUrl ?? '',
      supportEmail: support,
    });
    const { subject: subj, messagePlain, templateModel: baseModel } =
      buildPostmarkPaymentReminderTemplateModel({
        st,
        preset,
        vars,
        hasPaymentUrl: Boolean(paymentUrl),
        rawAmount: Number(payable) || 0,
        currencyCode: currency,
      });
    const paymentReminderTemplateModel = normalizePostmarkPaymentReminderModel(
      baseModel as Record<string, unknown>
    );

    const bodyHtml = reminderMessageToHtmlFragment(messagePlain);
    const urlEsc = (paymentUrl ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const fallbackHtml = paymentUrl
      ? `${bodyHtml}<p><a href="${urlEsc}">Pay now</a></p>`
      : bodyHtml;

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
        const { base64, invoiceNumber: pdfInvoiceNumber } = await buildInvoicePdfBase64ForInvoiceId(
          supabase,
          {
            invoiceId: opts.invoiceId,
            ownerUserId: pdfOwnerUserId,
            paymentUrl,
          }
        );
        invoicePdfAttachment = [
          {
            Name: `invoice-${pdfInvoiceNumber}.pdf`,
            Content: base64,
            ContentType: 'application/pdf',
          },
        ];
      } catch (err) {
        console.error(
          'Invoice PDF generation failed for payment reminder; sending without attachment',
          err
        );
      }
    }

    console.log('[reminder-sender] attempt', {
      trigger: triggerSource,
      kind: logKind,
      dedupe: effectiveDedupeKey ?? 'none',
      reminder_type: preset,
      invoice_id: opts.invoiceId,
    });

    const sendResult = await notifyBusinessEvent(supabase, {
      businessId: businessId,
      eventType: 'payment_reminder_upcoming',
      title: `Payment reminder for Invoice ${invoiceNumberText}`,
      message: `Reminder sent to ${customerNameText}.`,
      entityType: 'invoice',
      entityId: String((invoice as { id: string }).id),
      severity: 'info',
      groupKey: `payment_reminder:${String((invoice as { id: string }).id)}:${sessionId}:${opts.kind}`,
      email: {
        to: email,
        subject: subj,
        htmlBody: fallbackHtml,
        textBody: paymentUrl
          ? `${messagePlain}\n\nPay here: ${paymentUrl}`
          : messagePlain,
        templateEnvKey: 'POSTMARK_TEMPLATE_PAYMENT_REMINDER',
        templateModel: paymentReminderTemplateModel,
        tag: 'invoice_payment_reminder',
        attachments: invoicePdfAttachment,
      },
    });

    const outbound = sendResult.outboundCustomerEmail;
    const sendFailed = Boolean(effectiveDedupeKey && outbound?.attempted && !outbound?.ok);
    if (sendFailed) {
      console.error('[reminder-sender] send failed', {
        invoice_id: opts.invoiceId,
        err: outbound?.error,
      });
      return { ok: false, error: outbound?.error || 'Failed to send reminder' };
    }

    sendSucceeded = true;

    let auditName = 'System';
    let auditUserId: string | null = null;
    let reminderSource: 'cron' | 'manual' | 'assistant' = 'assistant';
    if (opts.ownerUserId) {
      auditUserId = opts.ownerUserId;
      auditName = (await resolveActorDisplayName(supabase, opts.ownerUserId)) ?? 'User';
      reminderSource = 'manual';
    } else if (opts.kind === 'scheduled' || opts.kind === 'offset') {
      auditName = 'System';
      reminderSource = 'cron';
    }
    await logAuditEvent(supabase, {
      businessId,
      entityType: 'invoice',
      entityId: opts.invoiceId,
      action: 'reminder_sent',
      performedByUserId: auditUserId,
      performedByName: auditName,
      metadata: {
        invoice_number: invoiceNumberText,
        kind: opts.kind,
        reminder_preset: preset,
        trigger_source: triggerSource,
        dedupe_key: effectiveDedupeKey,
        stripe_session_id: sessionId,
        reminder_source: reminderSource,
      },
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send reminder';
    reminderDebugLog({
      invoice_id: opts.invoiceId,
      reminder_type: preset,
      use_custom_copy: null,
      has_subject: null,
      has_message: null,
      scheduled_send_at: null,
      decision: 'skip',
      reason: msg,
    });
    console.error('[reminder] pipeline-error', { invoice_id: opts.invoiceId, reminder_type: preset, kind: logKind, error: msg });
    return { ok: false, error: msg };
  } finally {
    if (!sendSucceeded) {
      await supabase
        .from('invoice_reminder_sent_log')
        .delete()
        .eq('invoice_id', opts.invoiceId)
        .eq('dedupe_key', effectiveDedupeKey);
    }
  }
}
