import type { EditModeInitialData } from '@/components/invoices/ManualInvoiceForm';
import { normalizeInvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';
import { deriveInvoiceStatus } from '@/lib/invoices/status';

/**
 * Supabase/PostgREST may embed `businesses` as an object or a single-element array.
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

/**
 * Maps GET /api/invoices/[id] or embedded Supabase invoice row JSON to {@link EditModeInitialData},
 * matching `src/app/(dashboard)/dashboard/invoices/[id]/edit/page.tsx`.
 */
export function mapApiInvoiceJsonToEditModeInitialData(raw: Record<string, unknown>): EditModeInitialData | null {
  const idStr = String(raw.id ?? '').trim();
  if (!idStr) return null;

  const embedded = normalizeEmbeddedBusinessesPayload(raw.businesses);
  if (!embedded?.id) return null;

  const business = embedded as {
    id: string;
    name: string;
    currency: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    tax_id?: string | null;
    payment_settings?: Record<string, unknown> | null;
    stripe_charges_enabled?: boolean;
  };

  const total = Number(raw.total ?? 0);
  const amountPaid = raw.amount_paid != null ? Number(raw.amount_paid) : 0;
  const balanceDueRaw = raw.balance_due;
  /** Align with `invoices/[id]/edit/page.tsx` when `balance_due` is null. */
  const balanceDueForForm =
    balanceDueRaw != null ? Number(balanceDueRaw) : Number(raw.total ?? 0);
  const balanceDueForStatus =
    balanceDueRaw != null ? Number(balanceDueRaw) : Math.max(0, total - amountPaid);

  const status = deriveInvoiceStatus({
    status: raw.status as string | null | undefined,
    total,
    amount_paid: amountPaid,
    balance_due: balanceDueForStatus,
  });

  const metadata = (raw.metadata as EditModeInitialData['invoice']['metadata']) ?? null;

  const rawItems = raw.invoice_items;
  const itemsList: unknown[] = Array.isArray(rawItems)
    ? rawItems
    : rawItems != null && typeof rawItems === 'object' && !Array.isArray(rawItems)
      ? [rawItems]
      : [];

  const items = itemsList
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
        tax_percent: i.tax_percent != null ? Number(i.tax_percent) : 0,
        unit_label: (i.unit_label as string | null | undefined) ?? 'item',
        assignee: (i.assignee as string | null | undefined) ?? null,
      };
    });

  const scheduleRaw = raw.invoice_payment_schedule_items;
  const scheduleList: unknown[] = Array.isArray(scheduleRaw)
    ? scheduleRaw
    : scheduleRaw != null && typeof scheduleRaw === 'object' && !Array.isArray(scheduleRaw)
      ? [scheduleRaw]
      : [];

  const sortedSchedule = scheduleList.slice().sort((a, b) => {
    const da = String((a as { due_date?: string }).due_date ?? '');
    const db = String((b as { due_date?: string }).due_date ?? '');
    return da.localeCompare(db);
  });

  const invoiceTotal = total;
  const payment_schedule = sortedSchedule.map((row) => {
    const r = row as Record<string, unknown>;
    const amount = Number(r.amount ?? 0);
    const st = String(r.status ?? '').toLowerCase();
    return {
      id: r.id != null ? String(r.id) : undefined,
      description: String(r.description ?? ''),
      percentage: invoiceTotal > 0 ? Math.round((amount / invoiceTotal) * 10000) / 100 : 0,
      amount,
      due_date: String(r.due_date ?? ''),
      status: (st === 'paid' ? 'paid' : 'pending') as 'pending' | 'paid',
      paid_at: (r.paid_at as string | null | undefined) ?? null,
    };
  });

  return {
    invoice: {
      invoice_number: (raw.invoice_number as string | null | undefined) ?? null,
      status,
      customer_id: (raw.customer_id as string | null | undefined) ?? null,
      customer_name: String(raw.customer_name ?? ''),
      customer_email: (raw.customer_email as string | null | undefined) ?? null,
      issue_date: String(raw.issue_date ?? ''),
      due_date: String(raw.due_date ?? ''),
      use_payment_schedule: !!(raw as { use_payment_schedule?: boolean }).use_payment_schedule,
      amount_paid: amountPaid,
      balance_due: balanceDueForForm,
      reference_po: (raw.reference_po as string | null | undefined) ?? null,
      notes: (raw.notes as string | null | undefined) ?? null,
      terms: (raw.terms as string | null | undefined) ?? null,
      discount_amount: raw.discount_amount != null ? Number(raw.discount_amount) : 0,
      discount_percent:
        (raw as { discount_percent?: number | null }).discount_percent != null
          ? Number((raw as { discount_percent?: number | null }).discount_percent)
          : null,
      tax_amount: Number(raw.tax_amount ?? 0),
      tax_percent:
        (raw as { tax_percent?: number | null }).tax_percent != null
          ? Number((raw as { tax_percent?: number | null }).tax_percent)
          : null,
      subtotal: Number(raw.subtotal ?? 0),
      total,
      currency: (raw.currency as string | undefined) ?? business.currency,
      base_currency_code:
        (raw.base_currency_code as string | undefined) ?? business.currency,
      exchange_rate_to_base:
        (raw as { exchange_rate_to_base?: number }).exchange_rate_to_base != null
          ? Number((raw as { exchange_rate_to_base?: number }).exchange_rate_to_base)
          : 1,
      subtotal_in_base:
        (raw as { subtotal_in_base?: number }).subtotal_in_base != null
          ? Number((raw as { subtotal_in_base?: number }).subtotal_in_base)
          : null,
      tax_amount_in_base:
        (raw as { tax_amount_in_base?: number }).tax_amount_in_base != null
          ? Number((raw as { tax_amount_in_base?: number }).tax_amount_in_base)
          : null,
      total_in_base:
        (raw as { total_in_base?: number }).total_in_base != null
          ? Number((raw as { total_in_base?: number }).total_in_base)
          : null,
      metadata,
      show_time_summary: !!(raw as { show_time_summary?: boolean }).show_time_summary,
      template_id: normalizeInvoiceTemplateId((raw as { template_id?: string | null }).template_id),
      source_quote_id: (raw as { source_quote_id?: string | null }).source_quote_id ?? null,
      source_quote_number: (raw as { source_quote_number?: string | null }).source_quote_number ?? null,
    },
    items,
    payment_schedule,
    business: {
      id: String(business.id),
      name: business.name,
      currency: business.currency,
      logo_url: (business as { logo_url?: string | null }).logo_url ?? null,
      address_line1: business.address_line1 ?? null,
      address_line2: business.address_line2 ?? null,
      city: business.city ?? null,
      state: business.state ?? null,
      postal_code: business.postal_code ?? null,
      country: business.country ?? null,
      tax_id: business.tax_id ?? null,
      payment_settings: (business.payment_settings as EditModeInitialData['business']['payment_settings']) ?? null,
      stripe_charges_enabled: business.stripe_charges_enabled ?? false,
    },
  };
}
