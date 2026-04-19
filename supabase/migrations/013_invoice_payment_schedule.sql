-- Add invoice payment schedule support (deposits, milestones, installments)
-- Keeps compatibility with existing due_date by setting it to the latest scheduled due_date when schedule is enabled.

-- Ensure payments table exists (some DBs may not have run 001_initial_schema.sql fully)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  method TEXT,
  status TEXT NOT NULL DEFAULT 'succeeded',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_business ON public.payments(business_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS use_payment_schedule BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Backfill balance_due for existing invoices
UPDATE public.invoices
SET balance_due = GREATEST(0, COALESCE(total, 0) - COALESCE(amount_paid, 0))
WHERE balance_due IS NULL OR balance_due = 0;

CREATE TABLE IF NOT EXISTS public.invoice_payment_schedule_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT invoice_payment_schedule_status_chk CHECK (status IN ('pending', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_schedule_invoice_id
  ON public.invoice_payment_schedule_items(invoice_id);

