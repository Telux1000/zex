-- Distinguish account role for UI and audit context (e.g. owner vs member).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';

COMMENT ON COLUMN public.profiles.role IS 'Application role for the signed-in user (e.g. owner).';
