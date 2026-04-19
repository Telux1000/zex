-- Permanent human-readable profile account numbers (Z0001, …) and audit log identity snapshots.

CREATE SEQUENCE IF NOT EXISTS public.user_account_number_seq;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_number TEXT;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM public.profiles
)
UPDATE public.profiles p
SET account_number = 'Z' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE p.id = o.id AND (p.account_number IS NULL OR trim(p.account_number) = '');

ALTER TABLE public.profiles
  ALTER COLUMN account_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_number_key ON public.profiles (account_number);

SELECT setval(
  'public.user_account_number_seq',
  GREATEST(
    1::bigint,
    (SELECT COUNT(*)::bigint FROM public.profiles)
  )
);

CREATE OR REPLACE FUNCTION public.profiles_assign_account_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_number IS NULL OR trim(COALESCE(NEW.account_number, '')) = '' THEN
    NEW.account_number := 'Z' || lpad(nextval('public.user_account_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_account_number_trigger ON public.profiles;
CREATE TRIGGER profiles_assign_account_number_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_assign_account_number();

CREATE OR REPLACE FUNCTION public.profiles_prevent_account_number_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.account_number IS NOT NULL
     AND NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    RAISE EXCEPTION 'profiles.account_number is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_account_number_change_trigger ON public.profiles;
CREATE TRIGGER profiles_prevent_account_number_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_prevent_account_number_change();

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_account_number TEXT,
  ADD COLUMN IF NOT EXISTS target_user_id UUID,
  ADD COLUMN IF NOT EXISTS target_account_number TEXT,
  ADD COLUMN IF NOT EXISTS target_name_snapshot TEXT;

NOTIFY pgrst, 'reload schema';
