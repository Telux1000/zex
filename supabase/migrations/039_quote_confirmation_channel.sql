ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS confirmation_channel TEXT NULL;

UPDATE public.quotes
SET confirmation_channel = 'email'
WHERE confirmation_channel IS NULL
  AND confirmation_source = 'email';
