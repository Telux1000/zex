-- Record invoice refunds as immutable events linked to original payments.
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  reason TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'succeeded',
  stripe_refund_id TEXT,
  refunded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment
  ON public.payment_refunds(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_invoice
  ON public.payment_refunds(invoice_id, refunded_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_business
  ON public.payment_refunds(business_id, refunded_at DESC);
