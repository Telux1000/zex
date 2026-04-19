-- Stripe Connect: add dedicated columns to businesses for onboarding and connection status.
-- Safe for existing rows: ADD COLUMN IF NOT EXISTS with defaults; existing businesses get the defaults.
-- Do not modify unrelated tables or columns.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_status TEXT NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.businesses.stripe_account_id IS 'Stripe Connect account id (acct_xxx) when business onboarded';
COMMENT ON COLUMN public.businesses.stripe_onboarding_status IS 'Stripe onboarding state: not_connected, onboarding_required, details_submitted, etc.';
COMMENT ON COLUMN public.businesses.stripe_charges_enabled IS 'Whether the connected Stripe account can accept charges';
COMMENT ON COLUMN public.businesses.stripe_payouts_enabled IS 'Whether the connected Stripe account can receive payouts';
COMMENT ON COLUMN public.businesses.stripe_details_submitted IS 'Whether the connected account has submitted required details to Stripe';
