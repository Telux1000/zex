-- Product usage analytics: page views and optional feature_use events (tenant-scoped, not billing).

CREATE TABLE IF NOT EXISTS public.product_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('page_view', 'feature_use')),
  target_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_usage_events_created ON public.product_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_usage_events_kind_target_created
  ON public.product_usage_events (kind, target_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_usage_events_user_created
  ON public.product_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_usage_events_business_created
  ON public.product_usage_events (business_id, created_at DESC);

COMMENT ON TABLE public.product_usage_events IS
  'Anonymous product analytics: section visits and feature signals; aggregated in admin.';

ALTER TABLE public.product_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_usage_events_insert ON public.product_usage_events;

CREATE POLICY product_usage_events_insert ON public.product_usage_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.business_can_see(business_id, (SELECT auth.uid()))
  );

-- No SELECT for tenants by default; admin reads via service role.

NOTIFY pgrst, 'reload schema';
