-- Persist all manual invoice form fields for preview-after-save.
-- invoices: metadata JSONB for reference_po, discount_amount, terms, client billing/contact.
-- invoice_items: tax_percent per line.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reference_po TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terms TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.metadata IS 'Client details: contact_person, company, billing_address, billing_city, billing_state, billing_postal_code, billing_country';
