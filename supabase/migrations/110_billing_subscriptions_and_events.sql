-- SaaS subscription ledger (Zenzex is source of truth; providers are processors only).
-- Note: public.payments already exists for invoice payments — SaaS payment rows use billing_payments.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses (id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_plan_check CHECK (
    plan_id IN ('starter', 'growth', 'professional', 'enterprise')
  ),
  CONSTRAINT subscriptions_provider_check CHECK (
    provider IN ('flutterwave', 'paystack', 'stripe', 'paddle')
  ),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN (
      'pending_checkout',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired'
    )
  )
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_provider_sub_id_idx ON public.subscriptions (provider, provider_subscription_id);

CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  normalized_event_type TEXT,
  business_id UUID,
  user_id UUID,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_events_provider_check CHECK (
    provider IN ('flutterwave', 'paystack', 'stripe', 'paddle')
  ),
  CONSTRAINT billing_events_unique_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS billing_events_user_id_idx ON public.billing_events (user_id);
CREATE INDEX IF NOT EXISTS billing_events_created_at_idx ON public.billing_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions (id) ON DELETE SET NULL,
  amount NUMERIC(18, 2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_payments_provider_check CHECK (
    provider IN ('flutterwave', 'paystack', 'stripe', 'paddle')
  ),
  CONSTRAINT billing_payments_unique_provider_payment UNIQUE (provider, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS billing_payments_subscription_id_idx ON public.billing_payments (subscription_id);

-- RLS: only service role / backend should touch these (no direct client access).
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;

-- No policies: authenticated users cannot read/write; service role bypasses RLS.

DROP TRIGGER IF EXISTS tr_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER tr_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at();

COMMENT ON TABLE public.subscriptions IS
  'Internal SaaS subscription state per workspace owner; profiles remain the app feature gate, updated in sync.';

-- Extend profile pending checkout to new providers (Paddle remains for legacy).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pending_checkout_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pending_checkout_provider_check
  CHECK (
    pending_checkout_provider IS NULL
    OR pending_checkout_provider IN ('paddle', 'flutterwave', 'paystack', 'stripe')
  );

COMMENT ON COLUMN public.profiles.pending_checkout_provider IS
  'Processor key for an incomplete paid checkout: paddle (legacy) or internal billing (flutterwave/paystack/stripe).';

NOTIFY pgrst, 'reload schema';
