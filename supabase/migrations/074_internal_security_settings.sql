-- Owner-configurable internal back-office security policies (read via service role in API).

CREATE TABLE IF NOT EXISTS public.internal_security_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  require_mfa_for_internal_staff BOOLEAN NOT NULL DEFAULT false,
  invite_ttl_hours INT NOT NULL DEFAULT 72 CHECK (invite_ttl_hours >= 1 AND invite_ttl_hours <= 168),
  session_timeout_minutes INT NULL CHECK (
    session_timeout_minutes IS NULL OR (session_timeout_minutes >= 5 AND session_timeout_minutes <= 10080)
  ),
  password_reset_policy TEXT NOT NULL DEFAULT 'standard' CHECK (password_reset_policy IN ('standard', 'strict')),
  staff_invite_allowed_domains TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.internal_security_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.internal_security_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.internal_security_settings IS
  'Singleton security policies for the internal admin console; accessed only via service role in application APIs.';

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_created
  ON public.admin_audit_logs (action, created_at DESC);
