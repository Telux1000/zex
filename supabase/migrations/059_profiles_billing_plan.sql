-- Plan-based feature gating for self-serve SaaS pricing.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_plan TEXT NOT NULL DEFAULT 'starter'
    CHECK (billing_plan IN ('starter', 'growth', 'professional', 'enterprise'));

COMMENT ON COLUMN public.profiles.billing_plan IS
  'Self-serve billing plan: starter, growth, professional, enterprise.';
