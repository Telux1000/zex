import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { cancelPendingFollowUpsForUser } from '@/lib/admin/onboarding-follow-ups';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  const { supabase, user, adminRole } = gate;
  const params = await ctx.params;
  const userId = String(params.id ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

  await cancelPendingFollowUpsForUser(userId, 'canceled_by_admin');
  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_accounts',
    targetType: 'onboarding_follow_up',
    targetId: userId,
    metadata: { operation: 'cancel_pending_follow_ups' },
  });
  return NextResponse.json({ ok: true });
}
