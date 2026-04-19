DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_status') THEN
    ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'accepted_customer';
    ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'rejected_customer';
  END IF;
END$$;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS customer_actioned_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS public.quote_public_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_public_tokens_quote_id ON public.quote_public_tokens(quote_id);

ALTER TABLE public.quote_public_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct token access" ON public.quote_public_tokens;
CREATE POLICY "No direct token access" ON public.quote_public_tokens
FOR ALL USING (false) WITH CHECK (false);
