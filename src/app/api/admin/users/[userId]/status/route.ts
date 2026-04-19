import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  const body = (await req.json()) as { action?: 'suspend' | 'reactivate' };
  if (!body.action || (body.action !== 'suspend' && body.action !== 'reactivate')) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const bannedUntil =
    body.action === 'suspend' ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString() : 'none';

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: body.action === 'suspend' ? '87600h' : 'none',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: body.action === 'suspend' ? 'admin_user_suspended' : 'admin_user_reactivated',
    targetType: 'user',
    targetId: userId,
    metadata: { banned_until: bannedUntil },
  });

  return NextResponse.json({ ok: true });
}
