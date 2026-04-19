-- Persist selected SaaS billing interval and locked Stripe Price ID (before Checkout).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_interval TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_billing_interval_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_billing_interval_check
  CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'yearly'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS selected_stripe_price_id TEXT;

COMMENT ON COLUMN public.profiles.billing_interval IS
  'Self-serve SaaS: monthly or yearly price selection at signup/pricing step.';

COMMENT ON COLUMN public.profiles.selected_stripe_price_id IS
  'Stripe Price ID chosen at plan selection (trial start); used later for Checkout/subscription.';

NOTIFY pgrst, 'reload schema';
