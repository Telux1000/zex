import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeatureUsageKey } from '@/lib/product-usage/allowed-keys';
import { isFeatureUsageKey } from '@/lib/product-usage/allowed-keys';

/**
 * Inserts a product_usage_events row (server-side, user-scoped RLS).
 */
export async function recordLineItemFeatureUse(
  supabase: SupabaseClient,
  args: { userId: string; businessId: string; targetKey: FeatureUsageKey }
): Promise<void> {
  if (!isFeatureUsageKey(args.targetKey)) return;
  const { error } = await supabase.from('product_usage_events').insert({
    user_id: args.userId,
    business_id: args.businessId,
    kind: 'feature_use',
    target_key: args.targetKey,
  });
  if (error && error.code !== '42P01') {
    console.warn('[saved-line-items] product_usage insert', error.message);
  }
}
