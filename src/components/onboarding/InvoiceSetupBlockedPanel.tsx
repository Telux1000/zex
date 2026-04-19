'use client';

import Link from 'next/link';
import { useDashboardHasSelectedPlan } from '@/contexts/DashboardAccessContext';
import type { SetupProgress } from '@/lib/onboarding/setup-progress';
import { isSetupProgressFullySatisfied } from '@/lib/onboarding/setup-progress';
import { resolveCoreSetupCallout } from '@/lib/onboarding/setup-callout-copy';

/**
 * Inline notice when a flow is blocked by incomplete core setup.
 * Copy matches the dashboard top callout (single message + primary action).
 */
export function InvoiceSetupBlockedPanel({
  progress,
  onboardingDone,
  hasBusiness,
  invoiceFlow = false,
}: {
  progress: SetupProgress;
  onboardingDone: boolean;
  hasBusiness: boolean;
  /** When true, show invoice-specific framing + secondary &quot;Back&quot; to invoice options. */
  invoiceFlow?: boolean;
}) {
  const hasSelectedPlan = useDashboardHasSelectedPlan();
  if (isSetupProgressFullySatisfied(progress)) return null;

  const callout = resolveCoreSetupCallout({ progress, onboardingDone, hasBusiness, hasSelectedPlan });
  if (!callout) return null;

  return (
    <div
      className="mx-auto w-full max-w-lg rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-6 text-[var(--foreground)] shadow-sm"
      role="status"
    >
      <p className="text-base font-semibold">{callout.message}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Link
          href={callout.href}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          {callout.cta}
        </Link>
        {invoiceFlow ? (
          <Link
            href="/dashboard/invoices/new"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back
          </Link>
        ) : null}
      </div>
    </div>
  );
}
