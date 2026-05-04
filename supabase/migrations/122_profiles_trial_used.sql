-- One-time trial consumption flag: prevents restarting a free trial after it was used or expired.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT false;

UPDATE public.profiles
SET trial_used = true
WHERE trial_used = false
  AND lower(coalesce(subscription_status, '')) = 'trial_expired';

UPDATE public.profiles
SET trial_used = true
WHERE trial_used = false
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at < now();

COMMENT ON COLUMN public.profiles.trial_used IS
  'True after the account has consumed its SaaS trial window (started or expired); blocks another internal trial.';

NOTIFY pgrst, 'reload schema';
