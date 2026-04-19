import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  canManageInvites,
  canManageStaffMembers,
  canViewTeam,
} from '@/lib/admin/team-permissions';
import { loadInternalStaffDirectory } from '@/lib/admin/internal-staff-directory-query';

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  if (!canViewTeam(adminRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  let raw;
  try {
    raw = await loadInternalStaffDirectory(admin);
  } catch (e) {
    console.error('[admin/team]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load team' }, { status: 500 });
  }

  const staff = raw.staff.map(({ auth_banned_until: _b, ...rest }) => rest);

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_team',
    metadata: { staff: staff.length, invites: raw.invites.length },
  });

  return NextResponse.json({
    staff,
    invites: raw.invites,
    actorRole: adminRole,
    capabilities: {
      canInvite: canManageInvites(adminRole),
      canResendOrRevokeInvite: canManageInvites(adminRole),
      canChangeRoles: canManageStaffMembers(adminRole),
      canDeactivate: canManageStaffMembers(adminRole),
    },
  });
}
