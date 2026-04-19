-- Stable B-codes for internal Zenzex staff (separate from subscriber account_number / Z-codes).

CREATE SEQUENCE IF NOT EXISTS internal_staff_code_seq;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS internal_staff_code TEXT;

COMMENT ON COLUMN public.profiles.internal_staff_code IS
  'Stable internal staff identifier (B001, B002, …). Assigned by trigger; not subscriber Z-codes.';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_internal_staff_code_unique
  ON public.profiles (internal_staff_code)
  WHERE
    internal_staff_code IS NOT NULL
    AND btrim(internal_staff_code) <> '';

-- Backfill existing internal admins (oldest first), then align sequence.
DO $$
DECLARE
  r RECORD;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM public.profiles
    WHERE internal_admin_role IS NOT NULL
    ORDER BY created_at ASC NULLS LAST, id ASC
  LOOP
    n := n + 1;
    UPDATE public.profiles
    SET
      internal_staff_code = 'B' || lpad(n::text, GREATEST(3, length(n::text)), '0')
    WHERE
      id = r.id
      AND (
        internal_staff_code IS NULL
        OR btrim(internal_staff_code) = ''
      );
  END LOOP;

  PERFORM setval('internal_staff_code_seq', GREATEST(n, 1));
END $$;

CREATE OR REPLACE FUNCTION public.profiles_assign_internal_staff_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  seq bigint;
BEGIN
  IF NEW.internal_admin_role IS NOT NULL
  AND (
    NEW.internal_staff_code IS NULL
    OR btrim(COALESCE(NEW.internal_staff_code, '')) = ''
  ) THEN
    seq := nextval('internal_staff_code_seq');
    NEW.internal_staff_code := 'B' || lpad(seq::text, GREATEST(3, length(seq::text)), '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_internal_staff_code_trigger ON public.profiles;

CREATE TRIGGER profiles_assign_internal_staff_code_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_assign_internal_staff_code();

COMMENT ON FUNCTION public.profiles_assign_internal_staff_code() IS
  'Assigns B### internal_staff_code when internal_admin_role is set and code is missing.';

-- Only service_role may set or change internal_staff_code (same as other internal admin fields).
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
    IF NEW.internal_staff_code IS NOT NULL AND btrim(COALESCE(NEW.internal_staff_code, '')) <> '' AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'internal_staff_code cannot be set by client sessions';
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
    IF NEW.internal_staff_code IS DISTINCT FROM OLD.internal_staff_code THEN
      IF jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'internal_staff_code cannot be changed by client sessions';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
