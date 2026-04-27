import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAdminPlatformSettings,
  platformFallbackReminderTiming,
} from '@/lib/admin/admin-platform-settings';
import {
  calendarOffsetFromDue,
  offsetMatchesTiming,
  parseInvoiceReminderSettings,
  resolveEffectiveReminderConfig,
  utcDateKey,
} from '@/lib/invoices/reminder-settings';
import { deliverInvoicePaymentReminder } from '@/lib/invoices/reminder-delivery';
import { canManageAutoReminders } from '@/lib/invoices/auto-reminders-eligibility';
import {
  classifyPresetFromDateOffset,
  classifyPresetFromOffsetMatch,
  parseReminderMessaging,
} from '@/lib/invoices/reminder-messaging';

type InvoiceRow = {
  id: string;
  business_id: string;
  due_date: string;
  status: string;
  total: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  use_customer_reminder_defaults: boolean | null;
  reminder_settings: unknown;
  customers: { reminder_settings: unknown } | null;
  businesses: { reminder_messaging: unknown } | null;
};

export type ProcessInvoiceRemindersOpts = {
  /** When set, only invoices for this business are scanned (for user-driven drains). */
  businessId?: string;
};

export async function processInvoiceReminders(
  supabase: SupabaseClient,
  now: Date = new Date(),
  opts?: ProcessInvoiceRemindersOpts
) {
  const platform = await fetchAdminPlatformSettings(supabase);
  if (!platform.feature_reminders_enabled) {
    return { sent: 0, skipped: 0, scanned: 0 };
  }
  const fallbackTiming = platformFallbackReminderTiming(platform);

  let q = supabase
    .from('invoices')
    .select(
      'id, business_id, due_date, status, total, amount_paid, balance_due, use_customer_reminder_defaults, reminder_settings, customer_email, customers ( reminder_settings ), businesses ( reminder_messaging )'
    )
    .in('status', ['sent', 'viewed', 'partially_paid', 'overdue'])
    .not('customer_email', 'is', null);
  if (opts?.businessId) {
    q = q.eq('business_id', opts.businessId);
  }
  const { data: rows, error } = await q;

  if (error) throw new Error(error.message);

  let sent = 0;
  let skipped = 0;

  for (const raw of rows ?? []) {
    const inv = raw as unknown as InvoiceRow & { customer_email?: string | null };
    const nowIso = now.toISOString();
    if (
      !canManageAutoReminders({
        status: inv.status,
        total: inv.total,
        amount_paid: inv.amount_paid,
        balance_due: inv.balance_due,
      })
    ) {
      skipped += 1;
      continue;
    }
    const email = String(inv.customer_email ?? '').trim();
    if (!email) {
      skipped += 1;
      continue;
    }

    const useDef = inv.use_customer_reminder_defaults !== false;
    const customerRaw = inv.customers?.reminder_settings ?? null;
    const effective = resolveEffectiveReminderConfig(useDef, customerRaw, inv.reminder_settings, {
      fallbackTiming,
    });

    const invParsed = parseInvoiceReminderSettings(inv.reminder_settings);
    const scheduledIso = effective.scheduledReminderAt;
    const messaging = parseReminderMessaging(inv.businesses?.reminder_messaging ?? null);
    if (scheduledIso) {
      const t = Date.parse(scheduledIso);
      if (!Number.isNaN(t) && t <= now.getTime()) {
        const scheduledOffset = calendarOffsetFromDue(inv.due_date, now);
        const reminderType =
          scheduledOffset == null
            ? 'overdue'
            : classifyPresetFromDateOffset(scheduledOffset, effective.reminderTiming);
        const preset = messaging.presets[reminderType];
        console.log('[reminder-send-debug] eligibility', {
          invoice_id: inv.id,
          reminder_type: reminderType,
          due_date: inv.due_date,
          scheduled_send_at: scheduledIso,
          now: nowIso,
          enabled: true,
          use_custom_copy: preset.enabled,
          has_custom_subject: String(preset.subject_template ?? '').trim().length > 0,
          has_custom_message: String(preset.message_template ?? '').trim().length > 0,
          already_sent: false,
          idempotency_result: 'pending',
          final_decision: 'send',
          source: 'scheduled',
        });
        const dk = `scheduled:${scheduledIso.slice(0, 16)}`;
        const r = await deliverInvoicePaymentReminder(supabase, {
          invoiceId: inv.id,
          ownerUserId: null,
          kind: 'scheduled',
          dedupeKey: dk,
        });
        if (r.ok && !r.skipped) {
          sent += 1;
          const base = (invParsed as Record<string, unknown> | null) ?? {};
          const nextSettings = { ...base, scheduledReminderAt: null };
          await supabase.from('invoices').update({ reminder_settings: nextSettings }).eq('id', inv.id);
          console.log('[reminder-send-debug] decision-result', {
            invoice_id: inv.id,
            reminder_type: reminderType,
            already_sent: false,
            idempotency_result: 'inserted',
            final_decision: 'sent',
            source: 'scheduled',
          });
        } else if (r.skipped) {
          skipped += 1;
          console.log('[reminder-send-debug] decision-result', {
            invoice_id: inv.id,
            reminder_type: reminderType,
            already_sent: true,
            idempotency_result: 'duplicate_or_skipped',
            final_decision: 'skip',
            source: 'scheduled',
          });
        } else if (!r.ok) {
          skipped += 1;
          console.log('[reminder-send-debug] decision-result', {
            invoice_id: inv.id,
            reminder_type: reminderType,
            already_sent: false,
            idempotency_result: 'failed',
            final_decision: 'skip',
            source: 'scheduled',
            error: r.error ?? 'unknown',
          });
        }
        continue;
      }
    }

    if (!effective.automaticReminders) {
      skipped += 1;
      console.log('[reminder-send-debug] eligibility', {
        invoice_id: inv.id,
        reminder_type: null,
        due_date: inv.due_date,
        scheduled_send_at: scheduledIso ?? null,
        now: nowIso,
        enabled: false,
        use_custom_copy: null,
        has_custom_subject: null,
        has_custom_message: null,
        already_sent: false,
        idempotency_result: 'not_applicable',
        final_decision: 'skip',
        source: 'offset',
      });
      continue;
    }

    const offset = calendarOffsetFromDue(inv.due_date, now);
    if (offset == null) {
      skipped += 1;
      console.log('[reminder-send-debug] eligibility', {
        invoice_id: inv.id,
        reminder_type: null,
        due_date: inv.due_date,
        scheduled_send_at: scheduledIso ?? null,
        now: nowIso,
        enabled: true,
        use_custom_copy: null,
        has_custom_subject: null,
        has_custom_message: null,
        already_sent: false,
        idempotency_result: 'not_applicable',
        final_decision: 'skip',
        source: 'offset',
      });
      continue;
    }

    const dateKey = utcDateKey(now);
    for (const entry of effective.reminderTiming) {
      if (!offsetMatchesTiming(offset, entry)) continue;
      const reminderType = classifyPresetFromOffsetMatch(offset, entry, effective.reminderTiming);
      const preset = messaging.presets[reminderType];
      console.log('[reminder-send-debug] eligibility', {
        invoice_id: inv.id,
        reminder_type: reminderType,
        due_date: inv.due_date,
        scheduled_send_at: scheduledIso ?? null,
        now: nowIso,
        enabled: true,
        use_custom_copy: preset.enabled,
        has_custom_subject: String(preset.subject_template ?? '').trim().length > 0,
        has_custom_message: String(preset.message_template ?? '').trim().length > 0,
        already_sent: false,
        idempotency_result: 'pending',
        final_decision: 'send',
        source: 'offset',
      });
      const dk = `offset:${dateKey}:${entry.relativeTo}:${entry.days}`;
      const r = await deliverInvoicePaymentReminder(supabase, {
        invoiceId: inv.id,
        ownerUserId: null,
        kind: 'offset',
        dedupeKey: dk,
        offsetContext: {
          offset,
          matched: entry,
          allEntries: effective.reminderTiming,
        },
      });
      if (r.ok && !r.skipped) {
        sent += 1;
        console.log('[reminder-send-debug] decision-result', {
          invoice_id: inv.id,
          reminder_type: reminderType,
          already_sent: false,
          idempotency_result: 'inserted',
          final_decision: 'sent',
          source: 'offset',
        });
      } else {
        skipped += 1;
        console.log('[reminder-send-debug] decision-result', {
          invoice_id: inv.id,
          reminder_type: reminderType,
          already_sent: Boolean(r.skipped),
          idempotency_result: r.skipped ? 'duplicate_or_skipped' : 'failed',
          final_decision: 'skip',
          source: 'offset',
          ...(r.ok ? {} : { error: r.error ?? 'unknown' }),
        });
      }
    }
  }

  return { sent, skipped, scanned: (rows ?? []).length };
}
