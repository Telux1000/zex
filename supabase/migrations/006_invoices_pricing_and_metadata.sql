-- Add all invoice pricing and metadata columns required by the app.
-- Run this in Supabase SQL Editor if you see: "Could not find the 'discount_amount' column of 'invoices' in the schema cache"
-- Safe to run multiple times (IF NOT EXISTS). Uses public schema.

-- 1) Invoices: ensure pricing and metadata columns exist
-- Base schema (001/003) already has: subtotal, tax_amount, total
-- Add: reference_po, discount_amount, terms, metadata
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reference_po TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terms TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 2) Invoice items: per-line tax percent
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- Optional: refresh PostgREST schema cache (Supabase may do this automatically)
-- NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN public.invoices.discount_amount IS 'Discount in currency (e.g. 30 for $30 off)';
COMMENT ON COLUMN public.invoices.metadata IS 'Client billing/contact: contact_person, company, billing_address, etc.';
COMMENT ON COLUMN public.invoice_items.tax_percent IS 'Line-level tax percentage (e.g. 10 for 10%)';
