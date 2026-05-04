-- How the subscriber operates (labeling / analytics only; not a separate product flow).
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_account_type_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_account_type_check
  CHECK (account_type IN ('individual', 'business'));
