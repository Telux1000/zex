-- User UI theme preference (light / dark / system) for cross-device persistence.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system'
    CHECK (theme IN ('light', 'dark', 'system'));

COMMENT ON COLUMN public.profiles.theme IS 'UI color scheme: light, dark, or follow system.';

NOTIFY pgrst, 'reload schema';
