ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;
