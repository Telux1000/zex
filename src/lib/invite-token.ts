import { createHash, randomBytes } from 'crypto';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';

const TOKEN_BYTES = 32;

export function generateInvitePlainToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashInviteToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function buildInviteAcceptUrl(plainToken: string): string {
  const base = resolveAppBaseUrl() ?? '';
  if (!base) return `/invite/accept?token=${encodeURIComponent(plainToken)}`;
  return `${base}/invite/accept?token=${encodeURIComponent(plainToken)}`;
}

export function buildSignupInviteUrl(plainToken: string): string {
  const base = resolveAppBaseUrl() ?? '';
  const suffix = `/signup?invite=${encodeURIComponent(plainToken)}`;
  if (!base) return suffix;
  return `${base}${suffix}`;
}

export function buildInternalStaffInviteUrl(plainToken: string): string {
  const base = resolveAppBaseUrl() ?? '';
  if (!base) return `/invite/staff?token=${encodeURIComponent(plainToken)}`;
  return `${base}/invite/staff?token=${encodeURIComponent(plainToken)}`;
}
