import { computeSetupProgress, isSetupProgressFullySatisfied } from '@/lib/onboarding/setup-progress';
import type { PrimaryBusinessRow } from '@/lib/supabase/server-auth';

export type ProfileForOnboarding = {
  full_name?: string | null;
  onboarding_completed_at?: string | null;
  onboarding_pricing_completed_at?: string | null;
};

export { isSetupProgressFullySatisfied };

/**
 * Guided onboarding is complete only when all required steps are satisfied.
 * `onboarding_completed_at` is not used for gating (legacy flag may be stale).
 */
export function isOnboardingComplete(
  profile: ProfileForOnboarding | null | undefined,
  business: PrimaryBusinessRow | null,
  customerCount: number
): boolean {
  const progress = computeSetupProgress({
    profileFullName: profile?.full_name,
    business,
    customerCount,
  });
  return isSetupProgressFullySatisfied(progress);
}

/**
 * First wizard step that still needs work: pricing (pre-workspace), then 1 Profile, 2 Business, 3 Currency.
 * When satisfied, returns 1 (callers use dashboard for “done”).
 */
export function onboardingResumeStep(
  profile: ProfileForOnboarding | null | undefined,
  business: PrimaryBusinessRow | null,
  customerCount: number
): 'pricing' | 1 | 2 | 3 {
  if (!business && !profile?.onboarding_pricing_completed_at) {
    return 'pricing';
  }
  const progress = computeSetupProgress({
    profileFullName: profile?.full_name,
    business,
    customerCount,
  });
  if (isSetupProgressFullySatisfied(progress)) return 1;
  if (!progress.profileComplete) return 1;
  if (!progress.businessProfileComplete) return 2;
  return 3;
}
