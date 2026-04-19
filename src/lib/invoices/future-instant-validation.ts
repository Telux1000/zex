/**
 * Single rule for any “scheduled at” ISO instant (UTC): must be strictly after `now`.
 * Used by Auto Reminder (`scheduledReminderAt`), invoice schedule send (`scheduled_send_at`),
 * and API guards — same comparison everywhere.
 */
export function validateIsoInstantStrictlyInFuture(
  isoUtc: string,
  now: Date,
  messages: { pastMessage: string; invalidIsoMessage?: string; minLeadMs?: number; tooSoonMessage?: string }
): { ok: true } | { ok: false; error: string } {
  const invalidIso = messages.invalidIsoMessage ?? 'Invalid date and time.';
  const t = Date.parse(isoUtc);
  if (Number.isNaN(t)) {
    return { ok: false, error: invalidIso };
  }
  const minLead = messages.minLeadMs ?? 0;
  const threshold = now.getTime() + minLead;
  if (t <= threshold) {
    if (minLead > 0 && t > now.getTime() && messages.tooSoonMessage) {
      return { ok: false, error: messages.tooSoonMessage };
    }
    return { ok: false, error: messages.pastMessage };
  }
  return { ok: true };
}
