-- Contextual waitlist attribution (see POST /api/waitlist).

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS trigger_reason TEXT NULL;

COMMENT ON COLUMN public.waitlist.trigger_reason IS
  'Why the user joined (e.g. currency_not_supported, provider_failed, no_payment_provider, feature_locked).';
