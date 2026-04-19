import { fromZonedTime } from 'date-fns-tz';
import { formatInTimeZone } from 'date-fns-tz';
import { validateIsoInstantStrictlyInFuture } from '@/lib/invoices/future-instant-validation';

/** Primary inline validation when scheduled time is not in the future (client + API). */
export const SCHEDULE_PAST_ERROR =
  'Scheduled send must be in the future. Choose a later date and time.';

/** Secondary hint near the save action when the chosen time is in the past. */
export const SCHEDULE_PAST_ERROR_SECONDARY =
  'Please choose a future date and time before saving.';

/** Helper copy for schedule UI (date/time are interpreted in business timezone). */
export const SCHEDULE_ACCOUNT_TIMEZONE_HELPER = 'Uses your account timezone';

/** Normalize IANA string from DB; default UTC. */
export function normalizeBusinessTimezone(iana: string | null | undefined): string {
  const s = String(iana ?? '').trim();
  return s || 'UTC';
}

/** Build UTC instant from date (yyyy-MM-dd), time (HH:mm), and IANA timezone. */
export function wallTimeToUtcIso(dateYmd: string, timeHm: string, ianaTz: string): string {
  const cleanDate = String(dateYmd).slice(0, 10);
  const cleanTime = String(timeHm).length === 5 ? timeHm : String(timeHm).padStart(5, '0');
  const wall = `${cleanDate}T${cleanTime}:00`;
  return fromZonedTime(wall, ianaTz).toISOString();
}

/** Same future rule as Auto Reminder / `validateIsoInstantStrictlyInFuture`. */
export function isScheduledSendInFuture(isoUtc: string, now: Date = new Date()): boolean {
  const r = validateIsoInstantStrictlyInFuture(isoUtc, now, {
    pastMessage: SCHEDULE_PAST_ERROR,
    invalidIsoMessage: 'Invalid date and time.',
  });
  return r.ok;
}

/**
 * Validate schedule-send date + time in the business IANA zone against `now`.
 * Shared by Schedule Send UI and should match server PATCH checks.
 */
export function validateScheduleSendWallTime(
  dateYmd: string,
  timeHm: string,
  ianaTz: string,
  now: Date
): { ok: true; isoUtc: string } | { ok: false; error: string } {
  let isoUtc: string;
  try {
    isoUtc = wallTimeToUtcIso(dateYmd, timeHm, ianaTz);
  } catch {
    return { ok: false, error: 'Please select a valid date and time.' };
  }
  const r = validateIsoInstantStrictlyInFuture(isoUtc, now, {
    pastMessage: SCHEDULE_PAST_ERROR,
    invalidIsoMessage: 'Please select a valid date and time.',
  });
  if (!r.ok) return r;
  return { ok: true, isoUtc };
}

/** Display line for invoice preview, e.g. "Apr 10, 2026 at 9:00 AM" in stored zone. */
export function formatScheduledSendPreviewLine(
  scheduledSendAtIso: string,
  displayTimezone: string | null | undefined
): string {
  const tz = normalizeBusinessTimezone(displayTimezone);
  try {
    const formatted = formatInTimeZone(
      new Date(scheduledSendAtIso),
      tz,
      "MMM d, yyyy 'at' h:mm a"
    );
    return `Scheduled to send on ${formatted}`;
  } catch {
    const d = new Date(scheduledSendAtIso);
    return `Scheduled to send on ${d.toLocaleString()}`;
  }
}

export function formatScheduledSendConfirmationMessage(
  scheduledSendAtIso: string,
  displayTimezone: string | null | undefined
): string {
  const tz = normalizeBusinessTimezone(displayTimezone);
  try {
    const formatted = formatInTimeZone(
      new Date(scheduledSendAtIso),
      tz,
      "MMM d, yyyy 'at' h:mm a"
    );
    return `Invoice scheduled for ${formatted}`;
  } catch {
    return 'Invoice scheduled';
  }
}

