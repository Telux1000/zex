import { NextResponse } from 'next/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { buildInviteAcceptUrl, generateInvitePlainToken, hashInviteToken } from '@/lib/invite-token';
import { deliverTeamInviteEmail } from '@/lib/team-invite-postmark';

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

export async function POST(req: Request) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured.' }, { status: 503 });
  }

  if (!process.env.POSTMARK_SERVER_TOKEN?.trim()) {
    return NextResponse.json({ ok: false, error: 'Email service unavailable.' }, { status: 503 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const token = body.token != null ? String(body.token).trim() : '';
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing invitation token.' }, { status: 400 });
  }

  const oldHash = hashInviteToken(token);
  const { data: invite, error: invErr } = await admin
    .from('business_team_invites')
    .select('id, business_id, email, role, invited_by, accepted_at')
    .eq('token_hash', oldHash)
    .maybeSingle();

  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
  if (!invite) {
    return NextResponse.json({ ok: false, error: 'This link has expired or is no longer valid.' }, { status: 404 });
  }
  if ((invite as InviteRow).accepted_at) {
    return NextResponse.json({ ok: false, error: 'This link has expired or is no longer valid.' }, { status: 409 });
  }

  const row = invite as InviteRow;
  const newToken = generateInvitePlainToken();
  const newHash = hashInviteToken(newToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data: updated, error: updErr } = await admin
    .from('business_team_invites')
    .update({ token_hash: newHash, expires_at: expiresAt })
    .eq('id', row.id)
    .is('accepted_at', null)
    .select('id')
    .maybeSingle();

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ ok: false, error: 'This link has expired or is no longer valid.' }, { status: 409 });
  }

  const { data: biz } = await admin.from('businesses').select('name').eq('id', row.business_id).maybeSingle();
  const { data: prof } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', row.invited_by)
    .maybeSingle();

  const pm = await deliverTeamInviteEmail({
    to: row.email,
    inviteUrl: buildInviteAcceptUrl(newToken),
    businessName: biz?.name ?? 'Workspace',
    inviterName: (prof?.full_name && String(prof.full_name).trim()) || 'A teammate',
    roleLabel: ROLE_LABELS[row.role] ?? row.role,
    businessId: row.business_id,
  });

  if (!pm.ok) {
    return NextResponse.json({ ok: false, error: pm.error ?? 'Failed to send new link.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, token: newToken });
}

