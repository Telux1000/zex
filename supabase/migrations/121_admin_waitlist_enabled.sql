-- Public marketing waitlist visibility (admin-controlled; does not delete waitlist data).

ALTER TABLE public.admin_platform_settings
  ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.admin_platform_settings.waitlist_enabled IS
  'When false, hide public waitlist UI on the marketing site; POST /api/waitlist returns closed.';
