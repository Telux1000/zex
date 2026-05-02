-- Align waitlist with business profile industry (key) naming; keep business_type for legacy free-text rows.

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS industry TEXT NULL;

UPDATE public.waitlist
SET industry = NULLIF(TRIM(business_type), '')
WHERE industry IS NULL
  AND business_type IS NOT NULL
  AND TRIM(business_type) <> '';

COMMENT ON COLUMN public.waitlist.industry IS
  'Industry option key (matches business profile industry_key values) or legacy free-text copied from business_type.';
