-- Reopen public signup and clear temporary pause copy.
-- Uses upsert so this cannot no-op if the singleton row is missing.
INSERT INTO public.app_settings (id, signup_mode, signup_message, updated_at)
VALUES ('default', 'OPEN', NULL, NOW())
ON CONFLICT (id) DO UPDATE
SET
  signup_mode = EXCLUDED.signup_mode,
  signup_message = EXCLUDED.signup_message,
  updated_at = EXCLUDED.updated_at;

NOTIFY pgrst, 'reload schema';
