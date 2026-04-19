-- Extend activity feed for expenses (logged from API; older rows still derived in app).
-- No-op if public.activity_type does not exist (e.g. activity_events.type is TEXT or schema differs).
DO $body$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'activity_type'
  ) THEN
    ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'expense_created';
    ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'expense_updated';
    ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'expense_deleted';
    ALTER TYPE public.activity_type ADD VALUE IF NOT EXISTS 'expense_attachment_added';
  END IF;
END $body$;
