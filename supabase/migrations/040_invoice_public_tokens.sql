CREATE TABLE IF NOT EXISTS public.invoice_public_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_public_tokens_invoice_id ON public.invoice_public_tokens(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_public_tokens_token_hash ON public.invoice_public_tokens(token_hash);

ALTER TABLE public.invoice_public_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_public_tokens_service_role_only" ON public.invoice_public_tokens;
CREATE POLICY "invoice_public_tokens_service_role_only"
  ON public.invoice_public_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS invoice_public_tokens_updated_at ON public.invoice_public_tokens;
CREATE TRIGGER invoice_public_tokens_updated_at
BEFORE UPDATE ON public.invoice_public_tokens
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at();
