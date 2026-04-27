-- Per-workspace copy for customer payment reminder emails (Postmark template models).
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS reminder_messaging JSONB DEFAULT NULL;

COMMENT ON COLUMN public.businesses.reminder_messaging IS
  'User-edited subject/body templates and tone for automated payment reminder emails.';
