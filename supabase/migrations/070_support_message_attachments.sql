-- Optional image attachments on support ticket messages (storage path only; files live in Storage).

ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS attachment_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS attachment_content_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_original_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size_bytes INTEGER;

ALTER TABLE public.support_ticket_messages
  DROP CONSTRAINT IF EXISTS support_ticket_messages_body_or_attachment_check;

ALTER TABLE public.support_ticket_messages
  ADD CONSTRAINT support_ticket_messages_body_or_attachment_check
  CHECK (
    (length(trim(COALESCE(body, ''))) > 0)
    OR (
      attachment_storage_path IS NOT NULL
      AND length(trim(attachment_storage_path)) > 0
    )
  );

COMMENT ON COLUMN public.support_ticket_messages.attachment_storage_path IS
  'Private bucket object path (ticket_id/uuid.ext); use signed URLs in the app.';

NOTIFY pgrst, 'reload schema';
