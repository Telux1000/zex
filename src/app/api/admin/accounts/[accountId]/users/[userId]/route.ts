import { NextResponse } from 'next/server';
import { adminRoleToDbRole, type AdminAssignableMemberRole } from '@/lib/admin/account-member-roles';
import { validateMemberRoleChange } from '@/lib/admin/account-member-role-policy';
import { isWorkspaceAssignableRole } from '@/lib/roles/workspace-roles';
import {
  deriveMemberUserStatus,
  deriveOwnerUserStatus,
  canManageSubscriberLifecycle,
} from '@/lib/admin/account-lifecycle';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { profileDisplayNameFromProfileRow } from '@/lib/audit-log';
import { insertTeamAuditLog } from '@/lib/team/audit';
import { sendSubscriberPasswordResetEmail } from '@/lib/team/subscriber-password-reset';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import type { SupabaseClient } from '@supabase/supabase-js';

type Body = {
  action?: 'suspend' | 'reactivate' | 'deactivate' | 'remove' | 'password_reset';
  role?: AdminAssignableMemberRole;
};

function auditForUserAction(
  action: 'suspend' | 'reactivate' | 'deactivate'
): 'admin_subscriber_user_suspended' | 'admin_subscriber_user_reactivated' | 'admin_subscriber_user_deactivated' {
  if (action === 'suspend') return 'admin_subscriber_user_suspended';
  if (action === 'deactivate') return 'admin_subscriber_user_deactivated';
  return 'admin_subscriber_user_reactivated';
}

