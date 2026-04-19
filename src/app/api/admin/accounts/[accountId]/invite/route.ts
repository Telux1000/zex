import { NextResponse } from 'next/server';
import {
  adminRoleToDbRole,
  adminRoleLabel,
  dbRoleToAdminRole,
  type AdminAssignableMemberRole,
} from '@/lib/admin/account-member-roles';
import { isAssignableMemberRole } from '@/lib/admin/account-member-role-policy';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { buildInviteAcceptUrl, generateInvitePlainToken, hashInviteToken } from '@/lib/invite-token';
import { deliverTeamInviteEmail } from '@/lib/team-invite-postmark';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { accountId } = await params;
  const body = (await req.json()) as { email?: string; role?: AdminAssignableMemberRole };
  const email = String(body.email ?? '').trim().toLowerCase();
  const roleParam = body.role;
  const dbRole = roleParam && isAssignableMemberRole(roleParam) ? adminRoleToDbRole(roleParam) : '';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
  }
  if (!dbRole) return NextResponse.json({ error: 'Role must be admin, accountant, member, or support.' }, { status: 400 });

  const { data: business, error: bErr } = await admin
    .from('businesses')
    .select('id, name')
    .eq('id', accountId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!business) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const plainToken = generateInvitePlainToken();
  const tokenHash = hashInviteToken(plainToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  await admin
    .from('business_team_invites')
    .update({ expires_at: new Date().toISOString() })
    .eq('business_id', accountId)
    .eq('email', email)
    .is('accepted_at', null);

  const { data: inserted, error: insErr } = await admin
    .from('business_team_invites')
    .insert({
      business_id: accountId,
      email,
      role: dbRole,
      token_hash: tokenHash,
      invited_by: gate.user.id,
      expires_at: expiresAt,
    })
    .select('id')
    .maybeSingle();

  if (insErr || !inserted?.id) {
    return NextResponse.json({ error: insErr?.message ?? 'Failed to create invite.' }, { status: 500 });
  }

  const { data: actorProfile } = await admin.from('profiles').select('full_name').eq('id', gate.user.id).maybeSingle();
  const inviterName =
    (actorProfile?.full_name && String(actorProfile.full_name).trim()) || gate.user.email || 'Zenzex admin';

  const emailResult = await deliverTeamInviteEmail({
    to: email,
    inviteUrl: buildInviteAcceptUrl(plainToken),
    businessName: String(business.name ?? 'Account'),
    inviterName,
    roleLabel: adminRoleLabel(dbRoleToAdminRole(dbRole)),
    businessId: String(accountId),
  });

  if (!emailResult.ok) {
    await admin.from('business_team_invites').delete().eq('id', inserted.id);
    return NextResponse.json({ error: emailResult.error ?? 'Failed to send invite email.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
