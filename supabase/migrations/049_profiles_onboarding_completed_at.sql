-- Explicit guided onboarding completion (also derived in app when setup checklist is fully satisfied).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.profiles.onboarding_completed_at IS
  'Set when the user finishes guided onboarding; unlocks full Settings.';
