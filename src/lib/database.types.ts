/**
 * Zenzex database types (align with Supabase schema).
 * Run `npm run db:types` after Supabase is linked to regenerate from DB.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'paid'
  | 'overdue'
  | 'partially_paid'
  | 'voided';

export type ActivityType =
  | 'invoice_created'
  | 'invoice_sent'
  | 'invoice_viewed'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'invoice_updated'
  | 'invoice_deleted'
  | 'customer_created'
  | 'customer_added'
  | 'customer_updated'
  | 'customer_deleted'
  | 'payment_received'
  | 'payment_partial'
  | 'payment_full'
  | 'ai_insight_generated'
  | 'business_updated'
  | 'expense_created'
  | 'high_expense_created'
  | 'expense_updated'
  | 'expense_deleted'
  | 'expense_attachment_added'
  | 'quote_created'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'quote_expired'
  | 'quote_converted';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  /** Immutable human-readable account id (e.g. Z0001) */
  account_number?: string | null;
  /** API alias for account_number */
  accountNumber?: string | null;
  /** API alias for full_name */
  fullName?: string | null;
  avatar_url: string | null;
  /** Workspace role (e.g. owner); distinct from business contact identity */
  role?: string | null;
  /** Zenzex back-office staff only; never set via public signup or profile API */
  internal_admin_role?: 'owner' | 'admin' | 'support' | null;
  /** UI theme: light, dark, or system */
  theme?: 'light' | 'dark' | 'system' | null;
  /** Self-serve billing tier for feature gating. */
  billing_plan?: 'starter' | 'growth' | 'professional' | 'enterprise' | null;
  /** monthly | yearly — set at signup pricing step with locked catalog price. */
  billing_interval?: 'monthly' | 'yearly' | null;
  /** Locked Paddle catalog price ID (`pri_*`) at plan selection; column name is legacy. */
  selected_stripe_price_id?: string | null;
  /** Set when guided onboarding is finished; unlocks full Settings. */
  onboarding_completed_at?: string | null;
  /** Set when the owner completes the signup pricing step (before workspace setup). */
  onboarding_pricing_completed_at?: string | null;
  /** Internal admin control: when set, automated onboarding follow-ups are paused. */
  onboarding_follow_ups_paused_at?: string | null;
  /** Admin used "Cancel pending follow-ups"; UI shows Cancelled instead of Paused. */
  onboarding_follow_ups_canceled_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** Optional invoice currencies for future multi-currency rules; base is `businesses.currency`. */
export interface FinanceSettings {
  allowed_currencies?: string[];
}

export interface InvoiceSettings {
  number_prefix?: string;
  start_number?: number;
  auto_increment?: boolean;
  default_payment_terms?: string;
  default_tax_rate?: number;
  default_notes?: string;
  default_terms?: string;
  show_customer_address?: boolean;
  show_tax_breakdown?: boolean;
  show_discount_line?: boolean;
}

export interface PaymentSettings {
  // Bank transfer (domestic)
  enable_bank_transfer?: boolean;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_sort_code?: string;
  bank_swift_bic?: string;
  bank_address?: string;

  // International bank transfer (wire)
  enable_international_bank_transfer?: boolean;
  intl_account_name?: string;
  intl_iban?: string;
  intl_swift_bic?: string;
  intl_bank_name?: string;
  intl_bank_address?: string;

  // PayPal
  enable_paypal?: boolean;
  paypal_email?: string;

  // Stripe (card payments)
  enable_stripe_card?: boolean;
  stripe_account_id?: string;
  /** High-level connection status for UI */
  stripe_connect_status?: 'not_connected' | 'onboarding_required' | 'onboarding_in_progress' | 'connected' | 'restricted';
  stripe_connect_disabled_reason?: string | null;
  /** Raw Stripe account fields mirrored for diagnostics */
  stripe_onboarding_status?: string | null;
  stripe_charges_enabled?: boolean;
  stripe_payouts_enabled?: boolean;
  stripe_details_submitted?: boolean;
  /** Backwards-compatible flag; true only when fully connected */
  stripe_connected?: boolean;

  // General payment instructions shown on invoices
  payment_instructions?: string;
  // Quote acceptance automation
  auto_send_invoice_on_quote_accept?: boolean;

  // Early payment discount (prompt pay)
  /** Percentage discount (e.g. 2 for 2%) applied when paid within the window. */
  early_payment_discount_percent?: number;
  /** Discount window in days from invoice issue date. */
  early_payment_discount_days?: number;
}

export interface TaxRateItem {
  name: string;
  rate: number;
  default?: boolean;
}

export interface TaxSettings {
  default_rate?: number;
  tax_name?: string;
  calculation_method?: 'exclusive' | 'inclusive';
  rates?: TaxRateItem[];
}

export interface CustomerSettings {
  account_number_format?: string;
  auto_create_from_invoices?: boolean;
  duplicate_detection?: boolean;
  default_payment_terms?: string;
}

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  logo_url: string | null;
  currency: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  /** IANA timezone for the business (scheduled sends, reporting). */
  timezone?: string;
  tax_id: string | null;
  tax_name: string | null;
  /** Public / customer-facing business email (invoices, Reply-To on outbound mail) */
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  registration_number?: string | null;
  invoice_settings?: InvoiceSettings | null;
  finance_settings?: FinanceSettings | null;
  payment_settings?: PaymentSettings | null;
  tax_settings?: TaxSettings | null;
  customer_settings?: CustomerSettings | null;
  /** Stripe Connect account id (acct_xxx) when business has onboarded */
  stripe_account_id?: string | null;
  /** Stripe onboarding state: not_connected, onboarding_required, details_submitted, etc. */
  stripe_onboarding_status?: string | null;
  /** Whether the connected Stripe account can accept charges */
  stripe_charges_enabled?: boolean;
  /** Whether the connected Stripe account can receive payouts */
  stripe_payouts_enabled?: boolean;
  /** Whether the connected account has submitted required details to Stripe */
  stripe_details_submitted?: boolean;
  created_at: string;
  updated_at: string;
}

