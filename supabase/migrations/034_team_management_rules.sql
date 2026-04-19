-- Team management hardening:
-- - business_members suspension status
-- - audit_logs supports entity_type = 'team'

ALTER TABLE public.business_members
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_business_members_suspended_at
  ON public.business_members (business_id, suspended_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_logs_entity_type_check'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_entity_type_check;
  END IF;
END $$;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_entity_type_check
  CHECK (entity_type IN ('customer', 'invoice', 'payment', 'team'));

NOTIFY pgrst, 'reload schema';

