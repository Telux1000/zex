-- Per-user read pointers for support ticket threads (subscriber workspace).

CREATE TABLE IF NOT EXISTS public.support_ticket_read_state (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_read_state_user
  ON public.support_ticket_read_state (user_id);

COMMENT ON TABLE public.support_ticket_read_state IS
  'Last time each user considered messages read; unread = messages from others after last_read_at.';

ALTER TABLE public.support_ticket_read_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_read_state'
      AND policyname = 'Users can read own ticket read state for accessible tickets'
  ) THEN
    CREATE POLICY "Users can read own ticket read state for accessible tickets"
      ON public.support_ticket_read_state
      FOR SELECT
      USING (
        user_id = auth.uid()
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_read_state'
      AND policyname = 'Users can upsert own ticket read state for accessible tickets'
  ) THEN
    CREATE POLICY "Users can upsert own ticket read state for accessible tickets"
      ON public.support_ticket_read_state
      FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_read_state'
      AND policyname = 'Users can update own ticket read state for accessible tickets'
  ) THEN
    CREATE POLICY "Users can update own ticket read state for accessible tickets"
      ON public.support_ticket_read_state
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Batch unread counts for the current user’s workspace (RLS applies to underlying tables).
CREATE OR REPLACE FUNCTION public.support_ticket_unread_for_business (p_business_id uuid)
RETURNS TABLE (ticket_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.ticket_id, COUNT(*)::bigint
  FROM public.support_ticket_messages m
  INNER JOIN public.support_tickets t ON t.id = m.ticket_id AND t.target_business_id = p_business_id
  LEFT JOIN public.support_ticket_read_state r
    ON r.ticket_id = m.ticket_id AND r.user_id = auth.uid()
  WHERE m.author_user_id <> auth.uid()
    AND m.created_at > COALESCE(r.last_read_at, timestamptz '1970-01-01')
  GROUP BY m.ticket_id;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_unread_for_business (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_ticket_unread_for_business (uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_ticket_unread_for_business (uuid) TO service_role;

COMMENT ON FUNCTION public.support_ticket_unread_for_business (uuid) IS
  'Unread inbound message count per ticket for auth.uid() on a business workspace.';

-- Realtime: in the Supabase Dashboard, add `support_ticket_messages` to the `supabase_realtime` publication
-- (Database → Publications) so subscriber clients receive INSERT events for live unread updates.
