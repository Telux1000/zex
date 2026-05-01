import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { generateInvitePlainToken, hashInviteToken } from '@/lib/invite-token';
import { getWaitlistInviteLinkBaseUrl } from '@/lib/billing/app-base-url';
import { deliverWaitlistInviteEmail } from '@/lib/waitlist/deliver-waitlist-invite-postmark';
import { waitlistInviteExpiresAtIso } from '@/lib/waitlist/waitlist-invite';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const waitlistId = String(id ?? '').trim();
  if (!waitlistId) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { data: row, error: fetchErr } = await admin
    .from('waitlist')
    .select('id, email, status')
    .eq('id', waitlistId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 });
  }
  if (String(row.status) === 'converted') {
    return NextResponse.json({ error: 'Already converted' }, { status: 400 });
  }
  if (String(row.status) === 'activated') {
    return NextResponse.json({ error: 'Already signed up' }, { status: 400 });
  }

  const plain = generateInvitePlainToken();
  const hash = hashInviteToken(plain);
  const expiresAt = waitlistInviteExpiresAtIso();
  const invitedAt = new Date().toISOString();

  const { error: upErr } = await admin
    .from('waitlist')
    .update({
      invite_token_hash: hash,
      invite_token_expires_at: expiresAt,
      invited_at: invitedAt,
      status: 'invited',
    })
    .eq('id', waitlistId);

  if (upErr) {
    console.error('[admin waitlist invite]', upErr);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const email = String(row.email ?? '').trim();
  const inviteUrl = `${getWaitlistInviteLinkBaseUrl()}/invite/${plain}`;
  const emailResult = await deliverWaitlistInviteEmail({ to: email, inviteUrl });
  if (!emailResult.ok) {
    console.error('[admin waitlist invite] postmark', emailResult.error);
    return NextResponse.json(
      { error: 'Invite saved but email could not be sent. Check Postmark configuration.' },
      { status: 502 }
    );
  }

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'admin_waitlist_invited',
    targetType: 'waitlist',
    targetId: waitlistId,
    metadata: { email_domain: email.includes('@') ? email.split('@')[1] : null },
  });

  return NextResponse.json({ ok: true });
}
