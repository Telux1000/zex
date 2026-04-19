-- Pending team invites: token-based acceptance before business_members row is created.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.business_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (
    role = ANY (
      ARRAY['admin'::text, 'accountant'::text, 'staff'::text, 'viewer'::text]
    )
  ),
  token_hash text NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_team_invites_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_business_team_invites_business_email
  ON public.business_team_invites (business_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_business_team_invites_expires
  ON public.business_team_invites (expires_at)
  WHERE accepted_at IS NULL;

ALTER TABLE public.business_team_invites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.business_team_invites IS 'Tokenized invites; accepted_at set when user joins. Service role / server only.';

NOTIFY pgrst, 'reload schema';
