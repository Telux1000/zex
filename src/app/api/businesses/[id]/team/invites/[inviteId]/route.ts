import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { buildInviteAcceptUrl, generateInvitePlainToken, hashInviteToken } from '@/lib/invite-token';
import { deliverTeamInviteEmail } from '@/lib/team-invite-postmark';
import { canInviteRole } from '@/lib/team/rules';
import type { BusinessMemberRole } from '@/lib/rbac/types';
import { insertTeamAuditLog } from '@/lib/team/audit';

const INVITE_TTL_MS = 15 * 60 * 1000;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  staff: 'Staff',
  viewer: 'Viewer',
};

type InviteRow = {
  id: string;
  business_id: string;
  email: string;
  role: string;
  invited_by: string;
  accepted_at: string | null;
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId, inviteId } = await params;
  const gate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_users');
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: row, error } = await admin
    .from('business_team_invites')
    .select('id, business_id, email, role, invited_by, accepted_at')
    .eq('business_id', businessId)
    .eq('id', inviteId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row || row.accepted_at) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (!canInviteRole(gate.role, row.role as BusinessMemberRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const newToken = generateInvitePlainToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { error: updErr } = await admin
    .from('business_team_invites')
    .update({ token_hash: hashInviteToken(newToken), expires_at: expiresAt })
    .eq('id', inviteId)
    .is('accepted_at', null);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const { data: biz } = await admin.from('businesses').select('name').eq('id', businessId).maybeSingle();
  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('full_name, email, account_number')
    .eq('id', user.id)
    .maybeSingle();
  const inviterName =
    (actorProfile?.full_name && String(actorProfile.full_name).trim()) ||
    actorProfile?.email ||
    user.email ||
    'A teammate';
  const actorAccountNumber = actorProfile?.account_number
    ? String(actorProfile.account_number).trim() || null
    : null;

  const pm = await deliverTeamInviteEmail({
    to: row.email,
    inviteUrl: buildInviteAcceptUrl(newToken),
    businessName: biz?.name ?? 'Workspace',
    inviterName,
    roleLabel: ROLE_LABELS[row.role] ?? row.role,
    businessId,
  });
  if (!pm.ok) return NextResponse.json({ error: pm.error ?? 'Failed to send invite' }, { status: 502 });

  await insertTeamAuditLog({
    supabase: admin,
    businessId,
    entityId: inviteId,
    action: 'invite_resent',
    performedByUserId: user.id,
    performedByName: inviterName,
    actorAccountNumber,
    metadata: { inviteId, email: row.email, role: row.role },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId, inviteId } = await params;
  const gate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_users');
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: row, error } = await admin
    .from('business_team_invites')
    .select('id, business_id, email, role, invited_by, accepted_at')
    .eq('business_id', businessId)
    .eq('id', inviteId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row || row.accepted_at) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  if (!canInviteRole(gate.role, row.role as BusinessMemberRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: delErr } = await admin
    .from('business_team_invites')
    .delete()
    .eq('business_id', businessId)
    .eq('id', inviteId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data: actorProfileDel } = await supabase
    .from('profiles')
    .select('full_name, email, account_number')
    .eq('id', user.id)
    .maybeSingle();
  const performer =
    (actorProfileDel?.full_name && String(actorProfileDel.full_name).trim()) ||
    actorProfileDel?.email ||
    user.email ||
    'A teammate';
  const actorAccountNumberDel = actorProfileDel?.account_number
    ? String(actorProfileDel.account_number).trim() || null
    : null;

  await insertTeamAuditLog({
    supabase: admin,
    businessId,
    entityId: inviteId,
    action: 'invite_revoked',
    performedByUserId: user.id,
    performedByName: performer,
    actorAccountNumber: actorAccountNumberDel,
    metadata: { inviteId, email: row.email, role: row.role },
  });

  return NextResponse.json({ ok: true });
}

