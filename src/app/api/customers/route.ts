import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCustomerForBusiness } from '@/lib/customers/create-customer-server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  const q = (searchParams.get('q') ?? '').trim();
  if (!businessId) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
  }

  const { data: business } = await supabase.from('businesses').select('id').eq('id', businessId).single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  let query = supabase
    .from('customers')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  if (q) {
    const escaped = q.replace(/'/g, "''");
    const pattern = `'%${escaped}%'`;
    query = query.or(
      `account_number.ilike.${pattern},name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Record<string, unknown>;
    const result = await createCustomerForBusiness(supabase, user.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.customer);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
