-- Finance settings JSON (e.g. allowed invoice currencies). Consolidate base currency on businesses.currency.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS finance_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.businesses.finance_settings IS 'Finance options: allowed_currencies (ISO codes), etc. Base currency is businesses.currency.';

-- Single source of truth: prefer legacy invoice default, then existing column.
UPDATE public.businesses b
SET currency = UPPER(COALESCE(
  NULLIF(TRIM(b.invoice_settings->>'default_currency'), ''),
  NULLIF(TRIM(b.currency), ''),
  'USD'
));

-- Drop legacy key from invoice_settings so UI/API no longer duplicate state.
UPDATE public.businesses
SET invoice_settings = invoice_settings - 'default_currency'
WHERE invoice_settings ? 'default_currency';
