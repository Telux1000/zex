import { redirect } from 'next/navigation';
import { computeSetupProgress, isSetupProgressFullySatisfied } from '@/lib/onboarding/setup-progress';
import { onboardingResumeStep, type ProfileForOnboarding } from '@/lib/onboarding/completion';
import type { PrimaryBusinessRow } from '@/lib/supabase/server-auth';

/**
 * Redirects to the first incomplete onboarding step when profile, business profile, or currency is missing.
 * No-op without a business (callers usually handle “create business” separately).
 */
export function redirectToOnboardingIfCoreIncomplete(input: {
  profile: ProfileForOnboarding | null | undefined;
  business: PrimaryBusinessRow | null;
  customerCount: number;
}): void {
  if (!input.business) return;
  const progress = computeSetupProgress({
    profileFullName: input.profile?.full_name,
    business: input.business,
    customerCount: input.customerCount,
  });
  if (isSetupProgressFullySatisfied(progress)) return;
  const step = onboardingResumeStep(input.profile, input.business, input.customerCount);
  redirect(`/onboarding?step=${step}`);
}
