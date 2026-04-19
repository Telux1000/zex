import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { generateInvitePlainToken, hashInviteToken, buildInternalStaffInviteUrl } from '@/lib/invite-token';
import { deliverInternalStaffInviteEmail } from '@/lib/internal-staff-invite-postmark';
import { expiresAtFromTtlHours, getInternalStaffInviteTtlHours } from '@/lib/internal-staff-invite-ttl';
import { canManageInvites } from '@/lib/admin/team-permissions';
import { fetchInternalSecuritySettings } from '@/lib/admin/internal-security-settings';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  support: 'Support',
};

export async function POST(_req: Request, ctx: { params: Promise<{ inviteId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  if (!canManageInvites(adminRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { inviteId } = await ctx.params;
  if (!inviteId) return NextResponse.json({ error: 'Missing invite id.' }, { status: 400 });

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: row, error } = await admin
    .from('internal_staff_invites')
    .select('id, email, full_name, role, status, expires_at')
    .eq('id', inviteId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  }

  if (row.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending invitations can be resent.' }, { status: 400 });
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This invitation has expired. Create a new invite.' }, { status: 400 });
  }

  const [securitySettings, platformSettings] = await Promise.all([
    fetchInternalSecuritySettings(admin),
    fetchAdminPlatformSettings(admin),
  ]);
  const ttlHours = securitySettings.invite_ttl_hours || getInternalStaffInviteTtlHours();

  const plainToken = generateInvitePlainToken();
  const tokenHash = hashInviteToken(plainToken);
  const expiresAt = expiresAtFromTtlHours(ttlHours);

  const { error: upErr } = await admin
    .from('internal_staff_invites')
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt,
      last_resend_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
    .eq('status', 'pending');

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: inviterProfile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const inviterName =
    (inviterProfile?.full_name && String(inviterProfile.full_name).trim()) || 'Zenzex team';

  const inviteUrl = buildInternalStaffInviteUrl(plainToken);

  try {
    await deliverInternalStaffInviteEmail({
      to: row.email,
      inviteUrl,
      inviterName,
      roleLabel: ROLE_LABELS[row.role] ?? row.role,
      recipientEmail: row.email,
      fullName: row.full_name,
      bccAlerts: platformSettings.admin_alerts_email,
      systemSenderLabel: platformSettings.system_sender_label,
    });
  } catch (e) {
    console.error('[internal-staff-invite] resend email', e);
    return NextResponse.json({ error: 'Could not send email.' }, { status: 500 });
  }

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'internal_staff_invite_resent',
    targetType: 'internal_staff_invite',
    targetId: inviteId,
    metadata: { email: row.email },
  });

  return NextResponse.json({ ok: true });
}
