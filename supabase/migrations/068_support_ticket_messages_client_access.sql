-- Support ticket thread messages + subscriber (client) RLS for owner/admin/accountant.
-- Status lifecycle: open, pending, resolved, closed (maps former in_progress -> pending).

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_created
  ON public.support_ticket_messages(ticket_id, created_at ASC);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Backfill thread from existing tickets (one initial message per ticket).
INSERT INTO public.support_ticket_messages (ticket_id, author_user_id, body, is_staff, created_at)
SELECT t.id, t.created_by_user_id, t.details, false, t.created_at
FROM public.support_tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_ticket_messages m WHERE m.ticket_id = t.id
);

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;

UPDATE public.support_tickets
SET status = 'pending'
WHERE status = 'in_progress';

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open', 'pending', 'resolved', 'closed'));

-- Internal staff: full access to messages (mirror ticket policies pattern).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_messages'
      AND policyname = 'Internal staff can read ticket messages'
  ) THEN
    CREATE POLICY "Internal staff can read ticket messages"
      ON public.support_ticket_messages
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
      AND tablename = 'support_ticket_messages'
      AND policyname = 'Internal staff can insert ticket messages'
  ) THEN
    CREATE POLICY "Internal staff can insert ticket messages"
      ON public.support_ticket_messages
      FOR INSERT
      WITH CHECK (
        is_staff = true
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.internal_admin_role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;

-- Subscriber workspace: owner / admin / accountant on target business can read messages for that ticket.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_messages'
      AND policyname = 'Business support roles can read ticket messages'
  ) THEN
    CREATE POLICY "Business support roles can read ticket messages"
      ON public.support_ticket_messages
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.support_tickets t
          WHERE t.id = ticket_id
            AND t.target_business_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1 FROM public.businesses b
                WHERE b.id = t.target_business_id AND b.owner_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1 FROM public.business_members bm
                WHERE bm.business_id = t.target_business_id
                  AND bm.user_id = auth.uid()
                  AND bm.role IN ('admin', 'accountant')
                  AND bm.suspended_at IS NULL
                  AND bm.deactivated_at IS NULL
              )
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_messages'
      AND policyname = 'Business support roles can insert client replies'
  ) THEN
    CREATE POLICY "Business support roles can insert client replies"
      ON public.support_ticket_messages
      FOR INSERT
      WITH CHECK (
        is_staff = false
        AND author_user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.support_tickets t
          WHERE t.id = ticket_id
            AND t.target_business_id IS NOT NULL
            AND (
              EXISTS (
                SELECT 1 FROM public.businesses b
                WHERE b.id = t.target_business_id AND b.owner_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1 FROM public.business_members bm
                WHERE bm.business_id = t.target_business_id
                  AND bm.user_id = auth.uid()
                  AND bm.role IN ('admin', 'accountant')
                  AND bm.suspended_at IS NULL
                  AND bm.deactivated_at IS NULL
              )
            )
        )
      );
  END IF;
END $$;

-- Subscriber SELECT on tickets (internal admin already has a policy; policies OR together).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'Business support roles can read business tickets'
  ) THEN
    CREATE POLICY "Business support roles can read business tickets"
      ON public.support_tickets
      FOR SELECT
      USING (
        target_business_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = target_business_id AND b.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.business_members bm
            WHERE bm.business_id = target_business_id
              AND bm.user_id = auth.uid()
              AND bm.role IN ('admin', 'accountant')
              AND bm.suspended_at IS NULL
              AND bm.deactivated_at IS NULL
          )
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
      AND policyname = 'Business support roles can create tickets for business'
  ) THEN
    CREATE POLICY "Business support roles can create tickets for business"
      ON public.support_tickets
      FOR INSERT
      WITH CHECK (
        created_by_user_id = auth.uid()
        AND target_user_id = auth.uid()
        AND target_business_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = target_business_id AND b.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.business_members bm
            WHERE bm.business_id = target_business_id
              AND bm.user_id = auth.uid()
              AND bm.role IN ('admin', 'accountant')
              AND bm.suspended_at IS NULL
              AND bm.deactivated_at IS NULL
          )
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.support_ticket_messages IS
  'Threaded replies for support_tickets; is_staff distinguishes Zenzex staff vs subscriber.';

NOTIFY pgrst, 'reload schema';
