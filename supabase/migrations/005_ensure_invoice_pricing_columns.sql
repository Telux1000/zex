-- Add missing invoice pricing columns. Run this if you get:
-- "Could not find the 'discount_amount' column of 'invoices' in the schema cache"
-- Safe to run multiple times (IF NOT EXISTS).

-- Invoices: pricing and optional fields
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reference_po TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terms TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Line items: per-line tax
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;
