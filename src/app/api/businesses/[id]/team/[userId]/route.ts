import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission, getEffectiveBusinessRole } from '@/lib/rbac/server';
import { BUSINESS_MEMBER_ROLES, type BusinessMemberRole } from '@/lib/rbac/types';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { canChangeRole, canManageMember } from '@/lib/team/rules';
import { profileDisplayNameFromProfileRow } from '@/lib/audit-log';
import { insertTeamAuditLog } from '@/lib/team/audit';
import { sendSubscriberPasswordResetEmail } from '@/lib/team/subscriber-password-reset';

type PatchBody =
  | { role?: string }
  | { action?: 'suspend' | 'reactivate' | 'password_reset' };

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId, userId: targetUserId } = await params;
  const gate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_users');
  if (!gate.ok) return gate.response;

  const actorRole = gate.role;
  const targetRole = await getEffectiveBusinessRole(supabase, businessId, targetUserId);
  if (!targetRole) return NextResponse.json({ error: 'User not found in this business' }, { status: 404 });

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, full_name, email, account_number')
    .in('id', [user.id, targetUserId]);
  const profileById = new Map((profileRows ?? []).map((p) => [String(p.id), p]));
  const targetProfile = profileById.get(targetUserId);
  const actorProfile = profileById.get(user.id);
  const targetFull = String(targetProfile?.full_name ?? '').trim();
  const targetLabel = profileDisplayNameFromProfileRow(targetProfile);
  const teamAuditBaseMeta: Record<string, unknown> = { targetUserId };
  if (targetFull) {
    teamAuditBaseMeta.full_name = targetFull;
    teamAuditBaseMeta.target_name = targetFull;
  } else if (targetLabel) {
    teamAuditBaseMeta.target_name = targetLabel;
  }
  const targetNameSnapshot = targetFull || targetLabel || null;
  const targetAccountNumber = targetProfile?.account_number
    ? String(targetProfile.account_number).trim() || null
    : null;
  const actorAccountNumber = actorProfile?.account_number
    ? String(actorProfile.account_number).trim() || null
    : null;

  const body = (await req.json()) as PatchBody;
  const action = 'action' in body ? body.action : undefined;

  const performedByName =
    (actorProfile?.full_name && String(actorProfile.full_name).trim()) ||
    actorProfile?.email ||
    user.email ||
    'Unknown';

  if (action === 'suspend' || action === 'reactivate') {
    if (!canManageMember({ actorRole, actorUserId: user.id, targetUserId, targetRole })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (targetRole === 'owner') {
      return NextResponse.json({ error: 'Cannot suspend owner' }, { status: 400 });
    }

    const suspendedAt = action === 'suspend' ? new Date().toISOString() : null;
    const { error } = await supabase
      .from('business_members')
      .update({ suspended_at: suspendedAt })
      .eq('business_id', businessId)
      .eq('user_id', targetUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const statusAction = action === 'suspend' ? 'user_suspended' : 'user_reactivated';
    await insertTeamAuditLog({
      supabase: getSupabaseServiceAdmin() ?? supabase,
      businessId,
      entityId: targetUserId,
      action: statusAction,
      performedByUserId: user.id,
      performedByName,
      actorAccountNumber,
      targetUserId,
      targetAccountNumber,
      targetNameSnapshot,
      metadata: teamAuditBaseMeta,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === 'password_reset') {
    if (!canManageMember({ actorRole, actorUserId: user.id, targetUserId, targetRole })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sendResult = await sendSubscriberPasswordResetEmail({ targetUserId, businessId });
    if (!sendResult.ok) {
      return NextResponse.json({ error: sendResult.error }, { status: sendResult.status });
    }
    const admin = getSupabaseServiceAdmin();
    if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

    await insertTeamAuditLog({
      supabase: admin,
      businessId,
      entityId: targetUserId,
      action: 'password_reset_sent',
      performedByUserId: user.id,
      performedByName,
      actorAccountNumber,
      targetUserId,
      targetAccountNumber,
      targetNameSnapshot,
      metadata: teamAuditBaseMeta,
    });
    return NextResponse.json({ ok: true });
  }

  const role = 'role' in body && body.role != null ? String(body.role).trim().toLowerCase() : '';
  if (!(BUSINESS_MEMBER_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }
  const nextRole = role as BusinessMemberRole;
  if (
    !canChangeRole({
      actorRole,
      actorUserId: user.id,
      targetUserId,
      targetRole,
      nextRole,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('business_members')
    .update({ role: nextRole })
    .eq('business_id', businessId)
    .eq('user_id', targetUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await insertTeamAuditLog({
    supabase: getSupabaseServiceAdmin() ?? supabase,
    businessId,
    entityId: targetUserId,
    action: 'role_changed',
    performedByUserId: user.id,
    performedByName,
    actorAccountNumber,
    targetUserId,
    targetAccountNumber,
    targetNameSnapshot,
    metadata: { ...teamAuditBaseMeta, fromRole: targetRole, toRole: nextRole },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId, userId: targetUserId } = await params;
  const gate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_users');
  if (!gate.ok) return gate.response;

  const targetRole = await getEffectiveBusinessRole(supabase, businessId, targetUserId);
  if (!targetRole) return NextResponse.json({ error: 'User not found in this business' }, { status: 404 });
  if (!canManageMember({ actorRole: gate.role, actorUserId: user.id, targetUserId, targetRole })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (targetRole === 'owner') {
    return NextResponse.json({ error: 'Cannot remove owner' }, { status: 400 });
  }

  const { error } = await supabase
    .from('business_members')
    .delete()
    .eq('business_id', businessId)
    .eq('user_id', targetUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

