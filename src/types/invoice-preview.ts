import type { PaymentSettings } from '@/lib/database.types';

export type SavedBusiness = {
  name: string;
  currency: string;
  logo_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  tax_id?: string | null;
  payment_settings?: PaymentSettings | null;
  stripe_charges_enabled?: boolean;
};

export type SavedInvoiceMetadata = {
  contact_person?: string | null;
  company?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
  billing_phone?: string | null;
  use_delivery_address?: boolean | null;
  delivery_company?: string | null;
  delivery_contact_person?: string | null;
  delivery_email?: string | null;
  delivery_phone?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_state?: string | null;
  delivery_postal_code?: string | null;
  delivery_country?: string | null;
} | null;

export type SavedInvoice = {
  invoice_number: string;
  reference_po?: string | null;
  issue_date: string;
  due_date: string;
  /** When the invoice was fully paid (from `invoices.paid_at`). */
  paid_at?: string | null;
  status: string;
  customer_name: string;
  customer_email?: string | null;
  sourceQuoteId?: string | null;
  sourceQuoteNumber?: string | null;
  convertedFromQuote?: boolean | null;
  convertedAt?: string | null;
  currency?: string | null;
  base_currency_code?: string | null;
  exchange_rate_to_base?: number | null;
  subtotal_in_base?: number | null;
  tax_amount_in_base?: number | null;
  total_in_base?: number | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid?: number;
  /** Cumulative refunds (gross paid on invoice is unchanged). */
  total_refunded?: number;
  balance_due?: number;
  discount_amount?: number;
  discount_percent?: number | null;
  tax_percent?: number | null;
  notes?: string | null;
  terms?: string | null;
  /** When true, derived Time Summary may appear on the invoice document. */
  show_time_summary?: boolean | null;
  metadata?: SavedInvoiceMetadata;
  /** Draft invoice: when the invoice will be emailed automatically. */
  scheduled_send_at?: string | null;
  scheduled_send_timezone?: string | null;
  payment_schedule?: {
    id: string;
    description: string;
    amount: number;
    due_date: string;
    status: 'pending' | 'paid' | 'refund';
    paid_at?: string | null;
  }[];
};

export type SavedInvoiceItem = {
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  /** Billing unit slug; omitted on legacy rows (treated as `item`). */
  unit_label?: string | null;
  amount: number;
  tax_percent?: number;
  /** Optional consultant / staff name for hour-based Time Summary grouping. */
  assignee?: string | null;
};
