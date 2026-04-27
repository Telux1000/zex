import type { Customer } from '@/lib/database.types';
import type { InvoiceCreationCustomerRow } from '@/hooks/use-invoice-creation-workspace';

const HUB_KEY = '__manualInvoiceHubCustomers_v1';

type CachePayload = {
  v: 1;
  businessId: string;
  /**
   * Snapshot from the create hub; merged with a fresh `select('*')` in the form.
   */
  rows: InvoiceCreationCustomerRow[];
  ts: number;
};

export function setHubCustomersCacheForManualEntry(businessId: string, rows: InvoiceCreationCustomerRow[]): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }
  if (!businessId) {
    return;
  }
  try {
    const payload: CachePayload = { v: 1, businessId, rows, ts: Date.now() };
    window.sessionStorage.setItem(HUB_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/**
 * Pops a hub snapshot for the given business, if the cache key matches. Safe when stale:
 * the form still runs a full `select('*')` in the background.
 */
export function takeHubCustomersForManualForm(businessId: string): Customer[] | null {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(HUB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (parsed.v !== 1 || parsed.businessId !== businessId || !Array.isArray(parsed.rows)) {
      return null;
    }
    window.sessionStorage.removeItem(HUB_KEY);
    return parsed.rows.map((r) => mapHubRowToCustomer(businessId, r));
  } catch {
    return null;
  }
}

function mapHubRowToCustomer(businessId: string, r: InvoiceCreationCustomerRow): Customer {
  return {
    id: r.id,
    business_id: businessId,
    account_number: null,
    name: r.name ?? '',
    email: r.email,
    company: r.company,
    preferred_currency_code: r.preferred_currency_code ?? null,
    address_line1: r.address_line1,
    address_line2: null,
    city: r.city,
    state: r.state,
    postal_code: r.postal_code,
    country: r.country,
    country_code: null,
    phone: r.phone,
    notes: null,
    stripe_customer_id: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  };
}
