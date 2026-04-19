-- Admin support workflow: priority scale + internal notes (never visible to subscribers).

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_priority_check;

UPDATE public.support_tickets
SET priority = 'medium'
WHERE priority = 'normal';

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

ALTER TABLE public.support_tickets
  ALTER COLUMN priority SET DEFAULT 'medium';

CREATE TABLE IF NOT EXISTS public.support_ticket_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_internal_notes_ticket
  ON public.support_ticket_internal_notes(ticket_id, created_at ASC);

ALTER TABLE public.support_ticket_internal_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_internal_notes'
      AND policyname = 'Internal staff can read internal notes'
  ) THEN
    CREATE POLICY "Internal staff can read internal notes"
      ON public.support_ticket_internal_notes
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.internal_admin_role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_internal_notes'
      AND policyname = 'Internal staff can insert internal notes'
  ) THEN
    CREATE POLICY "Internal staff can insert internal notes"
      ON public.support_ticket_internal_notes
      FOR INSERT
      WITH CHECK (
        author_user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.internal_admin_role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.support_ticket_internal_notes IS
  'Staff-only notes; no RLS for subscriber roles — never joined into client support APIs.';

NOTIFY pgrst, 'reload schema';
