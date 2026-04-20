import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canHardDeleteCustomer } from '@/lib/customers/customer-lifecycle';
import { assertCustomerLifecycleAccess } from '@/lib/customers/customer-lifecycle-guard';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const access = await assertCustomerLifecycleAccess(supabase, id, user.id);
  if (!access.ok) return access.response;

  const decision = await canHardDeleteCustomer(supabase, id);
  return NextResponse.json(decision);
}
