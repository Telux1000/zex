import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { SETTINGS_BUSINESS_SELECT } from '@/lib/business/settings-business-select';
import { computeSetupProgress, isSetupProgressFullySatisfied } from '@/lib/onboarding/setup-progress';
import {
  getGeoCountryCodeFromRequestHeaders,
  getRequestLocaleCountryCodeFromHeaders,
} from '@/lib/location/suggested-country-from-request';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { fetchAdminPlatformSettings, pricingPlansWithPlatformOverrides } from '@/lib/admin/admin-platform-settings';
import { PRICING_TRIAL_DAYS, pricingPlans } from '@/lib/billing/plans';
import { fetchOnboardingEntryState } from '@/lib/onboarding/entry-state';

/**
 * Full business row for settings-style forms, or null if the user has no primary business yet.
 * Includes derived onboarding / invoice-readiness fields for the wizard.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getSupabaseServiceAdmin();
  const platform = admin ? await fetchAdminPlatformSettings(admin) : null;
  const planCatalog = platform ? pricingPlansWithPlatformOverrides(platform) : pricingPlans;
  const trialDaysConfigured = platform?.trial_days ?? PRICING_TRIAL_DAYS;

  const h = headers();
  const geoCountryCode = getGeoCountryCodeFromRequestHeaders(h);
  const requestLocaleCountryCode = getRequestLocaleCountryCodeFromHeaders(h);
  /** @deprecated Prefer geoCountryCode; kept geo-only so Accept-Language does not masquerade as location. */
  const suggestedCountryCode = geoCountryCode;

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const profileFullName = (profileRow as { full_name?: string | null } | null)?.full_name ?? null;

  const primary = await getPrimaryBusinessForUser(user.id);
  const onboardingEntry = await fetchOnboardingEntryState(supabase, user.id, primary);
  let customerCount = 0;
  if (primary?.id) {
    const { count } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', primary.id);
    customerCount = count ?? 0;
  }

  const setupProgress = computeSetupProgress({
    profileFullName,
    business: primary,
    customerCount,
  });
  const wizardComplete = isSetupProgressFullySatisfied(setupProgress);

  if (!primary?.id) {
    return NextResponse.json({
      business: null,
      hasFinancialRecords: false,
      profileComplete: setupProgress.profileComplete,
      businessProfileComplete: setupProgress.businessProfileComplete,
      currencyComplete: setupProgress.currencyComplete,
      customerCount,
      hasFirstCustomer: setupProgress.hasFirstCustomer,
      wizardComplete,
      geoCountryCode,
      requestLocaleCountryCode,
      suggestedCountryCode,
      pricingComplete: onboardingEntry.onboarding_ready,
      onboardingEntry,
      planCatalog,
      trialDaysConfigured,
      billingProviderMode: platform?.billing_provider_mode ?? 'flutterwave_primary_paystack_fallback',
    });
  }

  const { data: business, error } = await supabase
    .from('businesses')
    .select(SETTINGS_BUSINESS_SELECT)
    .eq('id', primary.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [inv, quotes, expenses] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('business_id', primary.id),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('business_id', primary.id),
    supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('business_id', primary.id),
  ]);
  const hasFinancialRecords =
    (inv.count ?? 0) > 0 || (quotes.count ?? 0) > 0 || (expenses.count ?? 0) > 0;

  return NextResponse.json({
    business,
    hasFinancialRecords,
    profileComplete: setupProgress.profileComplete,
    businessProfileComplete: setupProgress.businessProfileComplete,
    currencyComplete: setupProgress.currencyComplete,
    customerCount,
    hasFirstCustomer: setupProgress.hasFirstCustomer,
    wizardComplete,
    geoCountryCode,
    requestLocaleCountryCode,
    suggestedCountryCode,
    pricingComplete: onboardingEntry.onboarding_ready,
    onboardingEntry,
    planCatalog,
    trialDaysConfigured,
    billingProviderMode: platform?.billing_provider_mode ?? 'flutterwave_primary_paystack_fallback',
  });
}
