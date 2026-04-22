export type AccountOnboardingStage =
  | 'ACCOUNT_CREATED'
  | 'SIGNUP_UNVERIFIED'
  | 'VERIFIED_NO_LOGIN'
  | 'LOGIN_NO_ONBOARDING'
  | 'ONBOARDING_IN_PROGRESS'
  | 'ONBOARDING_COMPLETED';

export const STUCK_ONBOARDING_STAGES: AccountOnboardingStage[] = [
  'SIGNUP_UNVERIFIED',
  'VERIFIED_NO_LOGIN',
  'LOGIN_NO_ONBOARDING',
  'ONBOARDING_IN_PROGRESS',
];

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

export function deriveAccountOnboardingAnchorAt(
  stage: AccountOnboardingStage,
  input: OnboardingInput
): string | null {
  if (stage === 'ONBOARDING_IN_PROGRESS') return hasIso(input.onboarding_started_at) ? input.onboarding_started_at : null;
  if (stage === 'LOGIN_NO_ONBOARDING') return hasIso(input.first_signed_in_at) ? input.first_signed_in_at : null;
  if (stage === 'VERIFIED_NO_LOGIN') return hasIso(input.email_verified_at) ? input.email_verified_at : null;
  if (stage === 'ONBOARDING_COMPLETED') return hasIso(input.onboarding_completed_at) ? input.onboarding_completed_at : null;
  return hasIso(input.created_at) ? input.created_at : null;
}
