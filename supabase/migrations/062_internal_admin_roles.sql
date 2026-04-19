-- Separate internal back-office authorization from subscriber workspace role.
-- `profiles.role` is tenant/business role context; `internal_admin_role` is Zenzex staff access.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS internal_admin_role TEXT NULL
  CHECK (internal_admin_role IN ('owner', 'admin', 'support'));

COMMENT ON COLUMN public.profiles.internal_admin_role IS
  'Internal Zenzex back-office role. Null for normal subscribers.';

-- Tighten admin-area RLS checks to use internal_admin_role only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_audit_logs'
      AND policyname = 'Admin roles can read admin audit logs'
  ) THEN
    DROP POLICY "Admin roles can read admin audit logs" ON public.admin_audit_logs;
  END IF;

  CREATE POLICY "Admin roles can read admin audit logs"
    ON public.admin_audit_logs
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.internal_admin_role IN ('owner', 'admin', 'support')
      )
    );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_audit_logs'
      AND policyname = 'Admin roles can insert admin audit logs'
  ) THEN
    DROP POLICY "Admin roles can insert admin audit logs" ON public.admin_audit_logs;
  END IF;

  CREATE POLICY "Admin roles can insert admin audit logs"
    ON public.admin_audit_logs
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.internal_admin_role IN ('owner', 'admin', 'support')
      )
    );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'Admin roles can read support tickets'
  ) THEN
    DROP POLICY "Admin roles can read support tickets" ON public.support_tickets;
  END IF;

  CREATE POLICY "Admin roles can read support tickets"
    ON public.support_tickets
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.internal_admin_role IN ('owner', 'admin', 'support')
      )
    );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'Admin roles can create support tickets'
  ) THEN
    DROP POLICY "Admin roles can create support tickets" ON public.support_tickets;
  END IF;

  CREATE POLICY "Admin roles can create support tickets"
    ON public.support_tickets
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.internal_admin_role IN ('owner', 'admin', 'support')
      )
    );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'Admin roles can update support tickets'
  ) THEN
    DROP POLICY "Admin roles can update support tickets" ON public.support_tickets;
  END IF;

  CREATE POLICY "Admin roles can update support tickets"
    ON public.support_tickets
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.internal_admin_role IN ('owner', 'admin', 'support')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.internal_admin_role IN ('owner', 'admin', 'support')
      )
    );
END $$;
