import { normalizeInvoiceCurrencyFields } from '@/lib/invoices/currency-edit';
import type { SavedBusiness, SavedInvoice, SavedInvoiceItem } from '@/types/invoice-preview';

export type InvoicePreviewSavedBundle = {
  business: SavedBusiness;
  invoice: SavedInvoice;
  items: SavedInvoiceItem[];
};

/**
 * Supabase/PostgREST may embed a many-to-one relation as either an object or a single-element array.
 * Normalize so preview mapping matches the invoice detail page payload.
 */
function normalizeEmbeddedBusinessesPayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    if (
      raw.length === 1 &&
      raw[0] !== null &&
      typeof raw[0] === 'object' &&
      !Array.isArray(raw[0])
    ) {
      return raw[0] as Record<string, unknown>;
    }
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/** Minimal business row when `businesses` embed is missing (serialization quirks after Object.assign, etc.). */
function fallbackBusinessFromInvoiceRaw(raw: Record<string, unknown>): SavedBusiness {
  const cur = String(raw.currency ?? 'USD')
    .trim()
    .toUpperCase() || 'USD';
  return {
    name: 'Business',
    currency: cur,
    logo_url: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    postal_code: null,
    country: null,
    tax_id: null,
    payment_settings: null,
    stripe_charges_enabled: false,
  };
}

