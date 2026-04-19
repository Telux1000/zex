'use client';

import {
  useDashboardOnboardingRouting,
  useDashboardSetupProgress,
  useHasBusinessWorkspace,
} from '@/contexts/DashboardAccessContext';
import { isSetupProgressFullySatisfied } from '@/lib/onboarding/setup-progress';
import { InvoiceSetupBlockedPanel } from '@/components/onboarding/InvoiceSetupBlockedPanel';

/** Blocks invoice flows when profile / business / currency setup is incomplete (not customer). */
export function InvoiceCoreSetupBlockedFromContext({ invoiceFlow = false }: { invoiceFlow?: boolean }) {
  const progress = useDashboardSetupProgress();
  const hasBusiness = useHasBusinessWorkspace();
  const { isOnboardingComplete } = useDashboardOnboardingRouting();
  if (isSetupProgressFullySatisfied(progress)) return null;
  return (
    <InvoiceSetupBlockedPanel
      progress={progress}
      onboardingDone={isOnboardingComplete}
      hasBusiness={hasBusiness}
      invoiceFlow={invoiceFlow}
    />
  );
}
