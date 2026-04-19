-- Internal Zenzex staff invitations (separate from subscriber workspace team invites).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Suspension without stripping role (reactivation clears timestamp).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS internal_admin_suspended_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.profiles.internal_admin_suspended_at IS
  'When set, internal back-office access is denied until cleared (service_role only).';

-- Who invited this staff member (set on invite acceptance; owner may be null).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS internal_admin_invited_by UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.internal_admin_invited_by IS
  'auth.users id of Zenzex staff who invited this user; service_role sets on accept.';

CREATE TABLE IF NOT EXISTS public.internal_staff_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'support')),
  token_hash TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  last_resend_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  CONSTRAINT internal_staff_invites_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_internal_staff_invites_email
  ON public.internal_staff_invites (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_internal_staff_invites_expires
  ON public.internal_staff_invites (expires_at)
  WHERE
    status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS internal_staff_invites_one_pending_email
  ON public.internal_staff_invites (LOWER(email))
  WHERE
    status = 'pending';

ALTER TABLE public.internal_staff_invites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.internal_staff_invites IS
  'Zenzex internal staff invites; server/service_role only (no client policies).';

-- Extend existing guard: internal_admin_suspended_at and internal_admin_invited_by only via service_role.
CREATE OR REPLACE FUNCTION public.profiles_guard_internal_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := auth.jwt() ->> 'role';

  IF jwt_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.internal_admin_role IS NOT NULL AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'internal_admin_role cannot be set by client sessions';
    END IF;
    IF NEW.internal_admin_suspended_at IS NOT NULL AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'internal_admin_suspended_at cannot be set by client sessions';
    END IF;
    IF NEW.internal_admin_invited_by IS NOT NULL AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'internal_admin_invited_by cannot be set by client sessions';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.internal_admin_role IS DISTINCT FROM OLD.internal_admin_role THEN
      IF jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'internal_admin_role cannot be changed by client sessions';
      END IF;
    END IF;
    IF NEW.internal_admin_suspended_at IS DISTINCT FROM OLD.internal_admin_suspended_at THEN
      IF jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'internal_admin_suspended_at cannot be changed by client sessions';
      END IF;
    END IF;
    IF NEW.internal_admin_invited_by IS DISTINCT FROM OLD.internal_admin_invited_by THEN
      IF jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'internal_admin_invited_by cannot be changed by client sessions';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
