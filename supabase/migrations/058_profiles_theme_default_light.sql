-- Default UI theme for new profiles: light (was system).
ALTER TABLE public.profiles
  ALTER COLUMN theme SET DEFAULT 'light';
