import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { archiveCustomer } from '@/lib/customers/customer-lifecycle';
import { resolveActorDisplayName } from '@/lib/audit-log';
import { assertCustomerLifecycleAccess } from '@/lib/customers/customer-lifecycle-guard';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const access = await assertCustomerLifecycleAccess(supabase, id, user.id);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';
  try {
    await archiveCustomer({
      supabase,
      customerId: id,
      actorUserId: user.id,
      actorName,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Archive failed';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
