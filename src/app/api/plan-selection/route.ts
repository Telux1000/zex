import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { catalogPriceIdForPlanInterval } from '@/lib/billing/catalog-price-map';
import {
  normalizeBillingPlan,
  normalizePlanBillingInterval,
  planIsFree,
  type BillingPlan,
} from '@/lib/billing/plans';
import { newAccountTrialFields } from '@/lib/billing/subscription-access';
import { fetchOnboardingEntryState } from '@/lib/onboarding/entry-state';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  billingProviderModeFromEnvPrimary,
  hostedSaaSCheckoutProviderOrder,
  isInternalSaaSBillingConfigured,
  normalizeBillingProviderMode,
} from '@/lib/billing/saas-billing-config';
import { internalCatalogKey } from '@/lib/billing/plan-provider-refs';

type SelectionMode = 'free' | 'trial' | 'paid';

function normalizeSelectionMode(value: unknown, plan: BillingPlan): SelectionMode {
  if (planIsFree(plan)) return 'free';
  if (value === 'trial' || value === 'paid') return value;
  return 'paid';
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const plan = normalizeBillingPlan(body.plan_key ?? body.plan ?? body.billing_plan);
  const billingInterval = normalizePlanBillingInterval(body.billing_interval ?? body.interval) ?? 'yearly';
  const mode = normalizeSelectionMode(body.selection_mode, plan);
  const primaryBusiness = await getPrimaryBusinessForUser(user.id);

  if (primaryBusiness && mode !== 'paid') {
    const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
    return NextResponse.json({
      ...state,
      error: 'Plan selection onboarding applies before creating your first workspace.',
    });
  }

  const now = new Date().toISOString();
  if (mode === 'free') {
    const { error } = await supabase
      .from('profiles')
      .update({
        billing_plan: plan,
        billing_interval: billingInterval,
        selected_catalog_price_id: null,
        selected_plan_at: now,
        plan_selection_status: 'FREE_SELECTED',
        pending_checkout_provider: null,
        pending_checkout_plan: null,
        onboarding_pricing_completed_at: now,
        trial_started_at: null,
        trial_ends_at: null,
        subscription_status: 'active',
      })
      .eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
    return NextResponse.json(state);
  }

  if (mode === 'trial') {
    const admin = getSupabaseServiceAdmin();
    const trialDays = admin ? (await fetchAdminPlatformSettings(admin)).trial_days : 14;
    const trial = newAccountTrialFields(new Date(), trialDays);
    const { error } = await supabase
      .from('profiles')
      .update({
        billing_plan: plan,
        billing_interval: billingInterval,
        selected_catalog_price_id: catalogPriceIdForPlanInterval(plan, billingInterval),
        selected_plan_at: now,
        plan_selection_status: 'TRIAL_SELECTED',
        pending_checkout_provider: null,
        pending_checkout_plan: null,
        onboarding_pricing_completed_at: now,
        trial_started_at: trial.trial_started_at,
        trial_ends_at: trial.trial_ends_at,
        subscription_status: trial.subscription_status,
      })
      .eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
    return NextResponse.json(state);
  }

  if (isInternalSaaSBillingConfigured()) {
    const admin = getSupabaseServiceAdmin();
    const platform = admin ? await fetchAdminPlatformSettings(admin) : null;
    const providerMode = platform
      ? normalizeBillingProviderMode(platform.billing_provider_mode)
      : billingProviderModeFromEnvPrimary();
    const checkoutOrder = hostedSaaSCheckoutProviderOrder(providerMode);
    const primary = checkoutOrder[0];
    if (!primary) {
      return NextResponse.json(
        { error: 'Secure checkout is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        billing_plan: plan,
        billing_interval: billingInterval,
        selected_catalog_price_id: internalCatalogKey(primary, plan, billingInterval),
        selected_plan_at: now,
        plan_selection_status: 'PAID_PENDING_CHECKOUT',
        pending_checkout_provider: primary,
        pending_checkout_plan: plan,
        onboarding_pricing_completed_at: null,
      })
      .eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);
    return NextResponse.json({
      ...state,
      checkout_config: {
        provider: 'internal' as const,
        plan_key: plan,
        billing_interval: billingInterval,
        owner_user_id: user.id,
        customer_email: user.email ?? null,
      },
    });
  }

  return NextResponse.json(
    {
      error:
        'Subscription checkout is not available: configure Flutterwave, Paystack, or Stripe on the server.',
    },
    { status: 503 }
  );
}
