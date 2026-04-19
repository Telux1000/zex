/** Hours until internal staff invite links expire (default 72, max 168). */
export function getInternalStaffInviteTtlHours(): number {
  const raw = process.env.INTERNAL_STAFF_INVITE_TTL_HOURS;
  const n = raw ? Number.parseInt(raw, 10) : 72;
  if (!Number.isFinite(n) || n < 1) return 72;
  if (n > 168) return 168;
  return n;
}

export function clampInviteTtlHours(hours: number): number {
  if (!Number.isFinite(hours) || hours < 1) return 72;
  if (hours > 168) return 168;
  return Math.floor(hours);
}

export function expiresAtFromTtlHours(hours: number): string {
  const h = clampInviteTtlHours(hours);
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

export function getInternalStaffInviteExpiresAtIso(): string {
  return expiresAtFromTtlHours(getInternalStaffInviteTtlHours());
}
