-- When money was received (for reporting). Aligns with invoice.paid_at semantics; backfilled from created_at.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

UPDATE public.payments
SET paid_at = COALESCE(paid_at, created_at)
WHERE paid_at IS NULL;

ALTER TABLE public.payments
  ALTER COLUMN paid_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_payments_business_paid_at
  ON public.payments (business_id, paid_at DESC)
  WHERE status = 'succeeded';
