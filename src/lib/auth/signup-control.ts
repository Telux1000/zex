import type { SupabaseClient } from '@supabase/supabase-js';
import { hashInviteToken } from '@/lib/invite-token';

export const SIGNUP_MODES = ['OPEN', 'CLOSED', 'INVITE_ONLY'] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export type SignupSettings = {
  signup_mode: SignupMode;
  signup_message: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

const DEFAULT_SIGNUP_SETTINGS: SignupSettings = {
  signup_mode: 'OPEN',
  signup_message: null,
  updated_at: null,
  updated_by: null,
};

const INVITE_TTL_MS_DEFAULT = 7 * 24 * 60 * 60 * 1000;

export function normalizeSignupMode(value: unknown): SignupMode {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase();
  if ((SIGNUP_MODES as readonly string[]).includes(raw)) return raw as SignupMode;
  return 'OPEN';
}

function normalizeSignupMessage(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v ? v.slice(0, 2000) : null;
}

export function mergeSignupSettingsRow(row: Record<string, unknown> | null): SignupSettings {
  if (!row) return { ...DEFAULT_SIGNUP_SETTINGS };
  return {
    signup_mode: normalizeSignupMode(row.signup_mode),
    signup_message: normalizeSignupMessage(row.signup_message),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
  };
}

export async function fetchSignupSettings(admin: SupabaseClient): Promise<SignupSettings> {
  const { data } = await admin.from('app_settings').select('*').eq('id', 'default').maybeSingle();
  return mergeSignupSettingsRow((data ?? null) as Record<string, unknown> | null);
}

export type SignupPolicyResult =
  | { ok: true; inviteIdToConsume: string | null }
  | { ok: false; status: 403; error: 'Signups are currently disabled' | 'Invite required to register' };

export async function validateSignupAccess(params: {
  admin: SupabaseClient;
  mode: SignupMode;
  email?: string | null;
  inviteToken?: string | null;
}): Promise<SignupPolicyResult> {
  const inviteToken = String(params.inviteToken ?? '').trim();
  if (params.mode === 'OPEN') return { ok: true, inviteIdToConsume: null };
  if (params.mode === 'CLOSED') {
    return { ok: false, status: 403, error: 'Signups are currently disabled' };
  }
  if (!inviteToken) {
    return { ok: false, status: 403, error: 'Invite required to register' };
  }

  const tokenHash = hashInviteToken(inviteToken);
  const { data: invite } = await params.admin
    .from('signup_invites')
    .select('id, email, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!invite) {
    return { ok: false, status: 403, error: 'Invite required to register' };
  }
  if (invite.used_at) {
    return { ok: false, status: 403, error: 'Invite required to register' };
  }
  const inviteEmail = invite.email ? String(invite.email).trim().toLowerCase() : '';
  const reqEmail = String(params.email ?? '')
    .trim()
    .toLowerCase();
  if (inviteEmail && reqEmail && inviteEmail !== reqEmail) {
    return { ok: false, status: 403, error: 'Invite required to register' };
  }
  const expiresAt = new Date(invite.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, status: 403, error: 'Invite required to register' };
  }
  return { ok: true, inviteIdToConsume: String(invite.id) };
}

export async function consumeSignupInvite(params: {
  admin: SupabaseClient;
  inviteId: string;
  userId?: string | null;
}) {
  const now = new Date().toISOString();
  const { data } = await params.admin
    .from('signup_invites')
    .update({ used_at: now, used_by: params.userId ?? null })
    .eq('id', params.inviteId)
    .is('used_at', null)
    .select('id')
    .maybeSingle();
  return Boolean(data?.id);
}

export function signupInviteExpiryIso(ttlMs: number = INVITE_TTL_MS_DEFAULT): string {
  return new Date(Date.now() + ttlMs).toISOString();
}
