-- Centralized first-login plan selection and onboarding-entry state.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_selection_status TEXT NOT NULL DEFAULT 'NOT_SELECTED',
  ADD COLUMN IF NOT EXISTS selected_plan_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_checkout_provider TEXT,
  ADD COLUMN IF NOT EXISTS pending_checkout_plan TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_selection_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_selection_status_check
  CHECK (
    plan_selection_status IN (
      'NOT_SELECTED',
      'FREE_SELECTED',
      'TRIAL_SELECTED',
      'PAID_PENDING_CHECKOUT',
      'PAID_ACTIVE'
    )
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pending_checkout_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pending_checkout_provider_check
  CHECK (
    pending_checkout_provider IS NULL OR pending_checkout_provider IN ('paddle')
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pending_checkout_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pending_checkout_plan_check
  CHECK (
    pending_checkout_plan IS NULL OR pending_checkout_plan IN ('starter', 'growth', 'professional', 'enterprise')
  );

COMMENT ON COLUMN public.profiles.plan_selection_status IS
  'First-login plan selection state: NOT_SELECTED, FREE_SELECTED, TRIAL_SELECTED, PAID_PENDING_CHECKOUT, PAID_ACTIVE.';
COMMENT ON COLUMN public.profiles.selected_plan_at IS
  'When the user most recently committed a plan selection in onboarding.';
COMMENT ON COLUMN public.profiles.pending_checkout_provider IS
  'Billing provider for an incomplete paid checkout, currently paddle.';
COMMENT ON COLUMN public.profiles.pending_checkout_plan IS
  'Paid plan selected but not yet fully activated from checkout.';

NOTIFY pgrst, 'reload schema';
