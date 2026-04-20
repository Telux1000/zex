import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function assertCustomerLifecycleAccess(
  supabase: SupabaseClient,
  customerId: string,
  userId: string
): Promise<
  | { ok: true; businessId: string }
  | { ok: false; response: NextResponse }
> {
  const { data: customer } = await supabase
    .from('customers')
    .select('id, business_id')
    .eq('id', customerId)
    .maybeSingle();
  if (!customer) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', customer.business_id)
    .eq('owner_id', userId)
    .maybeSingle();
  if (!business) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, businessId: String(customer.business_id) };
}
