import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import type { AdminRole } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { canModifyTargetStaff, canManageStaffMembers } from '@/lib/admin/team-permissions';

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  if (!canManageStaffMembers(adminRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = body.action === 'deactivate' || body.action === 'reactivate' ? body.action : null;
  if (!action) {
    return NextResponse.json({ error: 'action must be deactivate or reactivate.' }, { status: 400 });
  }

  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: 'Missing user id.' }, { status: 400 });

  if (userId === user.id) {
    return NextResponse.json({ error: 'You cannot change your own access from here.' }, { status: 403 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: target, error: tErr } = await admin
    .from('profiles')
    .select('internal_admin_role')
    .eq('id', userId)
    .maybeSingle();

  if (tErr || !target?.internal_admin_role) {
    return NextResponse.json({ error: 'User is not an internal team member.' }, { status: 404 });
  }

  const targetRole = String(target.internal_admin_role).toLowerCase() as AdminRole;
  if (targetRole === 'owner') {
    return NextResponse.json({ error: 'The owner account cannot be modified from this panel.' }, { status: 403 });
  }

  if (!canModifyTargetStaff(adminRole, targetRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = action === 'deactivate' ? new Date().toISOString() : null;

  const { error: upErr } = await admin
    .from('profiles')
    .update({ internal_admin_suspended_at: now })
    .eq('id', userId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: action === 'deactivate' ? 'internal_staff_deactivated' : 'internal_staff_reactivated',
    targetType: 'internal_staff',
    targetId: userId,
    metadata: { previous_role: targetRole },
  });

  return NextResponse.json({ ok: true });
}
