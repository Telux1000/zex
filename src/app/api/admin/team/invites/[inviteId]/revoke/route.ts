import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { canManageInvites } from '@/lib/admin/team-permissions';

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

  const now = new Date().toISOString();

  const { data: updated, error } = await admin
    .from('internal_staff_invites')
    .update({ status: 'revoked', revoked_at: now })
    .eq('id', inviteId)
    .eq('status', 'pending')
    .select('id, email')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ error: 'Nothing to revoke or invitation not pending.' }, { status: 400 });
  }

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'internal_staff_invite_revoked',
    targetType: 'internal_staff_invite',
    targetId: inviteId,
    metadata: { email: updated.email },
  });

  return NextResponse.json({ ok: true });
}
