import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { canManageSubscriberLifecycle } from '@/lib/admin/account-lifecycle';
import { getEmailRedirectToForSignupResend } from '@/lib/auth/signup-resend';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

type Body = {
  action?: 'resend_verification';
};

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  if (!canManageSubscriberLifecycle(gate.adminRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { accountId } = await params;
  const body = (await req.json()) as Body;
  if (body.action !== 'resend_verification') {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const { data: business, error: businessErr } = await admin
    .from('businesses')
    .select('id, owner_id, name')
    .eq('id', accountId)
    .maybeSingle();
  if (businessErr) return NextResponse.json({ error: businessErr.message }, { status: 500 });
  if (!business) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const { data: ownerProfile, error: ownerErr } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', String(business.owner_id))
    .maybeSingle();
  if (ownerErr) return NextResponse.json({ error: ownerErr.message }, { status: 500 });
  if (!ownerProfile?.email) {
    return NextResponse.json({ error: 'Owner email is unavailable for verification resend.' }, { status: 400 });
  }

  const ownerAuthRes = await admin.auth.admin.getUserById(String(business.owner_id));
  if (ownerAuthRes.error) {
    return NextResponse.json({ error: ownerAuthRes.error.message }, { status: 500 });
  }
  if (ownerAuthRes.data.user?.email_confirmed_at) {
    return NextResponse.json({ error: 'This account is already verified.' }, { status: 400 });
  }

  const requestOrigin = (() => {
    try {
      return new URL(req.url).origin;
    } catch {
      return undefined;
    }
  })();
  const redirectTo = getEmailRedirectToForSignupResend(requestOrigin);

  const inviteRes = await admin.auth.admin.inviteUserByEmail(ownerProfile.email, {
    redirectTo,
    data: { support_action: 'admin_resend_verification' },
  });
  if (inviteRes.error) {
    return NextResponse.json({ error: inviteRes.error.message }, { status: 400 });
  }

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'admin_subscriber_verification_resent',
    targetType: 'subscriber_user',
    targetId: String(business.owner_id),
    metadata: {
      accountId,
      accountName: business.name ?? null,
      targetEmail: ownerProfile.email,
      targetName: ownerProfile.full_name ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
