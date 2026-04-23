-- Reopen public signup and clear temporary pause copy.
-- This resolves stale CLOSED mode showing the paused-signups banner.
UPDATE public.app_settings
SET
  signup_mode = 'OPEN',
  signup_message = NULL,
  updated_at = NOW()
WHERE id = 'default';

NOTIFY pgrst, 'reload schema';
