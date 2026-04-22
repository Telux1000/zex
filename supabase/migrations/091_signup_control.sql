CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  signup_mode TEXT NOT NULL DEFAULT 'OPEN' CHECK (signup_mode IN ('OPEN', 'CLOSED', 'INVITE_ONLY')),
  signup_message TEXT NULL,
  updated_by UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.app_settings IS
  'Singleton application configuration, including public signup control mode.';

CREATE TABLE IF NOT EXISTS public.signup_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NULL,
  created_by UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  used_by UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS signup_invites_expires_at_idx ON public.signup_invites (expires_at);
CREATE INDEX IF NOT EXISTS signup_invites_used_at_idx ON public.signup_invites (used_at);

ALTER TABLE public.signup_invites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.signup_invites IS
  'Invite tokens for INVITE_ONLY public signup mode. Tokens are stored as sha256 hashes.';
