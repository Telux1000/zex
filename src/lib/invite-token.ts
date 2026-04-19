import { createHash, randomBytes } from 'crypto';

const TOKEN_BYTES = 32;

export function generateInvitePlainToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashInviteToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function buildInviteAcceptUrl(plainToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  if (!base) return `/invite/accept?token=${encodeURIComponent(plainToken)}`;
  return `${base}/invite/accept?token=${encodeURIComponent(plainToken)}`;
}

export function buildInternalStaffInviteUrl(plainToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  if (!base) return `/invite/staff?token=${encodeURIComponent(plainToken)}`;
  return `${base}/invite/staff?token=${encodeURIComponent(plainToken)}`;
}
