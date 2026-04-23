import { NextResponse } from 'next/server';
import { getAccountCustomerDetail } from '@/lib/admin/account-customers';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ accountId: string; customerId: string }> }
) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { accountId, customerId } = await params;
  if (!accountId || !customerId) {
    return NextResponse.json({ error: 'Missing account or customer id.' }, { status: 400 });
  }

  const { data: business, error: businessErr } = await admin
    .from('businesses')
    .select('id')
    .eq('id', accountId)
    .maybeSingle();
  if (businessErr) return NextResponse.json({ error: businessErr.message }, { status: 500 });
  if (!business) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  try {
    const detail = await getAccountCustomerDetail(admin, { accountId, customerId });
    if (!detail) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load customer details.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
