import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { generateInvitePlainToken, hashInviteToken, buildInternalStaffInviteUrl } from '@/lib/invite-token';
import { deliverInternalStaffInviteEmail } from '@/lib/internal-staff-invite-postmark';
import { expiresAtFromTtlHours, getInternalStaffInviteTtlHours } from '@/lib/internal-staff-invite-ttl';
import { canManageInvites, isInviteRole } from '@/lib/admin/team-permissions';
import {
  fetchInternalSecuritySettings,
  isEmailAllowedForStaffInvite,
} from '@/lib/admin/internal-security-settings';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  support: 'Support',
};

export async function POST(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  if (!canManageInvites(adminRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { full_name?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const fullName = String(body.full_name ?? '').trim();
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  const role = String(body.role ?? '')
    .trim()
    .toLowerCase();

  if (!fullName || !email || !role) {
    return NextResponse.json({ error: 'full_name, email, and role are required.' }, { status: 400 });
  }
  if (!isInviteRole(role)) {
    return NextResponse.json({ error: 'role must be admin or support.' }, { status: 400 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const [securitySettings, platformSettings] = await Promise.all([
    fetchInternalSecuritySettings(admin),
    fetchAdminPlatformSettings(admin),
  ]);
  if (!isEmailAllowedForStaffInvite(email, securitySettings.staff_invite_allowed_domains)) {
    return NextResponse.json(
      {
        error: 'This email domain is not allowed for internal staff invites under current security policy.',
      },
      { status: 403 }
    );
  }

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, internal_admin_role')
    .ilike('email', email)
    .maybeSingle();

  if (existingProfile?.internal_admin_role) {
    return NextResponse.json(
      { error: 'This email already belongs to an internal team member.' },
      { status: 409 }
    );
  }

  const { data: pendingOther } = await admin
    .from('internal_staff_invites')
    .select('id')
    .ilike('email', email)
    .eq('status', 'pending')
    .maybeSingle();

  if (pendingOther) {
    return NextResponse.json(
      { error: 'A pending invitation already exists for this email.' },
      { status: 409 }
    );
  }

  const plainToken = generateInvitePlainToken();
  const tokenHash = hashInviteToken(plainToken);
  const ttlHours = securitySettings.invite_ttl_hours || getInternalStaffInviteTtlHours();
  const expiresAt = expiresAtFromTtlHours(ttlHours);

  const { data: inserted, error: insErr } = await admin
    .from('internal_staff_invites')
    .insert({
      email,
      full_name: fullName,
      role,
      token_hash: tokenHash,
      invited_by: user.id,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id')
    .maybeSingle();

  if (insErr || !inserted?.id) {
    console.error('[internal-staff-invite]', insErr);
    return NextResponse.json({ error: insErr?.message ?? 'Could not create invitation.' }, { status: 500 });
  }

  const { data: inviterProfile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const inviterName =
    (inviterProfile?.full_name && String(inviterProfile.full_name).trim()) || 'Zenzex team';

  const inviteUrl = buildInternalStaffInviteUrl(plainToken);

  try {
    await deliverInternalStaffInviteEmail({
      to: email,
      inviteUrl,
      inviterName,
      roleLabel: ROLE_LABELS[role] ?? role,
      recipientEmail: email,
      fullName: fullName,
      bccAlerts: platformSettings.admin_alerts_email,
      systemSenderLabel: platformSettings.system_sender_label,
    });
  } catch (e) {
    console.error('[internal-staff-invite] email', e);
    await admin.from('internal_staff_invites').delete().eq('id', inserted.id);
    return NextResponse.json({ error: 'Could not send invitation email. Check Postmark configuration.' }, { status: 500 });
  }

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'internal_staff_invite_created',
    targetType: 'internal_staff_invite',
    targetId: inserted.id,
    metadata: { email, role },
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}
