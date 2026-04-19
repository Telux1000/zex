-- Tracks completion of the signup pricing step (plan selection before workspace creation).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_pricing_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.onboarding_pricing_completed_at IS
  'Set when the account owner finishes the required signup pricing step. Null until completed.';

-- Existing accounts: treat as having completed pricing so only new signups see the step.
UPDATE public.profiles
SET onboarding_pricing_completed_at = COALESCE(onboarding_completed_at, created_at, NOW())
WHERE onboarding_pricing_completed_at IS NULL;
