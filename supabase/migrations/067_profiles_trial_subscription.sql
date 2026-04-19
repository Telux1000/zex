-- Account-level trial and subscription lifecycle (not tied to plan tier).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT;

UPDATE public.profiles
SET subscription_status = 'active'
WHERE subscription_status IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN subscription_status SET DEFAULT 'active',
  ALTER COLUMN subscription_status SET NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (
    subscription_status IN (
      'trialing',
      'active',
      'past_due',
      'trial_expired',
      'cancelled'
    )
  );

COMMENT ON COLUMN public.profiles.trial_started_at IS
  'When the workspace trial started; set once per account, not reset on plan changes.';
COMMENT ON COLUMN public.profiles.trial_ends_at IS
  'Trial end instant; countdown is based on this and trial_started_at.';
COMMENT ON COLUMN public.profiles.subscription_status IS
  'Stripe-style lifecycle: trialing, active, past_due, trial_expired, cancelled.';

NOTIFY pgrst, 'reload schema';
