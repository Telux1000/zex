-- Quote -> Invoice linking fields
-- Adds read-only, system-controlled columns used to trace invoice origin.

-- 1) Invoices: store originating quote reference
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS source_quote_id UUID NULL REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_quote_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS converted_from_quote BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ NULL;

-- 2) Quotes: store converted invoice reference
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS converted_invoice_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ NULL;

