import { NextResponse } from 'next/server';
import {
  listAccountCustomers,
  normalizeAccountCustomersPagination,
  type AccountCustomerSort,
} from '@/lib/admin/account-customers';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export async function GET(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const { accountId } = await params;
  if (!accountId) return NextResponse.json({ error: 'Missing account id.' }, { status: 400 });

  const { data: business, error: businessErr } = await admin
    .from('businesses')
    .select('id')
    .eq('id', accountId)
    .maybeSingle();
  if (businessErr) return NextResponse.json({ error: businessErr.message }, { status: 500 });
  if (!business) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim() ?? '';
  const sort = (searchParams.get('sort')?.trim() ?? 'created_at_desc') as AccountCustomerSort;
  const { page, pageSize } = normalizeAccountCustomersPagination({
    page: searchParams.get('page'),
    pageSize: searchParams.get('page_size'),
  });

  try {
    const result = await listAccountCustomers(admin, {
      accountId,
      search,
      page,
      pageSize,
      sort,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load account customers.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
