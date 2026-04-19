import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AdminRole } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import {
  fetchInternalSecuritySettings,
  mergeSecuritySettingsRow,
  type InternalSecuritySettingsDTO,
} from '@/lib/admin/internal-security-settings';
import { clampInviteTtlHours } from '@/lib/internal-staff-invite-ttl';
import { invalidateAllInternalStaffMfaCache } from '@/lib/admin/internal-mfa-gate';

export const internalSecurityPolicyPatchSchema = z
  .object({
    require_mfa_for_internal_staff: z.boolean().optional(),
    invite_ttl_hours: z.number().int().min(1).max(168).optional(),
    session_timeout_minutes: z.number().int().min(5).max(10080).nullable().optional(),
    password_reset_policy: z.enum(['standard', 'strict']).optional(),
    staff_invite_allowed_domains: z.array(z.string().min(1).max(128)).max(32).optional(),
  })
  .strict();

export type InternalSecurityPolicyPatch = z.infer<typeof internalSecurityPolicyPatchSchema>;

export function normalizeInternalSecurityDomainList(domains: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of domains) {
    const v = String(d).trim().toLowerCase().replace(/^@/, '');
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function persistInternalSecurityPolicyPatch(params: {
  admin: SupabaseClient;
  gate: { user: { id: string }; supabase: SupabaseClient; adminRole: AdminRole };
  patch: InternalSecurityPolicyPatch;
}): Promise<
  | { ok: true; policies: InternalSecuritySettingsDTO }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string[] | undefined> }
> {
  const { admin, gate, patch } = params;
  const before = await fetchInternalSecuritySettings(admin);

  const next: InternalSecuritySettingsDTO = {
    require_mfa_for_internal_staff:
      patch.require_mfa_for_internal_staff ?? before.require_mfa_for_internal_staff,
    invite_ttl_hours:
      patch.invite_ttl_hours !== undefined ? clampInviteTtlHours(patch.invite_ttl_hours) : before.invite_ttl_hours,
    session_timeout_minutes:
      patch.session_timeout_minutes !== undefined ? patch.session_timeout_minutes : before.session_timeout_minutes,
    password_reset_policy: patch.password_reset_policy ?? before.password_reset_policy,
    staff_invite_allowed_domains:
      patch.staff_invite_allowed_domains !== undefined
        ? normalizeInternalSecurityDomainList(patch.staff_invite_allowed_domains)
        : before.staff_invite_allowed_domains,
    updated_at: before.updated_at,
    updated_by_user_id: before.updated_by_user_id,
  };

  const { error: upErr } = await admin
    .from('internal_security_settings')
    .update({
      require_mfa_for_internal_staff: next.require_mfa_for_internal_staff,
      invite_ttl_hours: next.invite_ttl_hours,
      session_timeout_minutes: next.session_timeout_minutes,
      password_reset_policy: next.password_reset_policy,
      staff_invite_allowed_domains: next.staff_invite_allowed_domains,
      updated_at: new Date().toISOString(),
      updated_by_user_id: gate.user.id,
    })
    .eq('id', 'default');

  if (upErr) {
    console.error('[internal_security_settings]', upErr);
    return { ok: false, status: 500, error: upErr.message };
  }

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const keys: (keyof InternalSecuritySettingsDTO)[] = [
    'require_mfa_for_internal_staff',
    'invite_ttl_hours',
    'session_timeout_minutes',
    'password_reset_policy',
    'staff_invite_allowed_domains',
  ];
  for (const k of keys) {
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(next[k]);
    if (a !== b) changed[k] = { from: before[k], to: next[k] };
  }

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'internal_security_policy_updated',
    targetType: 'internal_security_settings',
    targetId: 'default',
    metadata: { changed },
  });

  invalidateAllInternalStaffMfaCache();

  const { data: row } = await admin.from('internal_security_settings').select('*').eq('id', 'default').maybeSingle();
  return { ok: true, policies: mergeSecuritySettingsRow((row ?? null) as Record<string, unknown> | null) };
}
