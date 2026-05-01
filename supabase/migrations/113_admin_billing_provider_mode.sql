ALTER TABLE public.admin_platform_settings
  ADD COLUMN IF NOT EXISTS billing_provider_mode TEXT NOT NULL
  DEFAULT 'flutterwave_primary_paystack_fallback';

ALTER TABLE public.admin_platform_settings
  DROP CONSTRAINT IF EXISTS admin_platform_settings_billing_provider_mode_check;

ALTER TABLE public.admin_platform_settings
  ADD CONSTRAINT admin_platform_settings_billing_provider_mode_check
  CHECK (
    billing_provider_mode IN (
      'flutterwave_only',
      'paystack_only',
      'flutterwave_primary_paystack_fallback',
      'paystack_primary_flutterwave_fallback'
    )
  );

NOTIFY pgrst, 'reload schema';
