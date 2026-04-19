import type { SetupProgress } from '@/lib/onboarding/setup-progress';
import { resolveCoreSetupCallout } from '@/lib/onboarding/setup-callout-copy';

const primaryButtonClass =
  'inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500';

/**
 * Single top-of-dashboard message for incomplete core setup (profile, business, currency).
 * No secondary checklist — headline and primary CTA match the next required step.
 */
export function DashboardCoreSetupCallout({
  progress,
  onboardingDone,
  hasBusiness,
  hasSelectedPlan,
}: {
  progress: SetupProgress;
  onboardingDone: boolean;
  hasBusiness: boolean;
  hasSelectedPlan: boolean;
}) {
  const callout = resolveCoreSetupCallout({ progress, onboardingDone, hasBusiness, hasSelectedPlan });
  if (!callout) return null;

  return (
    <div className="border-b border-indigo-200/80 bg-indigo-50/90 dark:border-indigo-800/50 dark:bg-indigo-950/40">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-2.5">
        <p className="text-sm font-medium text-indigo-950 dark:text-indigo-50">{callout.message}</p>
        <a href={callout.href} className={primaryButtonClass}>
          {callout.cta}
        </a>
      </div>
    </div>
  );
}
