'use client';

import { createContext, useContext } from 'react';
import type { PermissionFlags } from '@/lib/rbac/permissions';
import { defaultDeniedFlags } from '@/lib/rbac/permissions';
import {
  coreSetupComplete,
  hasCustomer,
  type SetupProgress,
} from '@/lib/onboarding/setup-progress';

export type DashboardAccessContextValue = {
  permissionFlags: PermissionFlags;
  setupProgress: SetupProgress;
  isOnboardingComplete: boolean;
  onboardingResumeStep: 'pricing' | 1 | 2 | 3;
  /** Primary workspace row exists (vs still before first business). */
  hasBusiness: boolean;
  /** Committed pricing/plan selection (or existing workspace); drives profile-name callout gating. */
  hasSelectedPlan: boolean;
};

const DashboardShellContext = createContext<DashboardAccessContextValue | null>(null);

export function DashboardAccessProvider({
  value,
  children,
}: {
  value: DashboardAccessContextValue;
  children: React.ReactNode;
}) {
  return <DashboardShellContext.Provider value={value}>{children}</DashboardShellContext.Provider>;
}

export function useDashboardAccess(): PermissionFlags {
  return useContext(DashboardShellContext)?.permissionFlags ?? defaultDeniedFlags();
}

export function useDashboardSetupProgress(): SetupProgress {
  return (
    useContext(DashboardShellContext)?.setupProgress ?? {
      profileComplete: true,
      businessProfileComplete: true,
      currencyComplete: true,
      hasFirstCustomer: true,
    }
  );
}

export function useDashboardOnboardingRouting(): {
  isOnboardingComplete: boolean;
  onboardingResumeStep: 'pricing' | 1 | 2 | 3;
} {
  const v = useContext(DashboardShellContext);
  return {
    isOnboardingComplete: v?.isOnboardingComplete ?? true,
    onboardingResumeStep: v?.onboardingResumeStep ?? 1,
  };
}

/** Profile + business profile + base currency (same as guided onboarding completion). */
export function useCoreSetupComplete(): boolean {
  return coreSetupComplete(useDashboardSetupProgress());
}

/** Workspace has at least one customer (invoice/quote finalize). */
export function useHasCustomer(): boolean {
  return hasCustomer(useDashboardSetupProgress());
}

export function useHasBusinessWorkspace(): boolean {
  return useContext(DashboardShellContext)?.hasBusiness ?? true;
}

/** Mirrors server `hasSelectedPlanForSetupCallout`; defaults false outside provider. */
export function useDashboardHasSelectedPlan(): boolean {
  return useContext(DashboardShellContext)?.hasSelectedPlan ?? false;
}
