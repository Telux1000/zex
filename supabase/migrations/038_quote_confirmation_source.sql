ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS confirmation_source TEXT NULL;
