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
      'id, business_id, due_date, status, total, amount_paid, balance_due, use_customer_reminder_defaults, reminder_settings, customer_email, customers ( reminder_settings )'
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
    if (scheduledIso) {
      const t = Date.parse(scheduledIso);
      if (!Number.isNaN(t) && t <= now.getTime()) {
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
        } else if (r.skipped) skipped += 1;
        else if (!r.ok) skipped += 1;
        continue;
      }
    }

    if (!effective.automaticReminders) {
      skipped += 1;
      continue;
    }

    const offset = calendarOffsetFromDue(inv.due_date, now);
    if (offset == null) {
      skipped += 1;
      continue;
    }

    const dateKey = utcDateKey(now);
    for (const entry of effective.reminderTiming) {
      if (!offsetMatchesTiming(offset, entry)) continue;
      const dk = `offset:${dateKey}:${entry.relativeTo}:${entry.days}`;
      const r = await deliverInvoicePaymentReminder(supabase, {
        invoiceId: inv.id,
        ownerUserId: null,
        kind: 'offset',
        dedupeKey: dk,
      });
      if (r.ok && !r.skipped) sent += 1;
      else skipped += 1;
    }
  }

  return { sent, skipped, scanned: (rows ?? []).length };
}
