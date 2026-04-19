import type { SetupProgress } from '@/lib/onboarding/setup-progress';

export type CoreSetupCallout = {
  message: string;
  cta: string;
  href: string;
};

/**
 * One action-oriented headline + CTA for the next incomplete core-setup step.
 * Used by the dashboard top callout and inline blocked panels for consistency.
 *
 * @param hasSelectedPlan — Same as committed pricing/plan selection (`onboarding_pricing_completed_at` or existing workspace).
 *   When false and the profile step is incomplete, no callout is returned (e.g. user still on plan selection).
 */
export function resolveCoreSetupCallout(input: {
  progress: SetupProgress;
  onboardingDone: boolean;
  hasBusiness: boolean;
  hasSelectedPlan: boolean;
}): CoreSetupCallout | null {
  const { progress, onboardingDone, hasBusiness, hasSelectedPlan } = input;

  if (!progress.profileComplete) {
    if (!hasSelectedPlan) {
      return null;
    }
    return {
      message: 'Add your name so teammates recognize you.',
      cta: 'Add your name',
      href: onboardingDone
        ? '/settings?section=profile&focus=full_name'
        : '/onboarding?step=1&focus=full_name',
    };
  }
  if (!hasBusiness) {
    return {
      message: 'Set up your business to continue.',
      cta: 'Continue setup',
      href: '/onboarding?step=1',
    };
  }
  if (!progress.businessProfileComplete) {
    return {
      message: 'Complete your business profile to continue.',
      cta: 'Complete business profile',
      href: onboardingDone ? '/settings?section=business-profile' : '/onboarding?step=2',
    };
  }
  if (!progress.currencyComplete) {
    return {
      message: 'Set your base currency to continue.',
      cta: 'Set base currency',
      href: onboardingDone ? '/settings?section=finance-currency' : '/onboarding?step=3',
    };
  }
  return null;
}
