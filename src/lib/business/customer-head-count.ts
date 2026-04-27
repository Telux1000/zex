import { cache } from 'react';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';

/** Dedupes exact customer count for a business across dashboard layout + settings (same RSC request). */
export const getCachedCustomerCountForBusiness = cache(async (businessId: string): Promise<number> => {
  const { supabase } = await getServerSupabaseUser();
  const { count, error } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  if (error) return 0;
  return count ?? 0;
});
