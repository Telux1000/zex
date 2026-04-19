import { canManageAutoReminders } from '@/lib/invoices/auto-reminders-eligibility';
import {
  dueDateUtc,
  resolveEffectiveReminderConfig,
  type EffectiveReminderConfig,
} from '@/lib/invoices/reminder-settings';

function utcDayStartMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** True when automatic offsets and/or a future one-off scheduled reminder will fire. */
export function isEffectiveAutoRemindersActive(effective: EffectiveReminderConfig): boolean {
  if (effective.automaticReminders) return true;
  const s = effective.scheduledReminderAt;
  if (s == null || !String(s).trim()) return false;
  const t = Date.parse(String(s));
  return !Number.isNaN(t) && t >= Date.now();
}

export type InvoiceReminderFields = {
  status: string;
  total: number;
  amount_paid?: number;
  balance_due?: number;
  use_customer_reminder_defaults?: boolean;
  reminder_settings?: unknown;
  customer_reminder_settings?: unknown | null;
  /** ISO instant from list/detail API when a pending reminder exists (source of truth). */
  next_reminder_at?: string | null;
};

/**
 * Table / list: show clock only when API reports a future pending reminder (`next_reminder_at`).
 */
export function invoiceShowsAutoReminderIndicator(inv: InvoiceReminderFields): boolean {
  const iso = inv.next_reminder_at != null ? String(inv.next_reminder_at).trim() : '';
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t <= Date.now()) return false;
  if (inv.use_customer_reminder_defaults !== undefined) {
    return canManageAutoReminders({
      status: inv.status,
      total: inv.total,
      amount_paid: inv.amount_paid,
      balance_due: inv.balance_due,
    });
  }
  return true;
}

/** Earliest upcoming reminder instant (scheduled datetime, or start of UTC day for rule-based). */
export function getNextReminderEventUtcMs(
  effective: EffectiveReminderConfig,
  dueDateStr: string,
  now: Date = new Date()
): number | null {
  const candidates: number[] = [];
  const scheduled = effective.scheduledReminderAt;
  if (scheduled != null && String(scheduled).trim()) {
    const t = Date.parse(String(scheduled));
    if (!Number.isNaN(t) && t >= now.getTime()) candidates.push(t);
  }
  if (effective.automaticReminders) {
    const due = dueDateUtc(dueDateStr);
    if (due) {
      for (const entry of effective.reminderTiming) {
        const cand = new Date(due);
        if (entry.relativeTo === 'before_due') {
          cand.setUTCDate(cand.getUTCDate() - entry.days);
        } else {
          cand.setUTCDate(cand.getUTCDate() + entry.days);
        }
        const candDay = utcDayStartMs(cand);
        if (candDay >= utcDayStartMs(now)) candidates.push(candDay);
      }
    }
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

/**
 * Short status for invoice preview: "Next reminder tomorrow", "on Apr 10, 2026", etc.
 */
export function formatNextReminderShortLine(
  effective: EffectiveReminderConfig,
  dueDateStr: string,
  now: Date = new Date()
): string | null {
  if (!isEffectiveAutoRemindersActive(effective)) return null;
  const nextMs = getNextReminderEventUtcMs(effective, dueDateStr, now);
  if (nextMs == null) return 'Auto reminders enabled';

  const today0 = utcDayStartMs(now);
  const event0 = utcDayStartMs(new Date(nextMs));
  const dayDiff = Math.round((event0 - today0) / 86400000);

  if (dayDiff === 0) return 'Next reminder today';
  if (dayDiff === 1) return 'Next reminder tomorrow';
  if (dayDiff >= 2 && dayDiff <= 6) return `Next reminder in ${dayDiff} days`;
  return `Next reminder on ${new Date(nextMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

/** Preview strip when server provides `next_reminder_status_line` (preferred). */
export function buildInvoicePreviewReminderLine(
  inv: InvoiceReminderFields,
  dueDateStr: string,
  now?: Date,
  /** When set (e.g. from RSC), overrides client-only heuristic. */
  serverStatusLine?: string | null
): { line: string } | null {
  if (serverStatusLine != null && String(serverStatusLine).trim()) {
    return { line: String(serverStatusLine).trim() };
  }
  if (!invoiceShowsAutoReminderIndicator(inv)) return null;
  const effective = resolveEffectiveReminderConfig(
    inv.use_customer_reminder_defaults !== false,
    inv.customer_reminder_settings ?? null,
    inv.reminder_settings ?? null
  );
  const line = formatNextReminderShortLine(effective, dueDateStr, now);
  if (!line) return null;
  return { line };
}
