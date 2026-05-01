import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

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

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('waitlist')
    .update({ status: 'converted', converted_at: now })
    .eq('id', waitlistId)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data?.id) {
    return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 });
  }

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'admin_waitlist_marked_converted',
    targetType: 'waitlist',
    targetId: waitlistId,
    metadata: null,
  });

  return NextResponse.json({ ok: true });
}