/** Subscriber-visible workspace audit row: internal staff actor uses B-code metadata, not Z-code on actor. */
async function insertSubscriberLifecycleTeamAudit(params: {
  admin: SupabaseClient;
  accountId: string;
  userId: string;
  lifecycleAction: 'suspend' | 'reactivate' | 'deactivate';
  actorUserId: string;
  actorFallbackEmail: string | null | undefined;
  targetProf: {
    full_name?: string | null;
    email?: string | null;
    account_number?: string | null;
  } | null;
}) {
  const teamAction =
    params.lifecycleAction === 'suspend'
      ? 'user_suspended'
      : params.lifecycleAction === 'reactivate'
        ? 'user_reactivated'
        : 'user_deactivated';

  const { data: actorProf } = await params.admin
    .from('profiles')
    .select('full_name, email, internal_staff_code')
    .eq('id', params.actorUserId)
    .maybeSingle();
  const performedByName =
    (actorProf?.full_name && String(actorProf.full_name).trim()) ||
    actorProf?.email ||
    params.actorFallbackEmail ||
    'Unknown';
  const internalCode = actorProf?.internal_staff_code ? String(actorProf.internal_staff_code).trim() || null : null;

  const tp = params.targetProf;
  const targetFull = String(tp?.full_name ?? '').trim();
  const targetLabel = profileDisplayNameFromProfileRow(tp);
  const teamAuditBaseMeta: Record<string, unknown> = { targetUserId: params.userId, source: 'internal_admin' };
  if (targetFull) {
    teamAuditBaseMeta.full_name = targetFull;
    teamAuditBaseMeta.target_name = targetFull;
  } else if (targetLabel) {
    teamAuditBaseMeta.target_name = targetLabel;
  }

  await insertTeamAuditLog({
    supabase: params.admin,
    businessId: params.accountId,
    entityId: params.userId,
    action: teamAction,
    performedByUserId: params.actorUserId,
    performedByName,
    actorKind: 'internal_admin',
    actorInternalCode: internalCode,
    actorAccountNumber: null,
    targetUserId: params.userId,
    targetAccountNumber: tp?.account_number ? String(tp.account_number).trim() || null : null,
    targetNameSnapshot: targetFull || targetLabel || null,
    metadata: teamAuditBaseMeta,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ accountId: string; userId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { accountId, userId } = await params;
  const body = (await req.json()) as Body;

  const { data: business, error: bErr } = await admin
    .from('businesses')
    .select('owner_id, name')
    .eq('id', accountId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!business) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const isOwner = String(business.owner_id) === userId;

  if (body.role) {
    if (!canManageSubscriberLifecycle(gate.adminRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (isOwner) {
      return NextResponse.json({ error: 'Cannot change the account owner role.' }, { status: 400 });
    }
    const r = body.role;
    if (!isWorkspaceAssignableRole(r)) {
      return NextResponse.json({ error: 'role must be admin, accountant, member, or support.' }, { status: 400 });
    }

    const { data: memberRows, error: mErr } = await admin
      .from('business_members')
      .select('user_id, role')
      .eq('business_id', accountId);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    const v = validateMemberRoleChange({
      businessOwnerId: String(business.owner_id),
      targetUserId: userId,
      newRole: r,
      memberRows: memberRows ?? [],
    });
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: v.status ?? 400 });
    }

    const { error } = await admin
      .from('business_members')
      .update({ role: adminRoleToDbRole(r) })
      .eq('business_id', accountId)
      .eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'password_reset') {
    if (!canManageSubscriberLifecycle(gate.adminRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isOwnerRow = isOwner;
    const { data: targetAuth } = await admin.auth.admin.getUserById(userId);
    const lastSignIn = targetAuth?.user?.last_sign_in_at ?? null;
    const { data: targetProf } = await admin
      .from('profiles')
      .select(
        'full_name, email, account_number, subscriber_admin_suspended_at, subscriber_admin_deactivated_at'
      )
      .eq('id', userId)
      .maybeSingle();

    if (isOwnerRow) {
      const current = deriveOwnerUserStatus({
        subscriber_admin_suspended_at: targetProf?.subscriber_admin_suspended_at ?? null,
        subscriber_admin_deactivated_at: targetProf?.subscriber_admin_deactivated_at ?? null,
        last_sign_in_at: lastSignIn,
      });
      if (current === 'deactivated') {
        return NextResponse.json({ error: 'Cannot send password reset for a deactivated user.' }, { status: 400 });
      }
    } else {
      const { data: memb, error: memErr } = await admin
        .from('business_members')
        .select('suspended_at, deactivated_at')
        .eq('business_id', accountId)
        .eq('user_id', userId)
        .maybeSingle();
      if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
      if (!memb) return NextResponse.json({ error: 'User is not a member of this account.' }, { status: 404 });
      const current = deriveMemberUserStatus({
        suspended_at: memb.suspended_at,
        deactivated_at: memb.deactivated_at,
        last_sign_in_at: lastSignIn,
      });
      if (current === 'deactivated') {
        return NextResponse.json({ error: 'Cannot send password reset for a deactivated user.' }, { status: 400 });
      }
    }

    const sendResult = await sendSubscriberPasswordResetEmail({ targetUserId: userId, businessId: accountId });
    if (!sendResult.ok) {
      return NextResponse.json({ error: sendResult.error }, { status: sendResult.status });
    }

    const { data: actorProf } = await admin
      .from('profiles')
      .select('full_name, email, account_number, internal_staff_code')
      .eq('id', gate.user.id)
      .maybeSingle();
    const performedByName =
      (actorProf?.full_name && String(actorProf.full_name).trim()) ||
      actorProf?.email ||
      gate.user.email ||
      'Unknown';
    const targetFull = String(targetProf?.full_name ?? '').trim();
    const targetLabel = profileDisplayNameFromProfileRow(targetProf);
    const teamAuditBaseMeta: Record<string, unknown> = { targetUserId: userId, source: 'internal_admin' };
    if (targetFull) {
      teamAuditBaseMeta.full_name = targetFull;
      teamAuditBaseMeta.target_name = targetFull;
    } else if (targetLabel) {
      teamAuditBaseMeta.target_name = targetLabel;
    }

    const internalCode = actorProf?.internal_staff_code ? String(actorProf.internal_staff_code).trim() || null : null;

    await insertTeamAuditLog({
      supabase: admin,
      businessId: accountId,
      entityId: userId,
      action: 'password_reset_sent',
      performedByUserId: gate.user.id,
      performedByName,
      actorKind: 'internal_admin',
      actorInternalCode: internalCode,
      actorAccountNumber: null,
      targetUserId: userId,
      targetAccountNumber: targetProf?.account_number ? String(targetProf.account_number).trim() || null : null,
      targetNameSnapshot: targetFull || targetLabel || null,
      metadata: teamAuditBaseMeta,
    });

    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: 'admin_subscriber_password_reset_sent',
      targetType: 'subscriber_user',
      targetId: userId,
      metadata: {
        accountId,
        accountName: business.name ?? null,
        targetEmail: sendResult.email,
        targetName: targetProf?.full_name ?? null,
        targetAccountNumber: targetProf?.account_number ? String(targetProf.account_number).trim() || null : null,
        role: isOwnerRow ? 'owner' : 'member',
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (!body.action) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  if (!canManageSubscriberLifecycle(gate.adminRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const action = body.action;
  if (action === 'remove') {
    if (isOwner) {
      return NextResponse.json({ error: 'Cannot remove the account owner.' }, { status: 400 });
    }
    const { error } = await admin
      .from('business_members')
      .delete()
      .eq('business_id', accountId)
      .eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action !== 'suspend' && action !== 'reactivate' && action !== 'deactivate') {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (isOwner) {
    const { data: prof } = await admin
      .from('profiles')
      .select('full_name, email, account_number, subscriber_admin_suspended_at, subscriber_admin_deactivated_at')
      .eq('id', userId)
      .maybeSingle();
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const lastSignIn = authUser?.user?.last_sign_in_at ?? null;
    const current = deriveOwnerUserStatus({
      subscriber_admin_suspended_at: prof?.subscriber_admin_suspended_at ?? null,
      subscriber_admin_deactivated_at: prof?.subscriber_admin_deactivated_at ?? null,
      last_sign_in_at: lastSignIn,
    });

    const allowed =
      action === 'suspend'
        ? current === 'active' || current === 'pending'
        : action === 'deactivate'
          ? current === 'active' || current === 'suspended' || current === 'pending'
          : current === 'suspended' || current === 'deactivated';

    if (!allowed) {
      return NextResponse.json({ error: 'Invalid transition for current user state.' }, { status: 400 });
    }

    const from = current;
    const patchProf =
      action === 'suspend'
        ? { subscriber_admin_suspended_at: now, subscriber_admin_deactivated_at: null as string | null }
        : action === 'deactivate'
          ? { subscriber_admin_deactivated_at: now, subscriber_admin_suspended_at: null as string | null }
          : { subscriber_admin_suspended_at: null as string | null, subscriber_admin_deactivated_at: null as string | null };

    const { error: pErr } = await admin.from('profiles').update(patchProf).eq('id', userId);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const banDuration =
      action === 'suspend' ? '336h' : action === 'deactivate' ? '876000h' : 'none';
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: banDuration,
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

    const to =
      action === 'suspend' ? 'suspended' : action === 'deactivate' ? 'deactivated' : 'active';

    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: auditForUserAction(action),
      targetType: 'subscriber_user',
      targetId: userId,
      metadata: {
        from,
        to,
        accountId,
        accountName: business.name ?? null,
        targetEmail: prof?.email ?? null,
        targetName: prof?.full_name ?? null,
        targetAccountNumber: prof?.account_number ? String(prof.account_number).trim() || null : null,
        role: 'owner',
      },
    });

    await insertSubscriberLifecycleTeamAudit({
      admin,
      accountId,
      userId,
      lifecycleAction: action,
      actorUserId: gate.user.id,
      actorFallbackEmail: gate.user.email,
      targetProf: prof,
    });

    return NextResponse.json({ ok: true, status: to });
  }

  const { data: row, error: mErr } = await admin
    .from('business_members')
    .select('suspended_at, deactivated_at')
    .eq('business_id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'User is not a member of this account.' }, { status: 404 });

  const { data: prof } = await admin
    .from('profiles')
    .select('full_name, email, account_number')
    .eq('id', userId)
    .maybeSingle();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const lastSignIn = authUser?.user?.last_sign_in_at ?? null;

  const current = deriveMemberUserStatus({
    suspended_at: row.suspended_at,
    deactivated_at: row.deactivated_at,
    last_sign_in_at: lastSignIn,
  });

  const allowed =
    action === 'suspend'
      ? current === 'active' || current === 'pending'
      : action === 'deactivate'
        ? current === 'active' || current === 'suspended' || current === 'pending'
        : current === 'suspended' || current === 'deactivated';

  if (!allowed) {
    return NextResponse.json({ error: 'Invalid transition for current user state.' }, { status: 400 });
  }

  const patchMem =
    action === 'suspend'
      ? { suspended_at: now, deactivated_at: null as string | null }
      : action === 'deactivate'
        ? { deactivated_at: now, suspended_at: null as string | null }
        : { suspended_at: null as string | null, deactivated_at: null as string | null };

  const { error: uErr } = await admin.from('business_members').update(patchMem).eq('business_id', accountId).eq('user_id', userId);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  const to = action === 'suspend' ? 'suspended' : action === 'deactivate' ? 'deactivated' : 'active';

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: auditForUserAction(action),
    targetType: 'subscriber_user',
    targetId: userId,
    metadata: {
      from: current,
      to,
      accountId,
      accountName: business.name ?? null,
      targetEmail: prof?.email ?? null,
      targetName: prof?.full_name ?? null,
      targetAccountNumber: prof?.account_number ? String(prof.account_number).trim() || null : null,
      role: 'member',
    },
  });

  await insertSubscriberLifecycleTeamAudit({
    admin,
    accountId,
    userId,
    lifecycleAction: action,
    actorUserId: gate.user.id,
    actorFallbackEmail: gate.user.email,
    targetProf: prof,
  });

  return NextResponse.json({ ok: true, status: to });
}
