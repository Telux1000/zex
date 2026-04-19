import type { PrimaryBusinessRow } from '@/lib/supabase/server-auth';
import {
  businessRowToValidationInput,
  summarizeBusinessProfileValidation,
  validateBusinessProfileInput,
  type BusinessProfileFieldKey,
} from '@/lib/business/business-profile-validation';
import { computeSetupProgress, isSetupProgressFullySatisfied } from '@/lib/onboarding/setup-progress';

export type OnboardingCompletionBlocker = {
  step: 1 | 2 | 3;
  code: 'profile' | 'business' | 'currency';
  message: string;
  business_profile_field_errors?: Partial<Record<BusinessProfileFieldKey, string>>;
};

/**
 * Explains why guided onboarding cannot be marked complete yet.
 * Used only for `mark_onboarding_complete` — not for per-step saves.
 */
export function getOnboardingCompletionBlockerFromSnapshot(input: {
  profileFullName: string | null | undefined;
  business: PrimaryBusinessRow | null;
}): OnboardingCompletionBlocker | null {
  const progress = computeSetupProgress({
    profileFullName: input.profileFullName,
    business: input.business,
    customerCount: 0,
  });
  if (isSetupProgressFullySatisfied(progress)) return null;

  if (!progress.profileComplete) {
    return {
      step: 1,
      code: 'profile',
      message: 'Add your name on the Profile step before finishing setup.',
    };
  }
  if (!progress.businessProfileComplete) {
    const snap = businessRowToValidationInput(input.business);
    const v = validateBusinessProfileInput(snap);
    return {
      step: 2,
      code: 'business',
      message: summarizeBusinessProfileValidation(v, 'single-or-count'),
      business_profile_field_errors: v.noBusinessRow ? undefined : v.fieldErrors,
    };
  }
  if (!progress.currencyComplete) {
    return {
      step: 3,
      code: 'currency',
      message: 'Choose a supported base currency and save it before finishing setup.',
    };
  }
  return null;
}
