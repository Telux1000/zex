-- Public marketing waitlist (writes via service-role API only).

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'landing',
  country TEXT NULL,
  business_type TEXT NULL,
  referral_code TEXT NOT NULL,
  referred_by UUID NULL REFERENCES public.waitlist (id) ON DELETE SET NULL,
  referral_count INTEGER NOT NULL DEFAULT 0 CHECK (referral_count >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'converted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON public.waitlist (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_referral_code_unique ON public.waitlist (referral_code);

COMMENT ON TABLE public.waitlist IS
  'Marketing waitlist signups; inserted by POST /api/waitlist with service role.';

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- No policies: only service role / bypass clients access this table.

CREATE OR REPLACE FUNCTION public.waitlist_increment_referral_count(p_referrer_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.waitlist
  SET referral_count = referral_count + 1
  WHERE id = p_referrer_id;
$$;

REVOKE ALL ON FUNCTION public.waitlist_increment_referral_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.waitlist_increment_referral_count(UUID) TO service_role;
