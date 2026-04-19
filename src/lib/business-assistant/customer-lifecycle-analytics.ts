import type { SupabaseClient } from '@supabase/supabase-js';

const ROW_CAP = 4000;

/** No invoice/payment touch in this rolling window (workspace-agnostic UTC math). */
export const CUSTOMER_INACTIVE_QUIET_DAYS = 30;

/**
 * Churn: previously had a real billing touch (issued invoice or payment), now quiet long enough.
 * Uses 60+ days since last activity; upper bound optional for copy (“~2–3 months”).
 */
export const CUSTOMER_CHURN_MIN_QUIET_DAYS = 60;

export type CustomerLifecycleRow = {
  customerId: string;
  /** Profile fields (`customers` table): `name` is the contact / account name field. */
  name: string;
  company: string | null;
  email: string | null;
  /** Precomputed: `company` → `name` → `email` → safe fallback (never "Unnamed customer"). */
  displayLabel: string;
  /** Latest meaningful activity (issued invoice date or payment instant). */
  lastActivityMs: number | null;
  /** Had at least one non-draft invoice or any payment historically. */
  hadRelationship: boolean;
  /** Sum of issued (non-draft/void/cancelled) invoice totals in workspace base currency. */
  historicalInvoicedBase: number;
};

/** Data source: `customers.company`, then `customers.name`, then `customers.email`. */
export function buildCustomerLifecycleDisplayLabel(
  company: string | null | undefined,
  name: string | null | undefined,
  email: string | null | undefined
): string {
  const comp = String(company ?? '').trim();
  const nm = String(name ?? '').trim();
  const em = String(email ?? '').trim();
  if (comp) return comp;
  if (nm && nm.toLowerCase() !== 'unnamed customer') return nm;
  if (em) return em;
  return 'No name (customer record)';
}

function terminalInvoiceStatus(st: string): boolean {
  const s = st.toLowerCase();
  return s === 'draft' || s === 'voided' || s === 'cancelled';
}

