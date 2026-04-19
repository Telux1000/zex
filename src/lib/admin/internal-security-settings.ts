import type { SupabaseClient } from '@supabase/supabase-js';
import { clampInviteTtlHours, getInternalStaffInviteTtlHours } from '@/lib/internal-staff-invite-ttl';

export type PasswordResetPolicy = 'standard' | 'strict';

export type InternalSecuritySettingsDTO = {
  require_mfa_for_internal_staff: boolean;
  invite_ttl_hours: number;
  session_timeout_minutes: number | null;
  password_reset_policy: PasswordResetPolicy;
  staff_invite_allowed_domains: string[];
  updated_at: string | null;
  updated_by_user_id: string | null;
};

const DEFAULT_ROW: InternalSecuritySettingsDTO = {
  require_mfa_for_internal_staff: false,
  invite_ttl_hours: 72,
  session_timeout_minutes: null,
  password_reset_policy: 'standard',
  staff_invite_allowed_domains: [],
  updated_at: null,
  updated_by_user_id: null,
};

function normalizeDomains(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function mergeSecuritySettingsRow(row: Record<string, unknown> | null): InternalSecuritySettingsDTO {
  if (!row) return { ...DEFAULT_ROW };
  const pr = row.password_reset_policy;
  const policy: PasswordResetPolicy = pr === 'strict' ? 'strict' : 'standard';
  return {
    require_mfa_for_internal_staff: Boolean(row.require_mfa_for_internal_staff),
    invite_ttl_hours: clampInviteTtlHours(Number(row.invite_ttl_hours) || 72),
    session_timeout_minutes:
      row.session_timeout_minutes === null || row.session_timeout_minutes === undefined
        ? null
        : Number.isFinite(Number(row.session_timeout_minutes))
          ? Number(row.session_timeout_minutes)
          : null,
    password_reset_policy: policy,
    staff_invite_allowed_domains: normalizeDomains(row.staff_invite_allowed_domains),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    updated_by_user_id: row.updated_by_user_id ? String(row.updated_by_user_id) : null,
  };
}

export async function fetchInternalSecuritySettings(
  admin: SupabaseClient
): Promise<InternalSecuritySettingsDTO> {
  const { data, error } = await admin.from('internal_security_settings').select('*').eq('id', 'default').maybeSingle();
  if (error || !data) {
    return {
      ...DEFAULT_ROW,
      invite_ttl_hours: getInternalStaffInviteTtlHours(),
    };
  }
  return mergeSecuritySettingsRow(data as Record<string, unknown>);
}

export function isEmailAllowedForStaffInvite(email: string, allowedDomains: string[]): boolean {
  if (!allowedDomains.length) return true;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return allowedDomains.some((d) => domain === d.toLowerCase());
}
