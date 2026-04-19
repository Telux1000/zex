import type { SupabaseClient } from '@supabase/supabase-js';
import { canManageAutoReminders } from '@/lib/invoices/auto-reminders-eligibility';
import {
  calendarOffsetFromDue,
  offsetMatchesTiming,
  resolveEffectiveReminderConfig,
  utcDateKey,
  dueDateUtc,
  type EffectiveReminderConfig,
} from '@/lib/invoices/reminder-settings';

/** Matches `reminder-cron.ts` scheduled dedupe key. */
export function scheduledReminderDedupeKey(iso: string): string {
  return `scheduled:${String(iso).slice(0, 16)}`;
}

/** Matches `reminder-cron.ts` offset dedupe key for a calendar day. */
export function offsetReminderDedupeKey(
  probeDayUtc: Date,
  entry: { relativeTo: 'before_due' | 'after_due'; days: number }
): string {
  return `offset:${utcDateKey(probeDayUtc)}:${entry.relativeTo}:${entry.days}`;
}

export async function fetchDedupeKeysForInvoices(
  supabase: SupabaseClient,
  invoiceIds: string[]
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (invoiceIds.length === 0) return map;
  const { data } = await supabase
    .from('invoice_reminder_sent_log')
    .select('invoice_id, dedupe_key')
    .in('invoice_id', invoiceIds);
  for (const row of data ?? []) {
    const invId = String((row as { invoice_id?: string }).invoice_id ?? '').trim();
    const dk = String((row as { dedupe_key?: string }).dedupe_key ?? '').trim();
    if (!invId || !dk) continue;
    if (!map.has(invId)) map.set(invId, new Set());
    map.get(invId)!.add(dk);
  }
  return map;
}

export async function fetchDedupeKeysForInvoice(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<Set<string>> {
  const m = await fetchDedupeKeysForInvoices(supabase, [invoiceId]);
  return m.get(invoiceId) ?? new Set();
}

/**
 * Earliest instant for a reminder that cron has not yet recorded in `invoice_reminder_sent_log`.
 * Aligns with dedupe keys in `reminder-cron.ts`.
 */
export function computeNextPendingReminderUtcMs(args: {
  effective: EffectiveReminderConfig;
  dueDateStr: string;
  now: Date;
  sentDedupeKeys: Set<string>;
}): number | null {
  const { effective, dueDateStr, now, sentDedupeKeys } = args;
  const candidates: number[] = [];

  const sched = effective.scheduledReminderAt;
  if (sched != null && String(sched).trim()) {
    const t = Date.parse(String(sched));
    if (!Number.isNaN(t) && t > now.getTime()) {
      const dk = scheduledReminderDedupeKey(String(sched));
      if (!sentDedupeKeys.has(dk)) {
        candidates.push(t);
      }
    }
  }

  if (effective.automaticReminders && effective.reminderTiming.length > 0) {
    const due = dueDateUtc(dueDateStr);
    if (due) {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      const d = now.getUTCDate();
      for (let add = 0; add <= 370; add++) {
        const probeDay = new Date(Date.UTC(y, m, d + add));
        const offset = calendarOffsetFromDue(dueDateStr, probeDay);
        if (offset == null) continue;
        for (const entry of effective.reminderTiming) {
          if (!offsetMatchesTiming(offset, entry)) continue;
          const dk = offsetReminderDedupeKey(probeDay, entry);
          if (sentDedupeKeys.has(dk)) continue;
          const dayStart = Date.UTC(
            probeDay.getUTCFullYear(),
            probeDay.getUTCMonth(),
            probeDay.getUTCDate()
          );
          const noonUtc = dayStart + 12 * 60 * 60 * 1000;
          const cand = Math.max(noonUtc, now.getTime() + 60_000);
          if (cand > now.getTime()) {
            candidates.push(cand);
          }
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

export function effectiveReminderMeaningful(effective: EffectiveReminderConfig, now: Date): boolean {
  if (effective.automaticReminders && effective.reminderTiming.length > 0) return true;
  const s = effective.scheduledReminderAt;
  if (s == null || !String(s).trim()) return false;
  const t = Date.parse(String(s));
  return !Number.isNaN(t) && t > now.getTime();
}

export function reminderConfigFingerprint(
  useCustomerDefaults: boolean,
  customerRaw: unknown,
  invoiceRaw: unknown
): string {
  const eff = resolveEffectiveReminderConfig(useCustomerDefaults !== false, customerRaw, invoiceRaw);
  return JSON.stringify({
    automatic: eff.automaticReminders,
    sched: eff.scheduledReminderAt,
    timing: eff.reminderTiming,
  });
}

/** "Next reminder: 7 Apr 2026, 12:40 PM" */
export function formatNextReminderStatusLine(utcMs: number, locale?: string): string {
  const d = new Date(utcMs);
  const datePart = d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Next reminder: ${datePart}, ${timePart}`;
}

export type InvoiceReminderScheduleInput = {
  status: string;
  total: number;
  amount_paid?: number;
  balance_due?: number;
  due_date: string;
  use_customer_reminder_defaults?: boolean;
  reminder_settings?: unknown;
  customer_reminder_settings?: unknown | null;
};

export function resolveNextReminderForInvoiceDisplay(args: {
  inv: InvoiceReminderScheduleInput;
  sentDedupeKeys: Set<string>;
  now?: Date;
}): { next_reminder_at: string | null; next_reminder_status_line: string | null } {
  const now = args.now ?? new Date();
  const inv = args.inv;
  if (
    !canManageAutoReminders({
      status: inv.status,
      total: inv.total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due,
    })
  ) {
    return { next_reminder_at: null, next_reminder_status_line: null };
  }
  const st = String(inv.status ?? '').toLowerCase();
  if (st === 'paid' || st === 'voided' || st === 'cancelled' || st === 'draft') {
    return { next_reminder_at: null, next_reminder_status_line: null };
  }
  const effective = resolveEffectiveReminderConfig(
    inv.use_customer_reminder_defaults !== false,
    inv.customer_reminder_settings ?? null,
    inv.reminder_settings ?? null
  );
  const ms = computeNextPendingReminderUtcMs({
    effective,
    dueDateStr: inv.due_date,
    now,
    sentDedupeKeys: args.sentDedupeKeys,
  });
  if (ms == null) {
    return { next_reminder_at: null, next_reminder_status_line: null };
  }
  return {
    next_reminder_at: new Date(ms).toISOString(),
    next_reminder_status_line: formatNextReminderStatusLine(ms),
  };
}
