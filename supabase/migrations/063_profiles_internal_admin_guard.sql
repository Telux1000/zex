-- Prevent subscribers from self-promoting via direct PostgREST/client updates to profiles.
-- Only JWT role `service_role` (server-side service key) may set or change internal_admin_role.
-- Migrations and superuser sessions typically have no JWT; those paths are allowed so operators can backfill.

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
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.internal_admin_role IS DISTINCT FROM OLD.internal_admin_role THEN
      IF jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'internal_admin_role cannot be changed by client sessions';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_internal_admin_role_trigger ON public.profiles;
CREATE TRIGGER profiles_guard_internal_admin_role_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_guard_internal_admin_role();

COMMENT ON FUNCTION public.profiles_guard_internal_admin_role() IS
  'Blocks non-service-role JWTs from setting or changing profiles.internal_admin_role.';

-- Promote staff safely: use Supabase SQL Editor (runs as privileged role, no JWT) or a server script
-- using SUPABASE_SERVICE_ROLE_KEY so auth.jwt() role is service_role.
-- Example (SQL Editor): UPDATE public.profiles SET internal_admin_role = 'owner' WHERE id = '<user_uuid>';

NOTIFY pgrst, 'reload schema';
