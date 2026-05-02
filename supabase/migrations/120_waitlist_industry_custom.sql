-- Free-text industry when industry option key is `other` (aligned with businesses.industry_other_text).

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS industry_custom TEXT NULL;

COMMENT ON COLUMN public.waitlist.industry_custom IS
  'User description when industry is the shared `other` key; mirrors business profile industry_other_text.';