/** Per-business membership; owner is always `businesses.owner_id`, not stored here. */
export interface BusinessMember {
  business_id: string;
  user_id: string;
  role: 'admin' | 'accountant' | 'staff' | 'viewer';
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  account_number: string | null;
  name: string;
  email: string | null;
  company: string | null;
  preferred_currency_code?: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  /** ISO 3166-1 alpha-2; canonical display name lives in `country`. */
  country_code?: string | null;
  phone: string | null;
  notes: string | null;
  stripe_customer_id?: string | null;
  is_active?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  anonymized_at?: string | null;
  anonymized_by?: string | null;
  deletion_locked_reason?: string | null;
  /** automaticReminders + reminderTiming — defaults for invoices that follow customer rules */
  reminder_settings?: Json | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  business_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  status: InvoiceStatus;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  base_currency_code?: string;
  exchange_rate_to_base?: number;
  subtotal_in_base?: number;
  tax_amount_in_base?: number;
  total_in_base?: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  use_payment_schedule?: boolean;
  amount_paid?: number;
  balance_due?: number;
  notes: string | null;
  theme_id: string | null;
  stripe_payment_link_id: string | null;
  stripe_payment_intent_id: string | null;
  viewed_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  sourceQuoteId?: string | null;
  sourceQuoteNumber?: string | null;
  convertedFromQuote?: boolean | null;
  convertedAt?: string | null;
  reference_po?: string | null;
  discount_amount?: number;
  terms?: string | null;
  metadata?: Record<string, unknown> | null;
  /** When true, automatic timing comes from the linked customer */
  use_customer_reminder_defaults?: boolean;
  /** scheduledReminderAt and/or override automaticReminders + reminderTiming */
  reminder_settings?: Json | null;
  /** Draft only: auto-send invoice email at this instant (UTC). */
  scheduled_send_at?: string | null;
  scheduled_send_timezone?: string | null;
  /** When true, show derived Time Summary from hour-based line items (+ optional assignee). */
  show_time_summary?: boolean;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  /** Billing unit slug: item, hour, day, week, month, session, project, or custom. */
  unit_label: string;
  /** Optional consultant name for derived Time Summary (not a separate time system). */
  assignee?: string | null;
  sort_order: number;
  created_at: string;
  tax_percent?: number;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'accepted_customer' | 'rejected_customer';

export interface Quote {
  id: string;
  business_id: string;
  quote_number: string;
  customer_id: string | null;
  customer_snapshot: { name: string; email?: string | null; address?: string | null };
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  issue_date: string;
  expiry_date: string | null;
  notes: string | null;
  status: QuoteStatus;
  converted_invoice_id?: string | null;
  converted_invoice_number?: string | null;
  converted_at?: string | null;
  accepted_at?: string | null;
  accepted_via?: string | null;
  accepted_note?: string | null;
  confirmation_channel?: 'email' | 'phone' | 'in_person' | null;
  rejected_at?: string | null;
  rejected_via?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  business_id: string;
  amount: number;
  currency: string;
  amount_in_base?: number;
  exchange_rate_to_base?: number | null;
  amount_in_invoice_currency?: number | null;
  exchange_rate_to_invoice?: number | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  method: string | null;
  status: string;
  metadata: Json | null;
  /** When the payment was received (reporting); backfilled from created_at. */
  paid_at: string | null;
  created_at: string;
}

export interface InvoiceTheme {
  id: string;
  business_id: string;
  name: string;
  template: string;
  primary_color: string;
  font_family: string;
  logo_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityEvent {
  id: string;
  business_id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  metadata: Json | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export type AuditEntityType = 'customer' | 'invoice' | 'payment' | 'team';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'edited'
  | 'sent'
  | 'resent'
  | 'reminder_sent'
  | 'marked_paid'
  | 'partially_paid'
  | 'voided'
  | 'duplicated'
  | 'payment_recorded'
  | 'refund_initiated'
  | 'refund_partial_initiated'
  | 'refund_completed'
  | 'refund_failed'
  | 'payment_plan_created'
  | 'payment_plan_updated'
  | 'archived'
  | 'anonymized'
  | 'restored'
  | 'hard_delete_attempted'
  | 'hard_deleted'
  | 'user_invited'
  | 'invite_resent'
  | 'invite_revoked'
  | 'role_changed'
  | 'user_suspended'
  | 'user_reactivated'
  | 'user_deactivated'
  | 'password_reset_sent';

export interface AuditLog {
  id: string;
  business_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction;
  performed_by_user_id: string | null;
  performed_by_name: string;
  metadata: Json | null;
  created_at: string;
}

export interface AiInsight {
  id: string;
  business_id: string;
  type: string;
  title: string;
  summary: string | null;
  detail: string | null;
  severity: string;
  metadata: Json | null;
  action_label: string | null;
  action_url: string | null;
  created_at: string;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

export interface InvoiceWithRelations extends Invoice {
  items: InvoiceItem[];
  customer: Customer | null;
  theme: InvoiceTheme | null;
}
