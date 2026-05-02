/**
 * Normalizes marketing / attribution source strings for waitlist rows (shared with POST /api/waitlist).
 */
export function normalizeWaitlistSource(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t) return 'landing';
  let s = t.slice(0, 64);
  if (s === 'payment_failure') s = 'payment_error';
  if (s === 'feature_gate' || s === 'modal') s = 'feature_locked';
  const cleaned = s.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64) || 'landing';
  return cleaned;
}

/** Referral codes are 10 uppercase hex chars (see generateWaitlistReferralCode). */
export function looksLikeWaitlistReferralCode(raw: string | null | undefined): boolean {
  const u = String(raw ?? '').trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  return /^[0-9A-F]{10}$/.test(u);
}
