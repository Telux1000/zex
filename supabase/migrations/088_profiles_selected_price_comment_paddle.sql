-- Clarify that locked SaaS price IDs are Paddle catalog prices (legacy column name retained).
COMMENT ON COLUMN public.profiles.selected_stripe_price_id IS
  'Paddle catalog price ID (`pri_*`) chosen at plan selection; legacy column name.';

COMMENT ON COLUMN public.profiles.subscription_status IS
  'SaaS lifecycle (trialing, active, past_due, trial_expired, cancelled); source of truth is Paddle Billing webhooks.';

NOTIFY pgrst, 'reload schema';
