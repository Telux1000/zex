-- Public share link for invoices (no login). Set at creation / backfilled when missing.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_token_key
  ON public.invoices (public_token)
  WHERE public_token IS NOT NULL;
