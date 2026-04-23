/** Columns loaded for Settings and onboarding so forms share one server shape. */
export const SETTINGS_BUSINESS_SELECT = `
  id, name, logo_url, currency,
  address_line1, address_line2, city, state, postal_code, country,
  tax_id, tax_name, email, phone, website, registration_number,
  industry_key, industry_label, industry_other_text,
  invoice_settings, finance_settings, payment_settings, tax_settings, customer_settings,
  stripe_account_id, stripe_onboarding_status, stripe_charges_enabled,
  stripe_payouts_enabled, stripe_details_submitted,
  owner_id, created_at, updated_at
`;
