import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { LoginPerfDashboardShellMarker } from '@/components/dev/LoginPerfDashboardShellMarker';
import { getSubscriberDashboardBlockReason } from '@/lib/subscriber/dashboard-access';
import { getPrimaryBusinessForUser, getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { getCachedEffectiveBusinessRole } from '@/lib/rbac/server';
import { defaultDeniedFlags, permissionFlagsForRole } from '@/lib/rbac/permissions';
import { DashboardCoreSetupCallout } from '@/components/dashboard/DashboardCoreSetupCallout';
import { computeSetupProgress } from '@/lib/onboarding/setup-progress';
import { isOnboardingComplete, onboardingResumeStep } from '@/lib/onboarding/completion';
import { shouldShowDashboardSetupCallout } from '@/lib/onboarding/unified-setup-banner';
import { DashboardSubscriptionBanner } from '@/components/billing/DashboardSubscriptionBanner';
import {
  computeEffectiveSubscription,
  fetchOwnerSubscriptionRow,
  reconcileSubscriptionStatusInDb,
  trialDaysRemaining,
  trialUrgencyBannerDays,
} from '@/lib/billing/subscription-access';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  fetchAppSystemSettings,
  getSystemModeMessage,
  isInternalAdminRoleValue,
} from '@/lib/system-access';
import {
  deriveOnboardingEntryState,
  getDashboardProfileRow,
} from '@/lib/onboarding/entry-state';
import { getCachedCustomerCountForBusiness } from '@/lib/business/customer-head-count';
import { isLoginPerfEnabled, loginPerfLog } from '@/lib/dev/login-perf';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const layoutStart = Date.now();
  if (isLoginPerfEnabled()) {
    loginPerfLog('dashboard: layout_start');
  }

  const { supabase, user } = await getServerSupabaseUser();
  if (!user) {
    if (isLoginPerfEnabled()) {
      loginPerfLog('dashboard: layout_block_ms', { ms: Date.now() - layoutStart, path: 'no_user' });
    }
    redirect('/login');
  }

  const [subscriberBlock, business, profileRow] = await Promise.all([
    getSubscriberDashboardBlockReason(supabase, user.id),
    getPrimaryBusinessForUser(user.id),
    getDashboardProfileRow(user.id),
  ]);
  if (subscriberBlock) {
    redirect(`/account-unavailable?reason=${subscriberBlock}`);
  }

  const onboardingEntry = deriveOnboardingEntryState({
    profile: profileRow,
    primaryBusiness: business,
  });

  const [businessRole, customerCount, systemAccess, ownerSub] = await Promise.all([
    business
      ? getCachedEffectiveBusinessRole(business.id, user.id, business.ownerId)
      : Promise.resolve(null),
    business?.id ? getCachedCustomerCountForBusiness(business.id) : Promise.resolve(0),
    (async () => {
      const serviceAdmin = getSupabaseServiceAdmin();
      return serviceAdmin ? fetchAppSystemSettings(serviceAdmin) : null;
    })(),
    business?.ownerId ? fetchOwnerSubscriptionRow(supabase, business.ownerId) : Promise.resolve(null),
  ]);

  const profileTyped = profileRow;
  const profileFullName = profileTyped?.full_name ?? null;
  const isInternalAdmin =
    isInternalAdminRoleValue(profileTyped?.internal_admin_role) &&
    !Boolean(profileTyped?.internal_admin_suspended_at);

  if (
    systemAccess?.system_mode === 'EMERGENCY_LOCKDOWN' &&
    (!isInternalAdmin || !systemAccess.emergency_admin_access_enabled)
  ) {
    redirect('/account-unavailable?reason=system_emergency_lockdown');
  }

  let permissionFlags = defaultDeniedFlags();
  if (business && businessRole) {
    permissionFlags = permissionFlagsForRole(businessRole);
  }

  const setupProgress = computeSetupProgress({ profileFullName, business, customerCount });
  const onboardingDone = isOnboardingComplete(profileTyped, business, customerCount);
  const resumeStep = onboardingResumeStep(profileTyped, business, customerCount);
  const hasSelectedPlan = !onboardingEntry.should_show_plan_selection;
  const showSetupCallout = shouldShowDashboardSetupCallout({ coreSetupComplete: onboardingDone });

  const profileBanner = (
    <>
      {systemAccess?.system_mode === 'MAINTENANCE' && (
        <div className="border-b border-amber-200 bg-amber-50/80 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {getSystemModeMessage(systemAccess.system_mode, systemAccess.system_message)}
        </div>
      )}
      {systemAccess?.system_mode === 'READ_ONLY' && (
        <div className="border-b border-indigo-200 bg-indigo-50/80 px-4 py-2 text-sm text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
          {getSystemModeMessage(systemAccess.system_mode, systemAccess.system_message)}
        </div>
      )}
      {showSetupCallout ? (
        <DashboardCoreSetupCallout
          progress={setupProgress}
          onboardingDone={onboardingDone}
          hasBusiness={Boolean(business)}
          hasSelectedPlan={hasSelectedPlan}
        />
      ) : null}
    </>
  );

  let subscriptionBanner: ReactNode = null;
  if (business?.ownerId && ownerSub) {
    void reconcileSubscriptionStatusInDb(business.ownerId, ownerSub);
    const { effective, trialEndsAtIso } = computeEffectiveSubscription(ownerSub);
    const daysLeft = trialDaysRemaining(trialEndsAtIso);
    const urgency = trialUrgencyBannerDays(daysLeft);
    subscriptionBanner = <DashboardSubscriptionBanner effective={effective} urgency={urgency} />;
  }

  if (isLoginPerfEnabled()) {
    loginPerfLog('dashboard: layout_block_ms', { ms: Date.now() - layoutStart });
  }

  return (
    <DashboardShell
      user={user}
      business={business}
      businessId={business?.id ?? null}
      initialSupportUnreadCount={0}
      permissionFlags={permissionFlags}
      setupProgress={setupProgress}
      isOnboardingComplete={onboardingDone}
      onboardingResumeStep={resumeStep}
      hasSelectedPlan={hasSelectedPlan}
      profileFullName={profileFullName}
      notificationBadgeCount={0}
      profileBanner={profileBanner}
      subscriptionBanner={subscriptionBanner}
    >
      <LoginPerfDashboardShellMarker />
      {children}
    </DashboardShell>
  );
}
