-- Admin-only internal operations: audit logs + support tickets.

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'admin', 'support')),
  action TEXT NOT NULL,
  target_type TEXT NULL,
  target_id TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor
  ON public.admin_audit_logs(actor_user_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_audit_logs'
      AND policyname = 'Admin roles can read admin audit logs'
  ) THEN
    CREATE POLICY "Admin roles can read admin audit logs"
      ON public.admin_audit_logs
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_audit_logs'
      AND policyname = 'Admin roles can insert admin audit logs'
  ) THEN
    CREATE POLICY "Admin roles can insert admin audit logs"
      ON public.admin_audit_logs
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  invoice_id UUID NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON public.support_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON public.support_tickets(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_target_user
  ON public.support_tickets(target_user_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_invoice
  ON public.support_tickets(invoice_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'Admin roles can read support tickets'
  ) THEN
    CREATE POLICY "Admin roles can read support tickets"
      ON public.support_tickets
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'Admin roles can create support tickets'
  ) THEN
    CREATE POLICY "Admin roles can create support tickets"
      ON public.support_tickets
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'Admin roles can update support tickets'
  ) THEN
    CREATE POLICY "Admin roles can update support tickets"
      ON public.support_tickets
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner', 'admin', 'support')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;