/** Map GET /api/invoices/[id] JSON to the shape expected by InvoicePreviewSaved (same data as invoice detail). */
export function mapApiInvoiceJsonToPreviewSaved(raw: Record<string, unknown>): InvoicePreviewSavedBundle | null {
  const idStr = String(raw.id ?? '').trim();
  if (!idStr) return null;

  const embedded = normalizeEmbeddedBusinessesPayload(raw.businesses);
  const business: SavedBusiness = embedded
    ? {
        name: String(embedded.name ?? 'Business'),
        currency: String(embedded.currency ?? raw.currency ?? 'USD'),
        logo_url: (embedded.logo_url as string | null | undefined) ?? null,
        address_line1: (embedded.address_line1 as string | null) ?? null,
        address_line2: (embedded.address_line2 as string | null) ?? null,
        city: (embedded.city as string | null) ?? null,
        state: (embedded.state as string | null) ?? null,
        postal_code: (embedded.postal_code as string | null) ?? null,
        country: (embedded.country as string | null) ?? null,
        tax_id: (embedded.tax_id as string | null) ?? null,
        payment_settings: (embedded.payment_settings as SavedBusiness['payment_settings']) ?? null,
        stripe_charges_enabled: Boolean(embedded.stripe_charges_enabled),
      }
    : fallbackBusinessFromInvoiceRaw(raw);

  const normalizedCurrency = normalizeInvoiceCurrencyFields(
    {
      currency: (raw.currency as string | undefined) ?? business.currency,
      base_currency_code: (raw.base_currency_code as string | undefined) ?? business.currency,
      exchange_rate_to_base: (raw.exchange_rate_to_base as number | null | undefined) ?? null,
      subtotal: Number(raw.subtotal),
      tax_amount: Number(raw.tax_amount),
      total: Number(raw.total),
      subtotal_in_base: (raw.subtotal_in_base as number | null | undefined) ?? null,
      tax_amount_in_base: (raw.tax_amount_in_base as number | null | undefined) ?? null,
      total_in_base: (raw.total_in_base as number | null | undefined) ?? null,
    },
    business.currency
  );

  const scheduleRaw = raw.invoice_payment_schedule_items;
  const payment_schedule = Array.isArray(scheduleRaw)
    ? scheduleRaw.map((row) => {
        const r = row as Record<string, unknown>;
        const st = String(r.status ?? '').toLowerCase();
        const rowStatus: 'pending' | 'paid' | 'refund' =
          st === 'paid' ? 'paid' : st === 'refund' ? 'refund' : 'pending';
        return {
          id: String(r.id ?? ''),
          description: String(r.description ?? ''),
          amount: Number(r.amount ?? 0),
          due_date: String(r.due_date ?? ''),
          status: rowStatus,
          paid_at: (r.paid_at as string | null | undefined) ?? null,
        };
      })
    : undefined;

  const invoice: SavedInvoice = {
    invoice_number: String(raw.invoice_number ?? ''),
    reference_po: (raw.reference_po as string | null | undefined) ?? null,
    issue_date: String(raw.issue_date ?? ''),
    due_date: String(raw.due_date ?? ''),
    paid_at: (raw.paid_at as string | null | undefined) ?? null,
    status: String(raw.status ?? 'draft'),
    customer_name: String(raw.customer_name ?? ''),
    customer_email: (raw.customer_email as string | null | undefined) ?? null,
    sourceQuoteId: (raw.source_quote_id as string | null | undefined) ?? null,
    sourceQuoteNumber: (raw.source_quote_number as string | null | undefined) ?? null,
    convertedFromQuote: (raw.converted_from_quote as boolean | null | undefined) ?? false,
    convertedAt: (raw.converted_at as string | null | undefined) ?? null,
    currency: normalizedCurrency.currency,
    base_currency_code: normalizedCurrency.base_currency_code,
    exchange_rate_to_base: normalizedCurrency.exchange_rate_to_base,
    subtotal_in_base: normalizedCurrency.subtotal_in_base ?? null,
    tax_amount_in_base: normalizedCurrency.tax_amount_in_base ?? null,
    total_in_base: normalizedCurrency.total_in_base ?? null,
    subtotal: normalizedCurrency.subtotal ?? 0,
    tax_amount: normalizedCurrency.tax_amount ?? 0,
    total: normalizedCurrency.total ?? 0,
    amount_paid: raw.amount_paid != null ? Number(raw.amount_paid) : 0,
    total_refunded:
      (raw as { total_refunded?: number | null }).total_refunded != null
        ? Number((raw as { total_refunded?: number | null }).total_refunded)
        : 0,
    balance_due:
      raw.balance_due != null
        ? Number(raw.balance_due)
        : Math.max(
            0,
            (normalizedCurrency.total ?? 0) - (raw.amount_paid != null ? Number(raw.amount_paid) : 0)
          ),
    discount_amount: raw.discount_amount != null ? Number(raw.discount_amount) : 0,
    discount_percent:
      raw.discount_percent != null ? Number(raw.discount_percent) : null,
    tax_percent: raw.tax_percent != null ? Number(raw.tax_percent) : null,
    notes: (raw.notes as string | null | undefined) ?? null,
    terms: (raw.terms as string | null | undefined) ?? null,
    metadata: (raw.metadata as SavedInvoice['metadata']) ?? null,
    scheduled_send_at: (raw.scheduled_send_at as string | null | undefined) ?? null,
    scheduled_send_timezone: (raw.scheduled_send_timezone as string | null | undefined) ?? null,
    show_time_summary: !!(raw as { show_time_summary?: boolean }).show_time_summary,
    payment_schedule: payment_schedule ?? [],
  };

  const rawItems = raw.invoice_items;
  const itemsList: unknown[] = Array.isArray(rawItems)
    ? rawItems
    : rawItems != null && typeof rawItems === 'object' && !Array.isArray(rawItems)
      ? [rawItems]
      : [];
  const items: SavedInvoiceItem[] = itemsList
        .slice()
        .sort((a, b) => {
          const sa = Number((a as { sort_order?: number }).sort_order ?? 0);
          const sb = Number((b as { sort_order?: number }).sort_order ?? 0);
          return sa - sb;
        })
        .map((row) => {
          const i = row as Record<string, unknown>;
          return {
            name: String(i.name ?? ''),
            description: (i.description as string | null | undefined) ?? null,
            quantity: Number(i.quantity ?? 0),
            unit_price: Number(i.unit_price ?? 0),
            unit_label: (i.unit_label as string | null | undefined) ?? 'item',
            amount: Number(i.amount ?? 0),
            tax_percent: i.tax_percent != null ? Number(i.tax_percent) : 0,
            assignee: (i.assignee as string | null | undefined) ?? null,
          };
        });

  return { business, invoice, items };
}
