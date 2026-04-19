-- Extend businesses for Settings: profile fields and JSONB settings.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- Business profile (used on invoices)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS registration_number TEXT;

-- Settings stored as JSONB for flexibility
-- invoice_settings: { number_prefix, start_number, auto_increment, default_currency, default_payment_terms, default_tax_rate, default_notes, default_terms, show_customer_address, show_tax_breakdown, show_discount_line }
-- payment_settings: { bank_account_name, bank_name, bank_account_number, payment_instructions, stripe_connected, paypal_connected }
-- tax_settings: { default_rate, tax_name, calculation_method, rates: [{ name, rate, default }] }
-- customer_settings: { account_number_format, auto_create_from_invoices, duplicate_detection, default_payment_terms }
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS invoice_settings JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_settings JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tax_settings JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS customer_settings JSONB DEFAULT '{}';

COMMENT ON COLUMN public.businesses.invoice_settings IS 'Invoice numbering, defaults, and appearance options';
COMMENT ON COLUMN public.businesses.payment_settings IS 'Bank details and payment instructions';
COMMENT ON COLUMN public.businesses.tax_settings IS 'Default tax and multiple tax rates';
COMMENT ON COLUMN public.businesses.customer_settings IS 'Customer account format and creation rules';
