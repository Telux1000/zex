import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { loadInternalStaffDirectory } from '@/lib/admin/internal-staff-directory-query';
import { mapUserIdsToMfaStatus } from '@/lib/admin/internal-staff-mfa';
import {
  fetchInternalSecuritySettings,
  type InternalSecuritySettingsDTO,
} from '@/lib/admin/internal-security-settings';
import { HIGH_SIGNAL_SECURITY_ACTIONS } from '@/lib/admin/security-activity-filters';
import { enrichAdminAuditLogsForConsole, type AdminAuditLogRow } from '@/lib/admin/admin-audit-display';

const MS_DAY = 86400000;

async function countAuditSince(
  admin: ReturnType<typeof getSupabaseServiceAdmin>,
  action: string,
  sinceIso: string
): Promise<number> {
  if (!admin) return 0;
  const { count, error } = await admin
    .from('admin_audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', action)
    .gte('created_at', sinceIso);
  if (error) return 0;
  return count ?? 0;
}

async function countAuditInActionsSince(
  admin: ReturnType<typeof getSupabaseServiceAdmin>,
  actions: readonly string[],
  sinceIso: string
): Promise<number> {
  if (!admin || actions.length === 0) return 0;
  const { count, error } = await admin
    .from('admin_audit_logs')
    .select('id', { count: 'exact', head: true })
    .in('action', [...actions])
    .gte('created_at', sinceIso);
  if (error) return 0;
  return count ?? 0;
}

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const now = Date.now();
  const since7d = new Date(now - 7 * MS_DAY).toISOString();
  const since30d = new Date(now - 30 * MS_DAY).toISOString();

  let policies: InternalSecuritySettingsDTO;
  let staffDirectory: Awaited<ReturnType<typeof loadInternalStaffDirectory>>;
  try {
    policies = await fetchInternalSecuritySettings(admin);
    staffDirectory = await loadInternalStaffDirectory(admin);
  } catch (e) {
    console.error('[admin/security]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load directory' }, { status: 500 });
  }

  const mfaByUser = await mapUserIdsToMfaStatus(
    admin,
    staffDirectory.staff.map((s) => String(s.user_id))
  );

  const staffWithMfa = staffDirectory.staff.map((s) => {
    const { auth_banned_until: _b, ...rest } = s;
    return {
      ...rest,
      mfa_status: mfaByUser.get(String(s.user_id)) ?? 'unknown',
    };
  });

  const pendingInvites = staffDirectory.invites.filter((i) => i.status === 'pending').length;
  const staffWithoutMfa = staffWithMfa.filter((s) => s.status === 'active' && s.mfa_status === 'none').length;
  const suspendedStaff = staffWithMfa.filter((s) => s.status === 'suspended').length;

  const [
    roleChanges30d,
    securitySignals7d,
    inviteEvents30d,
    passwordResets30d,
  ] = await Promise.all([
    countAuditSince(admin, 'internal_staff_role_changed', since30d),
    countAuditInActionsSince(admin, HIGH_SIGNAL_SECURITY_ACTIONS, since7d),
    countAuditInActionsSince(
      admin,
      [
        'internal_staff_invite_created',
        'internal_staff_invite_resent',
        'internal_staff_invite_revoked',
        'internal_staff_invite_accepted',
      ],
      since30d
    ),
    countAuditSince(admin, 'admin_subscriber_password_reset_sent', since30d),
  ]);

  const { data: recentAuditRows, error: recentAuditErr } = await admin
    .from('admin_audit_logs')
    .select('id, actor_user_id, actor_role, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  if (recentAuditErr) {
    return NextResponse.json({ error: recentAuditErr.message }, { status: 500 });
  }

  const recentAuditEnriched = await enrichAdminAuditLogsForConsole(
    admin,
    (recentAuditRows ?? []) as AdminAuditLogRow[]
  );

  const loginSnapshot = (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users ?? [];
  const internalEmails = new Set(staffWithMfa.map((s) => s.email.toLowerCase()));
  const loginForInternal = loginSnapshot
    .filter((u) => u.email && internalEmails.has(String(u.email).toLowerCase()))
    .map((u) => ({
      user_id: u.id,
      email: u.email ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      suspended: Boolean(u.banned_until),
    }))
    .sort((a, b) => {
      const aTime = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
      const bTime = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
      return bTime - aTime;
    });

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_security',
    metadata: {
      staff: staffWithMfa.length,
      pending_invites: pendingInvites,
      staff_without_mfa: staffWithoutMfa,
    },
  });

  return NextResponse.json({
    capabilities: {
      canEditPolicies: adminRole === 'owner',
    },
    policies,
    overview: {
      failed_logins: null as null,
      failed_logins_note:
        'Failed sign-in attempts are not stored in-app. Use Supabase Auth logs, Logflare, or your IdP for brute-force monitoring.',
      pending_invites: pendingInvites,
      staff_without_mfa: staffWithoutMfa,
      role_changes_30d: roleChanges30d,
      suspended_internal_staff: suspendedStaff,
      security_signals_7d: securitySignals7d,
      invite_events_30d: inviteEvents30d,
      password_resets_30d: passwordResets30d,
    },
    staff_access: staffWithMfa,
    invites: staffDirectory.invites,
    recent_audit_logs: recentAuditEnriched,
    login_snapshot: loginForInternal,
  });
}
