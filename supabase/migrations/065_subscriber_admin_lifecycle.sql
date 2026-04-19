-- Subscriber account / user lifecycle for Zenzex admin back office (service_role writes).

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS admin_suspended_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS admin_deactivated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.businesses.admin_suspended_at IS
  'Temporary admin suspension of the subscriber workspace; blocks tenant use until cleared.';
COMMENT ON COLUMN public.businesses.admin_deactivated_at IS
  'Stronger admin shutdown; blocks tenant use; preserved for audit.';

CREATE INDEX IF NOT EXISTS idx_businesses_admin_lifecycle
  ON public.businesses (admin_deactivated_at, admin_suspended_at)
  WHERE admin_deactivated_at IS NOT NULL OR admin_suspended_at IS NOT NULL;

ALTER TABLE public.business_members
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.business_members.suspended_at IS
  'Temporary suspension of this member (login blocked for this account context).';
COMMENT ON COLUMN public.business_members.deactivated_at IS
  'Stronger member disable; preserved for audit.';

-- Owner has no business_members row; store admin lifecycle on profile (service_role only in app).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscriber_admin_suspended_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS subscriber_admin_deactivated_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.profiles.subscriber_admin_suspended_at IS
  'Temporary admin suspension of this subscriber user (owner); blocks product use.';
COMMENT ON COLUMN public.profiles.subscriber_admin_deactivated_at IS
  'Stronger admin disable for this subscriber user; blocks product use.';

-- Only service_role may set admin lifecycle columns on businesses (subscribers must not self-clear).
CREATE OR REPLACE FUNCTION public.businesses_guard_admin_lifecycle()
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
  IF TG_OP = 'UPDATE' THEN
    IF (
      NEW.admin_suspended_at IS DISTINCT FROM OLD.admin_suspended_at
      OR NEW.admin_deactivated_at IS DISTINCT FROM OLD.admin_deactivated_at
    ) AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'business admin lifecycle fields cannot be changed by client sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_guard_admin_lifecycle_trigger ON public.businesses;
CREATE TRIGGER businesses_guard_admin_lifecycle_trigger
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE PROCEDURE public.businesses_guard_admin_lifecycle();

-- Tenant team uses suspended_at; only service_role may set deactivated_at (Zenzex admin).
CREATE OR REPLACE FUNCTION public.business_members_guard_admin_deactivated()
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
  IF TG_OP = 'UPDATE' THEN
    IF NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'business_members.deactivated_at cannot be changed by client sessions';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.deactivated_at IS NOT NULL AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'business_members.deactivated_at cannot be set by client sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_members_guard_admin_deactivated_trigger ON public.business_members;
CREATE TRIGGER business_members_guard_admin_deactivated_trigger
  BEFORE INSERT OR UPDATE ON public.business_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.business_members_guard_admin_deactivated();

CREATE OR REPLACE FUNCTION public.profiles_guard_subscriber_admin_lifecycle()
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
    IF (NEW.subscriber_admin_suspended_at IS NOT NULL OR NEW.subscriber_admin_deactivated_at IS NOT NULL)
      AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'subscriber admin lifecycle fields cannot be set by client sessions';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (
      NEW.subscriber_admin_suspended_at IS DISTINCT FROM OLD.subscriber_admin_suspended_at
      OR NEW.subscriber_admin_deactivated_at IS DISTINCT FROM OLD.subscriber_admin_deactivated_at
    ) AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'subscriber admin lifecycle fields cannot be changed by client sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_subscriber_admin_lifecycle_trigger ON public.profiles;
CREATE TRIGGER profiles_guard_subscriber_admin_lifecycle_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_guard_subscriber_admin_lifecycle();
