-- Point-in-time estimated revenue for admin analytics MRR/ARR trends (vs ~30d ago).
-- Written by service role when /api/admin/analytics runs; not exposed to tenant RLS users.

CREATE TABLE IF NOT EXISTS public.admin_analytics_snapshots (
  day_utc DATE NOT NULL PRIMARY KEY,
  mrr_est NUMERIC(14, 2) NOT NULL,
  arr_est NUMERIC(14, 2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_analytics_snapshots IS
  'UTC daily snapshot of list-price MRR/ARR estimates for admin dashboard period-over-period trends.';

ALTER TABLE public.admin_analytics_snapshots ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
