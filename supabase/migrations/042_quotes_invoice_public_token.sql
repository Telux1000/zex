-- Denormalized copy of invoices.public_token for public quote → invoice deep links.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS invoice_public_token TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_invoice_public_token
  ON public.quotes (invoice_public_token)
  WHERE invoice_public_token IS NOT NULL;
