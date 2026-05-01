import type { SupabaseClient } from '@supabase/supabase-js';
import { hashInviteToken } from '@/lib/invite-token';

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function waitlistInviteExpiresAtIso(): string {
  return new Date(Date.now() + INVITE_TTL_MS).toISOString();
}

export async function validateWaitlistInviteForSignup(
  admin: SupabaseClient,
  plainToken: string,
  emailNormalized: string
): Promise<{ ok: true; waitlistId: string } | { ok: false; reason: string }> {
  const token = plainToken.trim();
  if (!token || !emailNormalized) {
    return { ok: false, reason: 'missing' };
  }
  const hash = hashInviteToken(token);
  const { data, error } = await admin
    .from('waitlist')
    .select('id, email, status, invite_token_expires_at')
    .eq('invite_token_hash', hash)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: 'not_found' };
  }
  if (String(data.status) !== 'invited') {
    return { ok: false, reason: 'status' };
  }
  const exp = data.invite_token_expires_at ? new Date(String(data.invite_token_expires_at)).getTime() : 0;
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (String(data.email).trim().toLowerCase() !== emailNormalized.trim().toLowerCase()) {
    return { ok: false, reason: 'email_mismatch' };
  }
  return { ok: true, waitlistId: String(data.id) };
}

export async function fetchWaitlistInvitePreview(
  admin: SupabaseClient,
  plainToken: string
): Promise<{ ok: true; email: string } | { ok: false }> {
  const token = plainToken.trim();
  if (!token) return { ok: false };
  const hash = hashInviteToken(token);
  const { data, error } = await admin
    .from('waitlist')
    .select('email, status, invite_token_expires_at')
    .eq('invite_token_hash', hash)
    .maybeSingle();
  if (error || !data) return { ok: false };
  if (String(data.status) !== 'invited') return { ok: false };
  const exp = data.invite_token_expires_at ? new Date(String(data.invite_token_expires_at)).getTime() : 0;
  if (!Number.isFinite(exp) || exp <= Date.now()) return { ok: false };
  return { ok: true, email: String(data.email) };
}
