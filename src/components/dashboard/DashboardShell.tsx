'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardMobileBottomNav } from '@/components/dashboard/DashboardMobileBottomNav';
import { DashboardTopBar } from '@/components/dashboard/DashboardTopBar';
import {
  dashboardCreateActions,
  dashboardNavItems,
  filterDashboardCreateActions,
  filterDashboardNavItems,
} from '@/components/dashboard/dashboard-nav';
import { ProductUsageBeacon } from '@/components/dashboard/ProductUsageBeacon';
import { DashboardAccessProvider } from '@/contexts/DashboardAccessContext';
import { DashboardNotificationsProvider } from '@/contexts/DashboardNotificationsContext';
import { SupportUnreadProvider } from '@/contexts/SupportUnreadContext';
import { useIsLgDown } from '@/hooks/use-is-lg-down';
import type { PermissionFlags } from '@/lib/rbac/permissions';
import type { SetupProgress } from '@/lib/onboarding/setup-progress';
import { cn } from '@/lib/utils/cn';

export function DashboardShell({
  user,
  business,
  businessId,
  permissionFlags,
  setupProgress,
  isOnboardingComplete,
  onboardingResumeStep,
  hasSelectedPlan,
  profileFullName,
  notificationBadgeCount = 0,
  initialSupportUnreadCount = 0,
  profileBanner,
  subscriptionBanner,
  showSidebarUpgradeCard = false,
  children,
}: {
  user: User;
  business: { name?: string | null } | null;
  /** Primary workspace id for product-usage analytics (page views). */
  businessId?: string | null;
  initialSupportUnreadCount?: number;
  permissionFlags: PermissionFlags;
  setupProgress: SetupProgress;
  isOnboardingComplete: boolean;
  onboardingResumeStep: 'pricing' | 1 | 2 | 3;
  hasSelectedPlan: boolean;
  profileFullName?: string | null;
  /** SSR seed for system notification badge; live updates use DashboardNotificationsProvider. */
  notificationBadgeCount?: number;
  profileBanner?: React.ReactNode;
  subscriptionBanner?: React.ReactNode;
  /** From server: show “Upgrade plan” sidebar card for Starter / trial / lapsed trial only. */
  showSidebarUpgradeCard?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isLgDown = useIsLgDown();
  const isAssistantPath =
    pathname === '/dashboard/assistant' || pathname.startsWith('/dashboard/assistant/');
  const assistantImmersiveMobile = isAssistantPath && isLgDown;
  const isSupportPath =
    pathname === '/dashboard/support' || pathname.startsWith('/dashboard/support/');
  /** Full-viewport support inbox (no top bar / bottom nav / content padding). */
  const supportImmersive = isSupportPath;
  const navItems = filterDashboardNavItems(dashboardNavItems, permissionFlags);
  const createActionsFiltered = filterDashboardCreateActions(dashboardCreateActions, permissionFlags);
  const supportUnreadEnabled = Boolean(permissionFlags.showSupportNav && businessId);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const hrefs = [...navItems.map((i) => i.href), ...createActionsFiltered.map((a) => a.href)];
    const run = () => {
      hrefs.forEach((href) => router.prefetch(href));
    };
    if (typeof window === 'undefined') return;
    let dispose: () => void;
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(run, { timeout: 2500 });
      dispose = () => window.cancelIdleCallback(idleId);
    } else {
      const t = window.setTimeout(run, 180);
      dispose = () => clearTimeout(t);
    }
    return () => dispose();
  }, [router]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    navItems.forEach(({ href }) => router.prefetch(href));
  }, [mobileNavOpen, router]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  return (
    <DashboardAccessProvider
      value={{
        permissionFlags,
        setupProgress,
        isOnboardingComplete,
        onboardingResumeStep,
        hasBusiness: Boolean(business),
        hasSelectedPlan,
      }}
    >
    <ProductUsageBeacon businessId={businessId ?? null} />
    <SupportUnreadProvider
      businessId={businessId ?? null}
      userId={user.id}
      initialTotalUnread={initialSupportUnreadCount}
      enabled={supportUnreadEnabled}
    >
    <DashboardNotificationsProvider
      businessId={businessId ?? null}
      initialUnreadActionableCount={notificationBadgeCount ?? 0}
    >
    <div className="min-h-screen bg-[var(--background)]">
      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] transition-opacity lg:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <DashboardSidebar
        businessName={business?.name ?? null}
        navItems={navItems}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        supportHref="/dashboard/support"
        showUpgradePlanCard={showSidebarUpgradeCard}
      />

      <div
        className={cn(
          'flex min-h-screen flex-col lg:pl-[260px]',
          // Cap height on mobile Assistant so flex-1 + min-h-0 children can scroll in-place
          // (min-h-* alone lets the column grow with content and breaks the message list scroll).
          (assistantImmersiveMobile || supportImmersive) &&
            'h-dvh max-h-dvh min-h-0 overflow-hidden'
        )}
      >
        <div className={cn((assistantImmersiveMobile || supportImmersive) && 'hidden')}>
          <DashboardTopBar
            user={user}
            businessName={business?.name ?? null}
            profileFullName={profileFullName ?? null}
            showMessagesInbox={supportUnreadEnabled}
            onMenuClick={() => setMobileNavOpen(true)}
          />
        </div>
        {assistantImmersiveMobile || supportImmersive ? null : profileBanner}
        {assistantImmersiveMobile || supportImmersive ? null : subscriptionBanner}
        <div
          className={cn(
            'min-w-0 flex-1 overflow-x-clip px-4 pt-4 pb-[max(6.5rem,calc(1rem+env(safe-area-inset-bottom)))] sm:px-6 sm:pt-6 sm:pb-[max(6.5rem,calc(1.5rem+env(safe-area-inset-bottom)))] md:p-6',
            (assistantImmersiveMobile || supportImmersive) &&
              'flex min-h-0 flex-1 flex-col !p-0 !pt-0 !pb-0 sm:!p-0 sm:!pb-0'
          )}
        >
          {children}
        </div>
      </div>
      <div className={cn((assistantImmersiveMobile || supportImmersive) && 'hidden')}>
        <DashboardMobileBottomNav
          navItems={navItems}
          createActions={createActionsFiltered}
          showCreateHub={
            permissionFlags.createInvoice ||
            permissionFlags.createCustomer ||
            permissionFlags.showExpensesWrite
          }
          supportHref="/dashboard/support"
        />
      </div>
    </div>
    </DashboardNotificationsProvider>
    </SupportUnreadProvider>
    </DashboardAccessProvider>
  );
}
