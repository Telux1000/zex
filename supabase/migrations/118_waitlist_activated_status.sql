-- Signup lifecycle: pending / invited → activated (account created) → converted (paid).

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ NULL;

ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS waitlist_status_check;

ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_status_check
  CHECK (status IN ('pending', 'invited', 'activated', 'converted'));

COMMENT ON COLUMN public.waitlist.activated_at IS 'Set when the waitlist email creates an auth account (signup).';
