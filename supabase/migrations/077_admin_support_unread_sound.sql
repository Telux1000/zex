-- Internal staff: per-user read pointers for support threads + unread RPC + notification sound preference.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS internal_support_ticket_sound BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.internal_support_ticket_sound IS
  'When true, the admin console may play a chime for new subscriber (non-staff) support messages.';

-- Internal staff: own read_state rows for any ticket (OR with existing subscriber policies).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_read_state'
      AND policyname = 'Internal staff can read own ticket read state'
  ) THEN
    CREATE POLICY "Internal staff can read own ticket read state"
      ON public.support_ticket_read_state
      FOR SELECT
      USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.internal_admin_role IN ('owner', 'admin', 'support')
        )
        AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_read_state'
      AND policyname = 'Internal staff can insert own ticket read state'
  ) THEN
    CREATE POLICY "Internal staff can insert own ticket read state"
      ON public.support_ticket_read_state
      FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.internal_admin_role IN ('owner', 'admin', 'support')
        )
        AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_ticket_read_state'
      AND policyname = 'Internal staff can update own ticket read state'
  ) THEN
    CREATE POLICY "Internal staff can update own ticket read state"
      ON public.support_ticket_read_state
      FOR UPDATE
      USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.internal_admin_role IN ('owner', 'admin', 'support')
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.internal_admin_role IN ('owner', 'admin', 'support')
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.support_ticket_unread_for_internal_staff ()
RETURNS TABLE (ticket_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.ticket_id, COUNT(*)::bigint
  FROM public.support_ticket_messages m
  INNER JOIN public.support_tickets t ON t.id = m.ticket_id
  LEFT JOIN public.support_ticket_read_state r
    ON r.ticket_id = m.ticket_id AND r.user_id = auth.uid()
  WHERE m.is_staff = false
    AND m.created_at > COALESCE(r.last_read_at, timestamptz '1970-01-01')
  GROUP BY m.ticket_id;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_unread_for_internal_staff () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_ticket_unread_for_internal_staff () TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_ticket_unread_for_internal_staff () TO service_role;

COMMENT ON FUNCTION public.support_ticket_unread_for_internal_staff () IS
  'Per-ticket count of subscriber (is_staff=false) messages after auth.uid() last_read_at; for admin console.';

NOTIFY pgrst, 'reload schema';
