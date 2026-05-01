-- Waitlist admin invites + conversion tracking (linked auth user after signup).

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS invite_token_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS linked_user_id UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_invite_token_hash_unique
  ON public.waitlist (invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;

COMMENT ON COLUMN public.waitlist.invite_token_hash IS 'SHA256 of secret invite token; only hash stored.';
COMMENT ON COLUMN public.waitlist.linked_user_id IS 'auth.users id after signup via invite link; used to mark converted on paid subscription.';
