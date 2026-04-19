-- Structured country: canonical display name + ISO alpha-2 for lookups and invoices.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS country_code TEXT;

COMMENT ON COLUMN public.customers.country IS 'Canonical English country name for display';
COMMENT ON COLUMN public.customers.country_code IS 'ISO 3166-1 alpha-2';

CREATE INDEX IF NOT EXISTS idx_customers_business_country_code
  ON public.customers (business_id, country_code)
  WHERE country_code IS NOT NULL;

-- Existing rows: country was often stored as a 2-letter code only
UPDATE public.customers
SET country_code = upper(trim(country))
WHERE country_code IS NULL
  AND country IS NOT NULL
  AND length(trim(country)) = 2
  AND trim(country) ~ '^[A-Za-z]{2}$';
