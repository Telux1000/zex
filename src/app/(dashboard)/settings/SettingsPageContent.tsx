import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { SettingsDeferredLayout } from './SettingsDeferredLayout';
import { SettingsContentSkeleton } from './SettingsContentSkeleton';
import { getSuggestedCountryCodeFromRequestHeaders } from '@/lib/location/suggested-country-from-request';
import { getPrimaryBusinessForUser, getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { defaultDeniedFlags } from '@/lib/rbac/permissions';
import { isOnboardingComplete, onboardingResumeStep } from '@/lib/onboarding/completion';
import { deriveOnboardingEntryState, getDashboardProfileRow } from '@/lib/onboarding/entry-state';
import { getCachedCustomerCountForBusiness } from '@/lib/business/customer-head-count';
import { settingsPagePerfLog } from '@/lib/dev/settings-page-perf';

export async function SettingsPageContent() {
  const t0 = Date.now();
  settingsPagePerfLog('settings: navigation_rsc_start');
  settingsPagePerfLog('settings: settings_layout_start');

  const tAuth = Date.now();
  const { user } = await getServerSupabaseUser();
  settingsPagePerfLog('settings: auth_session_ms', { ms: Date.now() - tAuth });
  if (!user) redirect('/login');

  const suggestedCountryCode = getSuggestedCountryCodeFromRequestHeaders(headers());

  const tProfilePrimary = Date.now();
  const [primary, profileRow] = await Promise.all([
    getPrimaryBusinessForUser(user.id),
    getDashboardProfileRow(user.id),
  ]);
  settingsPagePerfLog('settings: profile_fetch_ms', { ms: Date.now() - tProfilePrimary });

  const entryState = deriveOnboardingEntryState({
    profile: profileRow,
    primaryBusiness: primary,
  });

  const tCustomer = Date.now();
  const gateCustomerCount = primary?.id ? await getCachedCustomerCountForBusiness(primary.id) : 0;
  settingsPagePerfLog('settings: onboarding_gate_customer_count_ms', { ms: Date.now() - tCustomer });

  settingsPagePerfLog('settings: auth_workspace_check_ms', { ms: Date.now() - t0 });

  if (entryState.should_show_plan_selection) {
    redirect('/onboarding?step=pricing');
  }
  if (!isOnboardingComplete(profileRow, primary, gateCustomerCount)) {
    redirect(`/onboarding?step=${onboardingResumeStep(profileRow, primary, gateCustomerCount)}`);
  }

  settingsPagePerfLog('settings: gates_complete_stream_shell_ms', { ms: Date.now() - t0 });

  if (!primary?.id) {
    settingsPagePerfLog('settings: total_blocking_rsc_ms', { ms: Date.now() - t0 });
    return (
      <SettingsLayout
        business={null}
        permissionFlags={defaultDeniedFlags()}
        hasFinancialRecords={false}
        suggestedCountryCode={suggestedCountryCode}
      />
    );
  }

  return (
    <Suspense fallback={<SettingsContentSkeleton />}>
      <SettingsDeferredLayout
        businessId={primary.id}
        userId={user.id}
        ownerId={primary.ownerId}
        suggestedCountryCode={suggestedCountryCode}
        profileCardFullName={profileRow?.full_name ?? null}
        profileCardProfileRole={profileRow?.role ?? null}
        profileCardEmail={user.email ?? null}
      />
    </Suspense>
  );
}
