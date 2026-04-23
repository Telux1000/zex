import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { getSuggestedCountryCodeFromRequestHeaders } from '@/lib/location/suggested-country-from-request';
import {
  getPrimaryBusinessForUser,
  getServerSupabaseUser,
} from '@/lib/supabase/server-auth';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { defaultDeniedFlags, permissionFlagsForRole } from '@/lib/rbac/permissions';
import { SETTINGS_BUSINESS_SELECT } from '@/lib/business/settings-business-select';
import {
  isOnboardingComplete,
  onboardingResumeStep,
} from '@/lib/onboarding/completion';
import { fetchOnboardingEntryState } from '@/lib/onboarding/entry-state';

export default async function SettingsPage() {
  const suggestedCountryCode = getSuggestedCountryCodeFromRequestHeaders(headers());

  const { supabase, user } = await getServerSupabaseUser();
  if (!user) redirect('/login');

  const primary = await getPrimaryBusinessForUser(user.id);
  const entryState = await fetchOnboardingEntryState(supabase, user.id, primary);
  const { data: profileGate } = await supabase
    .from('profiles')
    .select('full_name, onboarding_completed_at, onboarding_pricing_completed_at')
    .eq('id', user.id)
    .maybeSingle();
  const profileForGate = profileGate as {
    full_name?: string | null;
    onboarding_completed_at?: string | null;
    onboarding_pricing_completed_at?: string | null;
  } | null;
  let gateCustomerCount = 0;
  if (primary?.id) {
    const { count } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', primary.id);
    gateCustomerCount = count ?? 0;
  }
  if (entryState.should_show_plan_selection) {
    redirect('/onboarding?step=pricing');
  }
  if (!isOnboardingComplete(profileForGate, primary, gateCustomerCount)) {
    redirect(`/onboarding?step=${onboardingResumeStep(profileForGate, primary, gateCustomerCount)}`);
  }

  let business = null;
  let permissionFlags = defaultDeniedFlags();
  let hasFinancialRecords = false;

  if (primary) {
    const { data: row } = await supabase
      .from('businesses')
      .select(SETTINGS_BUSINESS_SELECT)
      .eq('id', primary.id)
      .single();
    business = row;
    const role = await getEffectiveBusinessRole(supabase, primary.id, user.id);
    if (role) permissionFlags = permissionFlagsForRole(role);

    const [inv, quotes, expenses] = await Promise.all([
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('business_id', primary.id),
      supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('business_id', primary.id),
      supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('business_id', primary.id),
    ]);
    hasFinancialRecords =
      (inv.count ?? 0) > 0 || (quotes.count ?? 0) > 0 || (expenses.count ?? 0) > 0;
  }

  return (
    <div className="mx-auto mt-4 w-full max-w-7xl px-6 py-6">
      <h1 className="hidden text-2xl font-bold text-slate-900 dark:text-white lg:block">Settings</h1>
      <p className="mt-1 hidden text-slate-600 dark:text-slate-400 lg:block">
        Manage your account, business profile for invoices and customer email, plus invoices, payments,
        tax, and customers.
      </p>
      <Suspense fallback={<div className="mt-6 text-slate-500">Fetching settings…</div>}>
        <SettingsLayout
          business={business}
          permissionFlags={permissionFlags}
          hasFinancialRecords={hasFinancialRecords}
          suggestedCountryCode={suggestedCountryCode}
        />
      </Suspense>
    </div>
  );
}
