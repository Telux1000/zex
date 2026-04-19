import type { SupabaseClient } from '@supabase/supabase-js';
import {
  invoiceRowMatchesReference,
  type ParsedInvoiceReference,
} from '@/lib/invoices/invoice-reference';

export type InvoiceLookupRow = {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  total: number | null;
  currency: string | null;
  status: string | null;
};

const SELECT = 'id, invoice_number, customer_name, total, currency, status';

/**
 * Load a single invoice row for assistant lookup cards (by id, scoped to business).
 */
export async function fetchInvoiceLookupRowById(
  supabase: SupabaseClient,
  businessId: string,
  invoiceId: string
): Promise<InvoiceLookupRow | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select(SELECT)
    .eq('business_id', businessId)
    .eq('id', invoiceId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    invoice_number: r.invoice_number != null ? String(r.invoice_number) : null,
    customer_name: r.customer_name != null ? String(r.customer_name) : null,
    total: typeof r.total === 'number' ? r.total : r.total != null ? Number(r.total) : null,
    currency: r.currency != null ? String(r.currency) : null,
    status: r.status != null ? String(r.status) : null,
  };
}

/**
 * Load recent invoices for the business and match deterministically (no LLM).
 * Caps list size for chat lookup; logs if truncation could hide a match.
 */
export async function findInvoicesByReference(
  supabase: SupabaseClient,
  businessId: string,
  ref: ParsedInvoiceReference,
  opts?: { limit?: number }
): Promise<InvoiceLookupRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 1000);
  const { data, error } = await supabase
    .from('invoices')
    .select(SELECT)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[invoice-lookup] query failed', error.message);
    return [];
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const matches: InvoiceLookupRow[] = [];
  for (const r of rows) {
    const num = r.invoice_number != null ? String(r.invoice_number) : '';
    if (num && invoiceRowMatchesReference(num, ref)) {
      matches.push({
        id: String(r.id),
        invoice_number: num || null,
        customer_name: r.customer_name != null ? String(r.customer_name) : null,
        total: typeof r.total === 'number' ? r.total : r.total != null ? Number(r.total) : null,
        currency: r.currency != null ? String(r.currency).trim().toUpperCase() : null,
        status: r.status != null ? String(r.status) : null,
      });
    }
  }

  return matches;
}
