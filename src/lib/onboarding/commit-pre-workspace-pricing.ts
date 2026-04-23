import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { catalogPriceIdForPlanInterval } from '@/lib/billing/catalog-price-map';
import {
  getPricingPlan,
  normalizeBillingPlan,
  normalizePlanBillingInterval,
  PRICING_TRIAL_DAYS,
  type BillingPlan,
  type PlanBillingInterval,
} from '@/lib/billing/plans';
import { newAccountTrialFields } from '@/lib/billing/subscription-access';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';

/**
 * Locks plan + billing interval + Stripe price ID and starts the account trial (no Stripe Checkout).
 * Only valid before the user has a primary workspace.
 */
export async function commitPreWorkspacePricingSelection(
  supabase: SupabaseClient,
  userId: string,
  planRaw: unknown,
  billingIntervalRaw: unknown
): Promise<{ ok: true; plan: BillingPlan; billing_interval: PlanBillingInterval } | { ok: false; status: number; error: string }> {
  const plan = normalizeBillingPlan(planRaw);
  const billing_interval = normalizePlanBillingInterval(billingIntervalRaw);
  if (!billing_interval) {
    return { ok: false, status: 400, error: 'billing_interval must be monthly or yearly.' };
  }

  const primary = await getPrimaryBusinessForUser(userId);
  if (primary) {
    return {
      ok: false,
      status: 400,
      error: 'Plan selection with trial start only applies before your first workspace is created.',
    };
  }

  const pricing = getPricingPlan(plan);
  const catalogPriceId = catalogPriceIdForPlanInterval(plan, billing_interval);

  if (!pricing.isFree && !catalogPriceId) {
    return {
      ok: false,
      status: 400,
      error:
        'Catalog price is not configured for this plan and billing cycle. Set NEXT_PUBLIC_PADDLE_PRICE_* (and optional NEXT_PUBLIC_PADDLE_PRICE_*_YEARLY for yearly).',
    };
  }

  const admin = getSupabaseServiceAdmin();
  const platform = admin ? await fetchAdminPlatformSettings(admin) : null;
  const trialDays = platform?.trial_days ?? PRICING_TRIAL_DAYS;
  const trial = pricing.isFree ? null : newAccountTrialFields(new Date(), trialDays);
  const selectedAt = new Date().toISOString();

  const { error } = await supabase
    .from('profiles')
    .update({
      billing_plan: plan,
      billing_interval,
      selected_stripe_price_id: pricing.isFree ? null : catalogPriceId,
      onboarding_pricing_completed_at: new Date().toISOString(),
      selected_plan_at: selectedAt,
      plan_selection_status: pricing.isFree ? 'FREE_SELECTED' : 'TRIAL_SELECTED',
      pending_checkout_provider: null,
      pending_checkout_plan: null,
      trial_started_at: trial ? trial.trial_started_at : null,
      trial_ends_at: trial ? trial.trial_ends_at : null,
      subscription_status: trial ? trial.subscription_status : 'active',
    })
    .eq('id', userId);

  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, plan, billing_interval };
}
