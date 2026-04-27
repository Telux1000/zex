/**
 * Dashboard invoice detail (RSC) — lean selects instead of `*`.
 * Keep in sync with fields read in `app/(dashboard)/dashboard/invoices/[id]/page.tsx`
 * (incl. `updated_at` / `created_at` for header metadata).
 */

export const INVOICE_DASHBOARD_ITEM_COLUMNS =
  'name, description, quantity, unit_price, unit_label, amount, tax_percent, sort_order, assignee';

export const INVOICE_DASHBOARD_BUSINESS_EMBED = `
  id,
  name,
  currency,
  logo_url,
  address_line1,
  address_line2,
  city,
  state,
  postal_code,
  country,
  tax_id,
  payment_settings,
  stripe_charges_enabled,
  timezone
`;

/**
 * All invoice row fields the saved preview and actions need (no `select *` on `invoices`).
 */
export const INVOICE_DASHBOARD_CORE_INVOICE_COLUMNS = `
  id,
  business_id,
  customer_id,
  invoice_number,
  reference_po,
  issue_date,
  due_date,
  paid_at,
  status,
  customer_name,
  customer_email,
  source_quote_id,
  source_quote_number,
  converted_from_quote,
  converted_at,
  recurring_rule_id,
  currency,
  base_currency_code,
  exchange_rate_to_base,
  subtotal,
  tax_amount,
  total,
  subtotal_in_base,
  tax_amount_in_base,
  total_in_base,
  amount_paid,
  balance_due,
  total_refunded,
  discount_amount,
  discount_percent,
  tax_percent,
  notes,
  terms,
  metadata,
  use_customer_reminder_defaults,
  reminder_settings,
  use_payment_schedule,
  scheduled_send_at,
  scheduled_send_timezone,
  show_time_summary,
  template_id,
  updated_at,
  created_at
`
  .replace(/\s+/g, ' ')
  .trim();

export function buildInvoiceDashboardCoreSelect(): string {
  return `
    ${INVOICE_DASHBOARD_CORE_INVOICE_COLUMNS},
    invoice_items(${INVOICE_DASHBOARD_ITEM_COLUMNS}),
    customers ( reminder_settings ),
    businesses(
      ${INVOICE_DASHBOARD_BUSINESS_EMBED}
    )
  `;
}

/** Wider `invoices` row; used if the lean select fails (missing columns, PostgREST, etc.). */
export function buildInvoiceDashboardFallbackSelect(): string {
  return `
    *,
    invoice_items(*),
    customers ( reminder_settings ),
    businesses(
      ${INVOICE_DASHBOARD_BUSINESS_EMBED}
    )
  `;
}

export const INVOICE_BUSINESS_STANDALONE_SELECT = INVOICE_DASHBOARD_BUSINESS_EMBED.replace(/\s+/g, ' ').trim();
