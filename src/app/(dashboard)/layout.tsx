import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { getSubscriberDashboardBlockReason } from '@/lib/subscriber/dashboard-access';
import {
  getPrimaryBusinessForUser,
  getServerSupabaseUser,
} from '@/lib/supabase/server-auth';
import { runNotificationIntelligenceForBusiness } from '@/lib/notifications/notification-runner';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { defaultDeniedFlags, permissionFlagsForRole } from '@/lib/rbac/permissions';
import { DashboardCoreSetupCallout } from '@/components/dashboard/DashboardCoreSetupCallout';
import { computeSetupProgress } from '@/lib/onboarding/setup-progress';
import { isOnboardingComplete, onboardingResumeStep } from '@/lib/onboarding/completion';
import { shouldShowDashboardSetupCallout } from '@/lib/onboarding/unified-setup-banner';
import { hasSelectedPlanForSetupCallout } from '@/lib/onboarding/pricing-selection-for-callout';
import { DashboardSubscriptionBanner } from '@/components/billing/DashboardSubscriptionBanner';
import {
  computeEffectiveSubscription,
  fetchOwnerSubscriptionRow,
  reconcileSubscriptionStatusInDb,
  trialDaysRemaining,
  trialUrgencyBannerDays,
} from '@/lib/billing/subscription-access';
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) redirect('/login');

  const subscriberBlock = await getSubscriberDashboardBlockReason(supabase, user.id);
  if (subscriberBlock) {
    redirect(`/account-unavailable?reason=${subscriberBlock}`);
  }

  const business = await getPrimaryBusinessForUser(user.id);
  let permissionFlags = defaultDeniedFlags();
  if (business) {
    const role = await getEffectiveBusinessRole(supabase, business.id, user.id);
    if (role) permissionFlags = permissionFlagsForRole(role);
  }

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('full_name, onboarding_completed_at, onboarding_pricing_completed_at')
    .eq('id', user.id)
    .maybeSingle();
  const profileTyped = profileRow as {
    full_name?: string | null;
    onboarding_completed_at?: string | null;
    onboarding_pricing_completed_at?: string | null;
  } | null;
  const profileFullName = profileTyped?.full_name ?? null;

  let customerCount = 0;
  if (business?.id) {
    const { count } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id);
    customerCount = count ?? 0;
  }

  const setupProgress = computeSetupProgress({ profileFullName, business, customerCount });
  const onboardingDone = isOnboardingComplete(profileTyped, business, customerCount);
  const resumeStep = onboardingResumeStep(profileTyped, business, customerCount);

  const hasSelectedPlan = hasSelectedPlanForSetupCallout({
    onboardingPricingCompletedAt: profileTyped?.onboarding_pricing_completed_at,
    hasBusinessWorkspace: Boolean(business),
  });

  const showSetupCallout = shouldShowDashboardSetupCallout({ coreSetupComplete: onboardingDone });

  let initialSupportUnreadCount = 0;
  if (business?.id && permissionFlags.showSupportNav) {
    const { data: unreadRpc } = await supabase.rpc('support_ticket_unread_for_business', {
      p_business_id: business.id,
    });
    initialSupportUnreadCount = (unreadRpc ?? []).reduce((s: number, row: unknown) => {
      const u = row as { unread_count?: number };
      return s + Number(u.unread_count ?? 0);
    }, 0);
  }

  let notificationBadgeCount = 0;
  if (business) {
    try {
      const nowIso = new Date().toISOString();
      const result = await runNotificationIntelligenceForBusiness({
        supabase,
        businessId: business.id,
        baseCurrencyCode: business.currency ?? 'USD',
        nowIso,
      });
      notificationBadgeCount = result.unreadActionableCount ?? 0;
    } catch {
      notificationBadgeCount = 0;
    }
  }

  const profileBanner = showSetupCallout ? (
    <DashboardCoreSetupCallout
      progress={setupProgress}
      onboardingDone={onboardingDone}
      hasBusiness={Boolean(business)}
      hasSelectedPlan={hasSelectedPlan}
    />
  ) : null;

  let subscriptionBanner: ReactNode = null;
  if (business?.ownerId) {
    const subRow = await fetchOwnerSubscriptionRow(supabase, business.ownerId);
    if (subRow) {
      await reconcileSubscriptionStatusInDb(business.ownerId, subRow);
      const fresh = (await fetchOwnerSubscriptionRow(supabase, business.ownerId)) ?? subRow;
      const { effective, trialEndsAtIso } = computeEffectiveSubscription(fresh);
      const daysLeft = trialDaysRemaining(trialEndsAtIso);
      const urgency = trialUrgencyBannerDays(daysLeft);
      subscriptionBanner = (
        <DashboardSubscriptionBanner effective={effective} urgency={urgency} />
      );
    }
  }

  return (
    <DashboardShell
      user={user}
      business={business}
      businessId={business?.id ?? null}
      initialSupportUnreadCount={initialSupportUnreadCount}
      permissionFlags={permissionFlags}
      setupProgress={setupProgress}
      isOnboardingComplete={onboardingDone}
      onboardingResumeStep={resumeStep}
      hasSelectedPlan={hasSelectedPlan}
      profileFullName={profileFullName}
      notificationBadgeCount={notificationBadgeCount}
      profileBanner={profileBanner}
      subscriptionBanner={subscriptionBanner}
    >
      {children}
    </DashboardShell>
  );
}
