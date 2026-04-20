ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonymized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_locked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_active_business
  ON public.customers (business_id, is_active)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_stripe_customer_id
  ON public.customers (stripe_customer_id);