function issueDateToMs(issueDate: string): number {
  const d = String(issueDate).trim();
  if (!d) return NaN;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00.000Z` : d);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Loads customers and last activity from invoices (non-draft issue_date) and payments (paid_at / created_at).
 */
export async function loadCustomerLifecycleRows(
  supabase: SupabaseClient,
  businessId: string
): Promise<CustomerLifecycleRow[]> {
  const { data: custRaw, error: custErr } = await supabase
    .from('customers')
    .select('id, name, company, email')
    .eq('business_id', businessId)
    .order('name', { ascending: true })
    .limit(ROW_CAP);

  if (custErr) {
    console.error('[customer-lifecycle] customers', custErr.message);
    return [];
  }

  const customers = (custRaw ?? []) as {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
  }[];
  const byId = new Map<
    string,
    { lastMs: number; hadRelationship: boolean; invoicedBase: number }
  >();
  for (const c of customers) {
    byId.set(String(c.id), { lastMs: NaN, hadRelationship: false, invoicedBase: 0 });
  }

  const baseCurrencyFallback = 'USD';

  const { data: invRaw, error: invErr } = await supabase
    .from('invoices')
    .select(
      'customer_id, issue_date, status, paid_at, created_at, total_in_base, total, exchange_rate_to_base, currency'
    )
    .eq('business_id', businessId)
    .not('customer_id', 'is', null)
    .limit(ROW_CAP);

  if (invErr) {
    console.error('[customer-lifecycle] invoices', invErr.message);
  } else {
    for (const r of (invRaw ?? []) as Record<string, unknown>[]) {
      const cid = r.customer_id != null ? String(r.customer_id) : '';
      if (!cid || !byId.has(cid)) continue;
      const st = String(r.status ?? '');
      const slot = byId.get(cid)!;
      if (!terminalInvoiceStatus(st)) {
        slot.hadRelationship = true;
        const tib = Number(r.total_in_base);
        if (Number.isFinite(tib) && tib > 0) {
          slot.invoicedBase += tib;
        } else {
          const rate = Number(r.exchange_rate_to_base ?? 0);
          const total = Number(r.total ?? 0);
          const cur = String(r.currency ?? '').trim().toUpperCase() || baseCurrencyFallback;
          if (rate > 0 && Number.isFinite(total)) {
            slot.invoicedBase += total * rate;
          } else if (Number.isFinite(total)) {
            slot.invoicedBase += total;
          }
        }
        const idMs = issueDateToMs(String(r.issue_date ?? ''));
        if (Number.isFinite(idMs)) {
          if (!Number.isFinite(slot.lastMs) || idMs > slot.lastMs) slot.lastMs = idMs;
        }
      }
      const paidAt = r.paid_at != null ? String(r.paid_at) : '';
      if (paidAt) {
        const pMs = Date.parse(paidAt);
        if (Number.isFinite(pMs)) {
          slot.hadRelationship = true;
          if (!Number.isFinite(slot.lastMs) || pMs > slot.lastMs) slot.lastMs = pMs;
        }
      }
    }
  }

  const { data: payRaw, error: payErr } = await supabase
    .from('payments')
    .select('invoice_id, paid_at, created_at')
    .eq('business_id', businessId)
    .limit(ROW_CAP);

  if (payErr) {
    console.error('[customer-lifecycle] payments', payErr.message);
  } else {
    const invoiceIds = [
      ...new Set(
        ((payRaw ?? []) as { invoice_id?: string }[])
          .map((p) => p.invoice_id)
          .filter(Boolean)
          .map(String)
      ),
    ];
    const invCustomer = new Map<string, string>();
    const chunk = 200;
    for (let i = 0; i < invoiceIds.length; i += chunk) {
      const slice = invoiceIds.slice(i, i + chunk);
      const { data: invForPay, error: invPayErr } = await supabase
        .from('invoices')
        .select('id, customer_id')
        .eq('business_id', businessId)
        .in('id', slice);

      if (invPayErr) {
        console.error('[customer-lifecycle] invoices for payments', invPayErr.message);
        break;
      }
      for (const r of (invForPay ?? []) as { id?: string; customer_id?: string }[]) {
        if (r.id && r.customer_id) invCustomer.set(String(r.id), String(r.customer_id));
      }
    }
    for (const p of (payRaw ?? []) as Record<string, unknown>[]) {
      const iid = p.invoice_id != null ? String(p.invoice_id) : '';
      const cid = invCustomer.get(iid);
      if (!cid || !byId.has(cid)) continue;
      const slot = byId.get(cid)!;
      const ts = p.paid_at != null ? String(p.paid_at) : p.created_at != null ? String(p.created_at) : '';
      if (!ts) continue;
      const ms = Date.parse(ts);
      if (!Number.isFinite(ms)) continue;
      slot.hadRelationship = true;
      if (!Number.isFinite(slot.lastMs) || ms > slot.lastMs) slot.lastMs = ms;
    }
  }

  const out: CustomerLifecycleRow[] = [];
  for (const c of customers) {
    const id = String(c.id);
    const slot = byId.get(id)!;
    const lastActivityMs = Number.isFinite(slot.lastMs) ? slot.lastMs : null;
    out.push({
      customerId: id,
      name: String(c.name ?? '').trim(),
      company: c.company != null ? String(c.company).trim() || null : null,
      email: c.email != null ? String(c.email).trim() || null : null,
      displayLabel: buildCustomerLifecycleDisplayLabel(c.company, c.name, c.email),
      lastActivityMs,
      hadRelationship: slot.hadRelationship,
      historicalInvoicedBase: Math.max(0, slot.invoicedBase),
    });
  }
  return out;
}

function msDaysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export function filterInactiveCustomers(rows: CustomerLifecycleRow[]): CustomerLifecycleRow[] {
  const cutoff = msDaysAgo(CUSTOMER_INACTIVE_QUIET_DAYS);
  return rows.filter((r) => r.lastActivityMs == null || r.lastActivityMs < cutoff);
}

/**
 * Churned: had a prior relationship and no activity in the last CHURN_MIN_QUIET_DAYS days.
 * (Subset of long-idle accounts; excludes brand-new prospects with zero history.)
 */
export function filterChurnedCustomers(rows: CustomerLifecycleRow[]): CustomerLifecycleRow[] {
  const cutoff = msDaysAgo(CUSTOMER_CHURN_MIN_QUIET_DAYS);
  return rows.filter((r) => r.hadRelationship && r.lastActivityMs != null && r.lastActivityMs < cutoff);
}

/** Previously active: highest historical value first, then longest idle (oldest last activity). */
export function sortPreviouslyActiveByValueThenRecency(rows: CustomerLifecycleRow[]): CustomerLifecycleRow[] {
  return [...rows].sort((a, b) => {
    const dv = b.historicalInvoicedBase - a.historicalInvoicedBase;
    if (Math.abs(dv) > 0.0001) return dv > 0 ? 1 : -1;
    const am = a.lastActivityMs ?? 0;
    const bm = b.lastActivityMs ?? 0;
    if (am !== bm) return am - bm;
    return a.displayLabel.localeCompare(b.displayLabel, undefined, { sensitivity: 'base' });
  });
}

export function sortNeverActiveByLabel(rows: CustomerLifecycleRow[]): CustomerLifecycleRow[] {
  return [...rows].sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel, undefined, { sensitivity: 'base' })
  );
}

export function segmentInactiveCustomers(rows: CustomerLifecycleRow[]): {
  previouslyActive: CustomerLifecycleRow[];
  neverActive: CustomerLifecycleRow[];
} {
  const previouslyActive = sortPreviouslyActiveByValueThenRecency(
    rows.filter((r) => r.hadRelationship)
  );
  const neverActive = sortNeverActiveByLabel(rows.filter((r) => !r.hadRelationship));
  return { previouslyActive, neverActive };
}

/** @deprecated Prefer segment-specific sorts above. */
export function sortOldestActivityFirst(rows: CustomerLifecycleRow[]): CustomerLifecycleRow[] {
  return sortPreviouslyActiveByValueThenRecency(rows);
}
