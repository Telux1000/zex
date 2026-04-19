import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { BUSINESS_MEMBER_ROLES } from '@/lib/rbac/types';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { buildInviteAcceptUrl, generateInvitePlainToken, hashInviteToken } from '@/lib/invite-token';
import { deliverTeamInviteEmail } from '@/lib/team-invite-postmark';
import { canInviteRole } from '@/lib/team/rules';
import { insertTeamAuditLog } from '@/lib/team/audit';

const INVITE_TTL_MS = 15 * 60 * 1000;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  staff: 'Staff',
  viewer: 'Viewer',
};

async function findAuthUserIdByEmail(admin: NonNullable<ReturnType<typeof getSupabaseServiceAdmin>>, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return { userId: null as string | null, error: error.message };
  const u = data?.users?.find((x) => (x.email ?? '').toLowerCase() === email);
  return { userId: u?.id ?? null, error: null as string | null };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId } = await params;
  const gate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_users');
  if (!gate.ok) return gate.response;

  const body = await req.json();
  const email = body.email != null ? String(body.email).trim().toLowerCase() : '';
  const role = body.role != null ? String(body.role).trim().toLowerCase() : '';
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!(BUSINESS_MEMBER_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }
  if (!canInviteRole(gate.role, role as (typeof BUSINESS_MEMBER_ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Server missing SUPABASE_SERVICE_ROLE_KEY; cannot invite by email.' },
      { status: 503 }
    );
  }

  if (!process.env.POSTMARK_SERVER_TOKEN?.trim()) {
    return NextResponse.json(
      { error: 'POSTMARK_SERVER_TOKEN is required to send team invitations.' },
      { status: 503 }
    );
  }

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('owner_id, name')
    .eq('id', businessId)
    .single();
  if (bizErr || !biz) {
    return NextResponse.json({ error: bizErr?.message ?? 'Business not found' }, { status: 404 });
  }

  const { userId: existingId, error: listErr } = await findAuthUserIdByEmail(admin, email);
  if (listErr) return NextResponse.json({ error: listErr }, { status: 500 });

  if (existingId && existingId === biz.owner_id) {
    return NextResponse.json({ error: 'Owner is already on this business' }, { status: 400 });
  }

  if (existingId) {
    const { data: row } = await supabase
      .from('business_members')
      .select('user_id')
      .eq('business_id', businessId)
      .eq('user_id', existingId)
      .maybeSingle();
    if (row) {
      return NextResponse.json({ error: 'This user is already on the team' }, { status: 400 });
    }
  }

  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, account_number')
    .eq('id', user.id)
    .maybeSingle();
  const inviterName =
    (prof?.full_name && String(prof.full_name).trim()) || user.email || 'A teammate';
  const roleLabel = ROLE_LABELS[role] ?? role;

  const plainToken = generateInvitePlainToken();
  const tokenHash = hashInviteToken(plainToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  await admin
    .from('business_team_invites')
    .update({ expires_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('email', email)
    .is('accepted_at', null);

  const { data: inserted, error: insErr } = await admin
    .from('business_team_invites')
    .insert({
      business_id: businessId,
      email,
      role,
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? 'Could not create invitation' }, { status: 500 });
  }

  const inviteUrl = buildInviteAcceptUrl(plainToken);
  const pm = await deliverTeamInviteEmail({
    to: email,
    inviteUrl,
    businessName: biz.name,
    inviterName,
    roleLabel,
    businessId,
  });

  if (!pm.ok) {
    await admin.from('business_team_invites').delete().eq('id', inserted.id);
    return NextResponse.json(
      { error: pm.error ?? 'Failed to send invitation email' },
      { status: 502 }
    );
  }

  await insertTeamAuditLog({
    supabase: admin,
    businessId,
    entityId: inserted.id,
    action: 'user_invited',
    performedByUserId: user.id,
    performedByName: inviterName,
    actorAccountNumber: prof?.account_number ? String(prof.account_number).trim() || null : null,
    metadata: { inviteId: inserted.id, email, role },
  });

  return NextResponse.json({ ok: true, invite_id: inserted.id });
}
