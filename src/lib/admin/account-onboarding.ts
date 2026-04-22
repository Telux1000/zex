export type AccountOnboardingStage =
  | 'ACCOUNT_CREATED'
  | 'SIGNUP_UNVERIFIED'
  | 'VERIFIED_NO_LOGIN'
  | 'LOGIN_NO_ONBOARDING'
  | 'ONBOARDING_IN_PROGRESS'
  | 'ONBOARDING_COMPLETED';

export type AccountOnboardingStuckReason =
  | 'Email verification pending'
  | 'Verified but never signed in'
  | 'Signed in but onboarding not started'
  | 'Onboarding started but not completed';

type OnboardingInput = {
  created_at?: string | null;
  email_verified_at?: string | null;
  first_signed_in_at?: string | null;
  onboarding_started_at?: string | null;
  onboarding_completed_at?: string | null;
};

function hasIso(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toMillis(value: string | null | undefined): number | null {
  if (!hasIso(value)) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function deriveAccountOnboardingStage(input: OnboardingInput): AccountOnboardingStage {
  if (hasIso(input.onboarding_completed_at)) return 'ONBOARDING_COMPLETED';
  if (hasIso(input.onboarding_started_at)) return 'ONBOARDING_IN_PROGRESS';
  if (hasIso(input.first_signed_in_at)) return 'LOGIN_NO_ONBOARDING';
  if (hasIso(input.email_verified_at)) return 'VERIFIED_NO_LOGIN';
  if (hasIso(input.created_at)) return 'SIGNUP_UNVERIFIED';
  return 'ACCOUNT_CREATED';
}

export function deriveAccountOnboardingStuckReason(stage: AccountOnboardingStage): AccountOnboardingStuckReason | null {
  if (stage === 'SIGNUP_UNVERIFIED' || stage === 'ACCOUNT_CREATED') return 'Email verification pending';
  if (stage === 'VERIFIED_NO_LOGIN') return 'Verified but never signed in';
  if (stage === 'LOGIN_NO_ONBOARDING') return 'Signed in but onboarding not started';
  if (stage === 'ONBOARDING_IN_PROGRESS') return 'Onboarding started but not completed';
  return null;
}

export function deriveAccountOnboardingDaysStuck(
  stage: AccountOnboardingStage,
  input: OnboardingInput,
  now = Date.now()
): number | null {
  const anchor =
    stage === 'ONBOARDING_IN_PROGRESS'
      ? toMillis(input.onboarding_started_at)
      : stage === 'LOGIN_NO_ONBOARDING'
        ? toMillis(input.first_signed_in_at)
        : stage === 'VERIFIED_NO_LOGIN'
          ? toMillis(input.email_verified_at)
          : stage === 'ONBOARDING_COMPLETED'
            ? null
            : toMillis(input.created_at);
  if (anchor === null) return null;
  const delta = now - anchor;
  if (!Number.isFinite(delta) || delta < 0) return 0;
  return Math.floor(delta / 86_400_000);
}
