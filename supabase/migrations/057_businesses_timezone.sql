-- Account timezone for scheduling and display (IANA, e.g. America/New_York).
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';
