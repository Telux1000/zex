-- Repair: ensure suspension column exists for team management.

ALTER TABLE public.business_members
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_business_members_suspended_at
  ON public.business_members (business_id, suspended_at);

NOTIFY pgrst, 'reload schema';

