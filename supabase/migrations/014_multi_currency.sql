-- Multi-currency: base snapshots on invoices, customer preference, payment reporting in base

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS preferred_currency_code TEXT;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS base_currency_code TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base NUMERIC(18, 8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS subtotal_in_base NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount_in_base NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_in_base NUMERIC(14, 2) NOT NULL DEFAULT 0;

UPDATE public.invoices i
SET
  base_currency_code = COALESCE(NULLIF(TRIM(b.currency), ''), 'USD'),
  exchange_rate_to_base = CASE
    WHEN UPPER(COALESCE(NULLIF(TRIM(i.currency), ''), 'USD')) = UPPER(COALESCE(NULLIF(TRIM(b.currency), ''), 'USD')) THEN 1
    ELSE 1
  END,
  subtotal_in_base = ROUND((i.subtotal * CASE
    WHEN UPPER(COALESCE(NULLIF(TRIM(i.currency), ''), 'USD')) = UPPER(COALESCE(NULLIF(TRIM(b.currency), ''), 'USD')) THEN 1
    ELSE 1
  END)::numeric, 2),
  tax_amount_in_base = ROUND((i.tax_amount * CASE
    WHEN UPPER(COALESCE(NULLIF(TRIM(i.currency), ''), 'USD')) = UPPER(COALESCE(NULLIF(TRIM(b.currency), ''), 'USD')) THEN 1
    ELSE 1
  END)::numeric, 2),
  total_in_base = ROUND((i.total * CASE
    WHEN UPPER(COALESCE(NULLIF(TRIM(i.currency), ''), 'USD')) = UPPER(COALESCE(NULLIF(TRIM(b.currency), ''), 'USD')) THEN 1
    ELSE 1
  END)::numeric, 2)
FROM public.businesses b
WHERE b.id = i.business_id;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_in_base NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS amount_in_invoice_currency NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate_to_invoice NUMERIC(18, 8);

UPDATE public.payments p
SET amount_in_base = ROUND(
  (p.amount * COALESCE(i.exchange_rate_to_base, 1))::numeric,
  2
)
FROM public.invoices i
WHERE i.id = p.invoice_id
  AND UPPER(COALESCE(NULLIF(TRIM(p.currency), ''), '')) = UPPER(COALESCE(NULLIF(TRIM(i.currency), ''), 'USD'));

COMMENT ON COLUMN public.businesses.currency IS 'Company base / reporting currency (ISO 4217)';
COMMENT ON COLUMN public.invoices.base_currency_code IS 'Business base currency at invoice FX snapshot time';
COMMENT ON COLUMN public.invoices.exchange_rate_to_base IS 'Multiply invoice-currency amounts to get base currency';
COMMENT ON COLUMN public.payments.amount_in_base IS 'Payment value in company base currency for reporting';
