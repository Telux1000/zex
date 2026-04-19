-- Owner-configurable platform defaults and feature flags (service role in app APIs only).

CREATE TABLE IF NOT EXISTS public.admin_platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  feature_ai_assistant_enabled BOOLEAN NOT NULL DEFAULT true,
  feature_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  feature_scheduled_send_enabled BOOLEAN NOT NULL DEFAULT true,
  default_new_account_plan TEXT NOT NULL DEFAULT 'starter' CHECK (
    default_new_account_plan IN ('starter', 'growth', 'professional', 'enterprise')
  ),
  starter_monthly_invoice_limit INT NOT NULL DEFAULT 10 CHECK (
    starter_monthly_invoice_limit >= 1 AND starter_monthly_invoice_limit <= 100000
  ),
  growth_monthly_invoice_limit INT NULL CHECK (
    growth_monthly_invoice_limit IS NULL
    OR (growth_monthly_invoice_limit >= 1 AND growth_monthly_invoice_limit <= 100000)
  ),
  professional_monthly_invoice_limit INT NULL CHECK (
    professional_monthly_invoice_limit IS NULL
    OR (professional_monthly_invoice_limit >= 1 AND professional_monthly_invoice_limit <= 100000)
  ),
  enterprise_monthly_invoice_limit INT NULL CHECK (
    enterprise_monthly_invoice_limit IS NULL
    OR (enterprise_monthly_invoice_limit >= 1 AND enterprise_monthly_invoice_limit <= 100000)
  ),
  trial_days INT NOT NULL DEFAULT 14 CHECK (trial_days >= 0 AND trial_days <= 730),
  admin_alerts_email TEXT NULL,
  system_sender_label TEXT NULL,
  plan_price_starter_cents INT NULL CHECK (plan_price_starter_cents IS NULL OR plan_price_starter_cents >= 0),
  plan_price_growth_cents INT NULL CHECK (plan_price_growth_cents IS NULL OR plan_price_growth_cents >= 0),
  plan_price_professional_cents INT NULL CHECK (
    plan_price_professional_cents IS NULL OR plan_price_professional_cents >= 0
  ),
  plan_price_enterprise_cents INT NULL CHECK (
    plan_price_enterprise_cents IS NULL OR plan_price_enterprise_cents >= 0
  ),
  ai_assistant_daily_requests_per_user INT NOT NULL DEFAULT 50 CHECK (
    ai_assistant_daily_requests_per_user >= 1 AND ai_assistant_daily_requests_per_user <= 100000
  ),
  reminder_default_first_before_due_days INT NULL CHECK (
    reminder_default_first_before_due_days IS NULL
    OR (
      reminder_default_first_before_due_days >= 0
      AND reminder_default_first_before_due_days <= 90
    )
  ),
  scheduling_min_lead_minutes INT NOT NULL DEFAULT 60 CHECK (
    scheduling_min_lead_minutes >= 1 AND scheduling_min_lead_minutes <= 10080
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.admin_platform_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_platform_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_platform_settings IS
  'Singleton platform configuration for Zenzex; read/write only via service role in application APIs.';
