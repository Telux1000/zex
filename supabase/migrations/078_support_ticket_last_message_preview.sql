-- One preview text per ticket for admin queue / inbox lists (DISTINCT ON latest message).

CREATE OR REPLACE FUNCTION public.support_ticket_last_message_previews(p_ticket_ids uuid[])
RETURNS TABLE (ticket_id uuid, preview text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (m.ticket_id)
    m.ticket_id,
    LEFT(
      REGEXP_REPLACE(
        COALESCE(
          NULLIF(TRIM(m.body), ''),
          CASE
            WHEN m.attachment_storage_path IS NOT NULL AND length(trim(m.attachment_storage_path)) > 0
            THEN '[Image]'
            ELSE ''
          END
        ),
        '\s+',
        ' ',
        'g'
      ),
      200
    )::text
  FROM public.support_ticket_messages m
  WHERE m.ticket_id = ANY(p_ticket_ids)
  ORDER BY m.ticket_id, m.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_last_message_previews(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_ticket_last_message_previews(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
