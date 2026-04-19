import type { SupabaseClient } from '@supabase/supabase-js';

/** True if the business has invoices, quotes, or expenses (blocks unsafe base-currency changes). */
export async function businessHasFinancialRecords(
  supabase: SupabaseClient,
  businessId: string
): Promise<boolean> {
  const [inv, quotes, expenses] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ]);
  return (inv.count ?? 0) > 0 || (quotes.count ?? 0) > 0 || (expenses.count ?? 0) > 0;
}
