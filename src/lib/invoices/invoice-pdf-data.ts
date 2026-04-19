import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPermission } from '@/lib/rbac/permissions';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { normalizeInvoiceCurrencyFields } from '@/lib/invoices/currency-edit';
import { buildInvoiceDocumentPayload } from '@/lib/invoices/invoice-document-payload';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { buildInvoicePdfBase64 } from '@/services/invoice-pdf';
import type { SavedBusiness, SavedInvoice, SavedInvoiceItem } from '@/types/invoice-preview';

export async function buildInvoicePdfBase64ForInvoiceId(
  supabase: SupabaseClient,
  options: { invoiceId: string; ownerUserId: string; paymentUrl?: string | null }
): Promise<{ base64: string; invoiceNumber: string }> {
  const { invoiceId, ownerUserId, paymentUrl } = options;

  const { data: row } = await supabase
    .from('invoices')
    .select(
      `
      *,
      invoice_items(*),
      businesses(
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
        stripe_charges_enabled
      )
    `
    )
    .eq('id', invoiceId)
    .single();

  if (!row) throw new Error('Invoice not found');

  const business = row.businesses as {
    id: string;
    name: string;
    currency: string;
    logo_url?: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    tax_id?: string | null;
    payment_settings?: Record<string, unknown> | null;
    stripe_charges_enabled?: boolean;
  } | null;
  if (!business) throw new Error('Business not found');

  const role = await getEffectiveBusinessRole(supabase, business.id, ownerUserId);
  if (!role || !hasPermission(role, 'view_data')) throw new Error('Forbidden');

  const items = (row.invoice_items ?? []) as {
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    unit_label?: string | null;
    amount: number;
    tax_percent?: number;
    assignee?: string | null;
  }[];

  const savedBusiness: SavedBusiness = {
    name: business.name,
    currency: business.currency,
    logo_url: business.logo_url ?? null,
    address_line1: business.address_line1 ?? null,
    address_line2: business.address_line2 ?? null,
    city: business.city ?? null,
    state: business.state ?? null,
    postal_code: business.postal_code ?? null,
    country: business.country ?? null,
    tax_id: business.tax_id ?? null,
    payment_settings: (business.payment_settings as unknown) ?? null,
    stripe_charges_enabled: business.stripe_charges_enabled ?? false,
  };

  const normalizedCurrency = normalizeInvoiceCurrencyFields(
    {
      currency: (row as { currency?: string }).currency ?? business.currency,
      base_currency_code: (row as { base_currency_code?: string }).base_currency_code ?? business.currency,
      exchange_rate_to_base: (row as { exchange_rate_to_base?: number }).exchange_rate_to_base ?? null,
      subtotal: Number(row.subtotal),
      tax_amount: Number(row.tax_amount),
      total: Number(row.total),
      subtotal_in_base: (row as { subtotal_in_base?: number }).subtotal_in_base ?? null,
      tax_amount_in_base: (row as { tax_amount_in_base?: number }).tax_amount_in_base ?? null,
      total_in_base: (row as { total_in_base?: number }).total_in_base ?? null,
    },
    business.currency
  );

  const savedItems: SavedInvoiceItem[] = items.map((i) => ({
    name: i.name,
    description: i.description ?? null,
    quantity: i.quantity,
    unit_price: Number(i.unit_price),
    unit_label: i.unit_label ?? 'item',
    amount: Number(i.amount),
    tax_percent: i.tax_percent != null ? Number(i.tax_percent) : 0,
    assignee: i.assignee ?? null,
  }));

  const { data: scheduleRows } = await supabase
    .from('invoice_payment_schedule_items')
    .select('id, description, amount, due_date, status, paid_at')
    .eq('invoice_id', row.id)
    .order('due_date', { ascending: true });

  const paymentSchedule = (scheduleRows ?? []).map((r) => ({
    id: String(r.id),
    description: String(r.description),
    amount: Number(r.amount ?? 0),
    due_date: String(r.due_date),
    status: (String(r.status) === 'paid' ? 'paid' : 'pending') as 'pending' | 'paid',
    paid_at: r.paid_at ?? null,
  }));

  const savedInvoice: SavedInvoice = {
    invoice_number: row.invoice_number,
    reference_po: row.reference_po ?? null,
    issue_date: row.issue_date ?? '',
    due_date: row.due_date ?? '',
    status: row.status,
    customer_name: row.customer_name,
    customer_email: row.customer_email ?? null,
    sourceQuoteId: (row as { source_quote_id?: string | null }).source_quote_id ?? null,
    sourceQuoteNumber: (row as { source_quote_number?: string | null }).source_quote_number ?? null,
    convertedFromQuote: (row as { converted_from_quote?: boolean | null }).converted_from_quote ?? false,
    convertedAt: (row as { converted_at?: string | null }).converted_at ?? null,
    currency: normalizedCurrency.currency,
    base_currency_code: normalizedCurrency.base_currency_code,
    exchange_rate_to_base: normalizedCurrency.exchange_rate_to_base,
    subtotal_in_base: normalizedCurrency.subtotal_in_base,
    tax_amount_in_base: normalizedCurrency.tax_amount_in_base,
    total_in_base: normalizedCurrency.total_in_base,
    subtotal: Number(row.subtotal),
    tax_amount: Number(row.tax_amount),
    total: Number(row.total),
    amount_paid: row.amount_paid != null ? Number(row.amount_paid) : 0,
    balance_due: resolveInvoiceBalanceDue({
      status: String(row.status ?? ''),
      total: Number(row.total),
      amount_paid: row.amount_paid != null ? Number(row.amount_paid) : 0,
    }),
    discount_amount: row.discount_amount != null ? Number(row.discount_amount) : 0,
    discount_percent:
      (row as { discount_percent?: number | null }).discount_percent != null
        ? Number((row as { discount_percent?: number | null }).discount_percent)
        : null,
    tax_percent:
      (row as { tax_percent?: number | null }).tax_percent != null
        ? Number((row as { tax_percent?: number | null }).tax_percent)
        : null,
    notes: row.notes ?? null,
    terms: row.terms ?? null,
    show_time_summary: (row as { show_time_summary?: boolean }).show_time_summary ?? false,
    metadata: (row.metadata as SavedInvoice['metadata']) ?? null,
    payment_schedule: paymentSchedule.length > 0 ? paymentSchedule : undefined,
  };

  const doc = buildInvoiceDocumentPayload({
    business: savedBusiness,
    invoice: savedInvoice,
    items: savedItems,
  });

  const base64 = await buildInvoicePdfBase64(doc, paymentUrl ?? null);
  return { base64, invoiceNumber: String(row.invoice_number ?? 'document') };
}
