import { validateIsoInstantStrictlyInFuture } from '@/lib/invoices/future-instant-validation';
import { calendarOffsetFromDue } from '@/lib/invoices/reminder-settings';
import type { ReminderTimingEntry } from '@/lib/invoices/reminder-settings';

/** Calendar-day offset: today − due (positive = overdue). Matches `reminder-settings` / cron. */
export function calendarOffsetTodayMinusDue(dueDateStr: string, now: Date): number | null {
  return calendarOffsetFromDue(dueDateStr, now);
}

/** Due date is strictly after “today” (UTC calendar) → “before due” rules can still apply in the future. */
export function isBeforeDueOptionAllowed(dueDateStr: string, now: Date): boolean {
  const o = calendarOffsetTodayMinusDue(dueDateStr, now);
  return o != null && o < 0;
}

/** Whole days past due (0 if not past due). */
export function overdueCalendarDays(dueDateStr: string, now: Date): number {
  const o = calendarOffsetTodayMinusDue(dueDateStr, now);
  if (o == null || o <= 0) return 0;
  return o;
}

export const SCHEDULED_IN_PAST_MESSAGE =
  'This reminder time is in the past. Please choose a future date and time.';

/**
 * Validates a `datetime-local` value (browser-local wall time → UTC instant).
 * Same parsing and future check as Auto Reminder; optional `pastMessage` for Schedule Send copy.
 */
export function validateScheduledDatetimeLocal(
  scheduledLocal: string,
  now: Date,
  pastMessage: string = SCHEDULED_IN_PAST_MESSAGE
): { ok: true } | { ok: false; error: string } {
  if (!String(scheduledLocal ?? '').trim()) return { ok: true };
  const t = new Date(scheduledLocal);
  if (Number.isNaN(t.getTime())) {
    return { ok: false, error: 'Invalid date and time.' };
  }
  return validateIsoInstantStrictlyInFuture(t.toISOString(), now, {
    pastMessage,
    invalidIsoMessage: 'Invalid date and time.',
  });
}

/** Server / ISO: stored `scheduledReminderAt` must be strictly in the future. */
export function validateScheduledReminderIso(
  iso: string | null | undefined,
  now: Date
): { ok: true } | { ok: false; error: string } {
  if (iso == null || !String(iso).trim()) return { ok: true };
  return validateIsoInstantStrictlyInFuture(String(iso).trim(), now, {
    pastMessage: SCHEDULED_IN_PAST_MESSAGE,
    invalidIsoMessage: 'Invalid scheduled reminder time.',
  });
}

export function afterDueTooSoonMessage(overdue: number): string {
  return `This invoice is already ${overdue} days overdue. Reminder must be at least ${overdue} days after due date.`;
}

export function validateReminderTimingRows(
  rows: ReminderTimingEntry[],
  dueDateStr: string,
  now: Date
): { ok: true } | { ok: false; rowErrors: Map<number, string> } {
  const overdue = overdueCalendarDays(dueDateStr, now);
  const allowBefore = isBeforeDueOptionAllowed(dueDateStr, now);
  const rowErrors = new Map<number, string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.relativeTo === 'before_due' && !allowBefore) {
      rowErrors.set(i, 'Before due date is not available — the due date has passed or is today.');
    } else if (r.relativeTo === 'after_due' && overdue > 0 && r.days < overdue) {
      rowErrors.set(i, afterDueTooSoonMessage(overdue));
    }
  }
  if (rowErrors.size > 0) return { ok: false, rowErrors };
  return { ok: true };
}

/**
 * Apply smart defaults when opening the modal (due-relative rules only).
 * - Maps invalid "before due" rows to "after due" with days ≥ overdue.
 * - Clamps "after due" days below minimum when overdue.
 */
export function applySmartTimingDefaults(
  rows: ReminderTimingEntry[],
  dueDateStr: string,
  now: Date
): ReminderTimingEntry[] {
  const overdue = overdueCalendarDays(dueDateStr, now);
  const allowBefore = isBeforeDueOptionAllowed(dueDateStr, now);
  return rows.map((r) => {
    if (r.relativeTo === 'before_due' && !allowBefore) {
      return {
        relativeTo: 'after_due' as const,
        days: Math.max(overdue, 1),
      };
    }
    if (r.relativeTo === 'after_due' && overdue > 0 && r.days < overdue) {
      return { ...r, days: overdue };
    }
    return r;
  });
}

/** `datetime-local` string for a `Date` in the browser's local timezone. */
export function formatLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Next valid datetime-local suggestion: 15 minutes from now, seconds cleared. */
export function suggestFutureDatetimeLocalFrom(now: Date): string {
  const d = new Date(now.getTime() + 15 * 60 * 1000);
  d.setSeconds(0, 0);
  return formatLocalDatetimeInput(d);
}
