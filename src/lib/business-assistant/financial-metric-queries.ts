import type { SupabaseClient } from '@supabase/supabase-js';
import { formatInTimeZone } from 'date-fns-tz';
import {
  resolvePaymentsReceivedTimeRange,
  type PaymentsNaturalRangeSpec,
  type ResolvedPaymentsTimeRange,
} from '@/lib/analytics/payments-received-time-range';
import { formatDateRangeForDisplay } from '@/lib/dashboard/date-range';
import type { AssistantPaidUtcWindow } from '@/lib/invoices/assistant-invoice-paid-bounds';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import {
  loadDashboardOverdueSnapshot,
} from '@/lib/invoices/dashboard-invoice-overdue';
import { formatCurrencyAmount } from '@/lib/utils/currency';

export type CurrencyAmountRow = { currency: string; amount: number };

const INVOICE_SCAN_LIMIT = 3000;

function rowResolvedBalance(r: Record<string, unknown>): number {
  return resolveInvoiceBalanceDue({
    status: String(r.status ?? ''),
    total: Number(r.total ?? 0),
    amount_paid: Number(r.amount_paid ?? 0),
    total_refunded: Number(r.total_refunded ?? 0),
  });
}

/** Uses app-wide currency metadata (fraction digits per ISO code) — avoids locale-default rounding (e.g. whole USD). */
function fmtMoney(n: number, currency: string): string {
  return formatCurrencyAmount(Number(n) || 0, currency);
}

export { fmtMoney as formatFinancialMoney };

export async function aggregateUnpaidBalancesByCurrency(
  supabase: SupabaseClient,
  businessId: string
): Promise<CurrencyAmountRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('total, amount_paid, balance_due, total_refunded, currency, status')
    .eq('business_id', businessId)
    .limit(INVOICE_SCAN_LIMIT);

  if (error) {
    console.error('[financial-metric-queries] unpaid scan', error.message);
    return [];
  }

  const map = new Map<string, number>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const bal = rowResolvedBalance(r);
    const st = deriveInvoiceStatus({
      status: String(r.status ?? ''),
      total: Number(r.total ?? 0),
      amount_paid: Number(r.amount_paid ?? 0),
      balance_due: bal,
      total_refunded: Number(r.total_refunded ?? 0),
    }).toLowerCase();
    if (['paid', 'voided', 'cancelled', 'draft', 'refunded'].includes(st)) continue;
    if (bal <= 0.02) continue;
    const cur = String(r.currency ?? 'USD').trim().toUpperCase() || 'USD';
    map.set(cur, (map.get(cur) ?? 0) + bal);
  }

  return Array.from(map.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export type OverdueAggregate = {
  byCurrency: CurrencyAmountRow[];
  invoiceCount: number;
};

export async function aggregateOverdueInvoices(
  supabase: SupabaseClient,
  businessId: string,
  opts?: { workspaceTimezone?: string | null; baseCurrencyCode?: string }
): Promise<OverdueAggregate> {
  const snapshot = await loadDashboardOverdueSnapshot(supabase, businessId, {
    workspaceTimezone: opts?.workspaceTimezone,
    baseCurrencyCode: opts?.baseCurrencyCode,
    maxScan: INVOICE_SCAN_LIMIT,
  });
  return {
    byCurrency: snapshot.byCurrency,
    invoiceCount: snapshot.invoiceCount,
  };
}

/** Invoices whose derived status is `partially_paid` (amount paid and balance both positive). */
export async function countPartiallyPaidInvoices(
  supabase: SupabaseClient,
  businessId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('invoices')
    .select('total, amount_paid, balance_due, total_refunded, currency, status')
    .eq('business_id', businessId)
    .limit(INVOICE_SCAN_LIMIT);

  if (error) {
    console.error('[financial-metric-queries] partially paid count', error.message);
    return 0;
  }

  let n = 0;
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const bal = rowResolvedBalance(r);
    const st = deriveInvoiceStatus({
      status: String(r.status ?? ''),
      total: Number(r.total ?? 0),
      amount_paid: Number(r.amount_paid ?? 0),
      balance_due: bal,
      total_refunded: Number(r.total_refunded ?? 0),
    }).toLowerCase();
    if (st === 'partially_paid' || st === 'partially_refunded') n += 1;
  }
  return n;
}

/** Workspace partially paid invoices: amounts from invoice rows (amount_paid, balance_due / total). */
export type PartiallyPaidInvoiceDetailRow = {
  invoice_number: string;
  customer_name: string;
  currency: string;
  invoice_total: number;
  amount_paid: number;
  balance_remaining: number;
  status: 'partially_paid';
};

/**
 * Lists invoices whose derived status is `partially_paid`, with total / paid / balance from DB fields.
 */
export async function fetchPartiallyPaidInvoicesDetail(
  supabase: SupabaseClient,
  businessId: string,
  limit = 50
): Promise<PartiallyPaidInvoiceDetailRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number, customer_name, total, currency, status, amount_paid, balance_due')
    .eq('business_id', businessId)
    .limit(INVOICE_SCAN_LIMIT);

  if (error) {
    console.error('[financial-metric-queries] partially paid detail', error.message);
    return [];
  }

  const out: PartiallyPaidInvoiceDetailRow[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const total = Number(r.total ?? 0);
    const amountPaid = Math.max(0, Number(r.amount_paid ?? 0));
    const balanceFromCol =
      r.balance_due != null && r.balance_due !== '' ? Number(r.balance_due) : NaN;
    const balanceRemaining = Number.isFinite(balanceFromCol)
      ? Math.max(0, balanceFromCol)
      : Math.max(0, total - amountPaid);

    const st = deriveInvoiceStatus({
      status: String(r.status ?? ''),
      total,
      amount_paid: amountPaid,
      balance_due: Number.isFinite(balanceFromCol) ? balanceFromCol : null,
    }).toLowerCase();

    if (st !== 'partially_paid') continue;

    out.push({
      invoice_number: String(r.invoice_number ?? '').trim() || '—',
      customer_name: String(r.customer_name ?? '').trim() || '—',
      currency: String(r.currency ?? 'USD').trim().toUpperCase() || 'USD',
      invoice_total: total,
      amount_paid: amountPaid,
      balance_remaining: balanceRemaining,
      status: 'partially_paid',
    });
  }

  out.sort((a, b) => a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true }));
  return out.slice(0, Math.max(1, Math.min(50, limit)));
}

/**
 * Count invoices whose **issue_date** falls in [fromYmd, toYmd] inclusive (business-calendar dates).
 */
export async function countInvoicesIssuedInIssueDateRange(
  supabase: SupabaseClient,
  businessId: string,
  fromYmd: string,
  toYmd: string
): Promise<number> {
  const { count, error } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('issue_date', fromYmd)
    .lte('issue_date', toYmd);

  if (error) {
    console.error('[financial-metric-queries] issued count', error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Sum invoice totals in reporting base currency for rows whose **issue_date** falls in [fromYmd, toYmd].
 * Excludes draft / voided / cancelled — aligns with “revenue = value of invoices issued” (accrual-style).
 */
export async function sumInvoicedRevenueInIssueDateRange(
  supabase: SupabaseClient,
  businessId: string,
  fromYmd: string,
  toYmd: string,
  baseCurrencyCode: string
): Promise<{ totalBase: number; invoiceCount: number }> {
  const base = (baseCurrencyCode || 'USD').trim().toUpperCase();
  const { data, error } = await supabase
    .from('invoices')
    .select('total, total_in_base, currency, exchange_rate_to_base, status')
    .eq('business_id', businessId)
    .gte('issue_date', fromYmd)
    .lte('issue_date', toYmd)
    .limit(INVOICE_SCAN_LIMIT);

  if (error) {
    console.error('[financial-metric-queries] invoiced sum', error.message);
    return { totalBase: 0, invoiceCount: 0 };
  }

  let totalBase = 0;
  let invoiceCount = 0;
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const st = String(r.status ?? '').toLowerCase();
    if (st === 'draft' || st === 'voided' || st === 'cancelled') continue;
    const tib = Number(r.total_in_base);
    if (Number.isFinite(tib) && tib > 0) {
      totalBase += tib;
      invoiceCount += 1;
      continue;
    }
    const rate = Number(r.exchange_rate_to_base ?? 0);
    const total = Number(r.total ?? 0);
    const cur = String(r.currency ?? '').trim().toUpperCase() || base;
    if (rate > 0 && Number.isFinite(total)) {
      totalBase += total * rate;
    } else if (cur === base && Number.isFinite(total)) {
      totalBase += total;
    } else if (Number.isFinite(total)) {
      totalBase += total;
    }
    invoiceCount += 1;
  }

  return { totalBase, invoiceCount };
}

/** Per-customer issued revenue (issue dates), reporting base — same inclusion rules as `sumInvoicedRevenueInIssueDateRange`. */
export type InvoicedCustomerShareRow = {
  key: string;
  displayLabel: string;
  totalBase: number;
};

export type RankedIssuedInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string | null;
  customerName: string;
  issueDate: string | null;
  amount: number;
  currency: string;
  amountBase: number;
};

function invoicedLineBaseForReporting(r: Record<string, unknown>, base: string): number | null {
  const st = String(r.status ?? '').toLowerCase();
  if (st === 'draft' || st === 'voided' || st === 'cancelled') return null;
  const tib = Number(r.total_in_base);
  if (Number.isFinite(tib) && tib > 0) return tib;
  const rate = Number(r.exchange_rate_to_base ?? 0);
  const total = Number(r.total ?? 0);
  const cur = String(r.currency ?? '').trim().toUpperCase() || base;
  if (rate > 0 && Number.isFinite(total)) return total * rate;
  if (cur === base && Number.isFinite(total)) return total;
  if (Number.isFinite(total)) return total;
  return 0;
}

/**
 * Aggregate issued invoice amounts by customer for issue_date in [fromYmd, toYmd], in reporting base.
 */
export async function aggregateInvoicedRevenueByCustomerInIssueDateRange(
  supabase: SupabaseClient,
  businessId: string,
  fromYmd: string,
  toYmd: string,
  baseCurrencyCode: string
): Promise<InvoicedCustomerShareRow[]> {
  const base = (baseCurrencyCode || 'USD').trim().toUpperCase();
  const { data, error } = await supabase
    .from('invoices')
    .select('total, total_in_base, currency, exchange_rate_to_base, status, customer_id, customer_name')
    .eq('business_id', businessId)
    .gte('issue_date', fromYmd)
    .lte('issue_date', toYmd)
    .limit(INVOICE_SCAN_LIMIT);

  if (error) {
    console.error('[financial-metric-queries] invoiced by customer', error.message);
    return [];
  }

  const map = new Map<string, { displayLabel: string; totalBase: number }>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const line = invoicedLineBaseForReporting(r, base);
    if (line == null) continue;
    const cid = r.customer_id != null && String(r.customer_id).trim() !== '' ? String(r.customer_id) : '';
    const name = String(r.customer_name ?? '').trim();
    const key = cid ? `id:${cid}` : `name:${(name || 'unknown').toLowerCase()}`;
    const displayLabel = name || 'Unknown customer';
    const prev = map.get(key);
    if (prev) {
      prev.totalBase += line;
    } else {
      map.set(key, { displayLabel, totalBase: line });
    }
  }

  return Array.from(map.entries())
    .map(([key, v]) => ({ key, displayLabel: v.displayLabel, totalBase: v.totalBase }))
    .sort((a, b) => b.totalBase - a.totalBase);
}

/** Largest single issued invoice (by line total in base) in the issue_date window. */
export async function maxInvoiceBaseInIssueDateRange(
  supabase: SupabaseClient,
  businessId: string,
  fromYmd: string,
  toYmd: string,
  baseCurrencyCode: string
): Promise<number> {
  const base = (baseCurrencyCode || 'USD').trim().toUpperCase();
  const { data, error } = await supabase
    .from('invoices')
    .select('total, total_in_base, currency, exchange_rate_to_base, status')
    .eq('business_id', businessId)
    .gte('issue_date', fromYmd)
    .lte('issue_date', toYmd)
    .limit(INVOICE_SCAN_LIMIT);

  if (error) {
    console.error('[financial-metric-queries] max invoiced line', error.message);
    return 0;
  }

  let maxBase = 0;
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const line = invoicedLineBaseForReporting(r, base);
    if (line == null) continue;
    if (line > maxBase) maxBase = line;
  }
  return maxBase;
}

/** Top issued invoices in [fromYmd, toYmd], ranked by reporting-base amount descending. */
export async function listTopIssuedInvoicesInIssueDateRange(
  supabase: SupabaseClient,
  businessId: string,
  fromYmd: string,
  toYmd: string,
  baseCurrencyCode: string,
  limit = 3
): Promise<RankedIssuedInvoiceRow[]> {
  const base = (baseCurrencyCode || 'USD').trim().toUpperCase();
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, customer_name, issue_date, total, total_in_base, currency, exchange_rate_to_base, status'
    )
    .eq('business_id', businessId)
    .gte('issue_date', fromYmd)
    .lte('issue_date', toYmd)
    .limit(INVOICE_SCAN_LIMIT);

  if (error) {
    console.error('[financial-metric-queries] top issued invoices', error.message);
    return [];
  }

  const rows: RankedIssuedInvoiceRow[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const amountBase = invoicedLineBaseForReporting(r, base);
    if (amountBase == null) continue;
    const amount = Number(r.total ?? 0);
    const currency = String(r.currency ?? '').trim().toUpperCase() || base;
    rows.push({
      invoiceId: String(r.id ?? ''),
      invoiceNumber: r.invoice_number != null ? String(r.invoice_number) : null,
      customerName: String(r.customer_name ?? '').trim() || 'Unknown customer',
      issueDate: r.issue_date != null ? String(r.issue_date) : null,
      amount: Number.isFinite(amount) ? amount : 0,
      currency,
      amountBase,
    });
  }

  return rows
    .sort((a, b) => b.amountBase - a.amountBase)
    .slice(0, Math.max(1, Math.min(10, limit)));
}

export function resolveFinancialPaymentsWindow(
  spec: PaymentsNaturalRangeSpec,
  workspaceTimezone: string | null | undefined,
  now = new Date()
): ResolvedPaymentsTimeRange | null {
  const r = resolvePaymentsReceivedTimeRange(spec, now, workspaceTimezone);
  return r.ok ? r.value : null;
}

/** Align paid-invoice list queries with `fetchPaidInvoicesInUtcWindow`. */
export function resolvedPaymentsWindowToPaidUtc(w: ResolvedPaymentsTimeRange): AssistantPaidUtcWindow {
  return {
    startIso: w.startIso,
    endIso: w.endIso,
    timezone: w.timezone,
    label: w.label,
  };
}

/** Rehydrate a `ResolvedPaymentsTimeRange` shape from paid-list UTC bounds (for labels / metric context). */
export function paidUtcToResolvedPaymentsShape(utc: AssistantPaidUtcWindow): ResolvedPaymentsTimeRange {
  return {
    metric: 'payments_received_base',
    startIso: utc.startIso,
    endIso: utc.endIso,
    timezone: utc.timezone,
    label: utc.label,
    humanRange: formatDateRangeForDisplay(utc.startIso, utc.endIso, utc.timezone),
    aggregation: 'sum',
  };
}

/** Rebuild paid-instant bounds from `metric_session_context.paymentsWindow` (e.g. after a revenue summary). */
export function metricSessionPaymentsWindowToPaidUtc(pw: {
  startIso: string;
  endIso: string;
  timezone: string;
  label: string;
}): AssistantPaidUtcWindow {
  return {
    startIso: pw.startIso,
    endIso: pw.endIso,
    timezone: pw.timezone,
    label: pw.label,
  };
}

/** Civil YYYY-MM-DD bounds in workspace TZ for issue_date filters. */
export function issueDateYmdBoundsFromPaymentsWindow(
  window: ResolvedPaymentsTimeRange
): { fromYmd: string; toYmd: string } {
  const tz = window.timezone;
  const fromYmd = formatInTimeZone(new Date(window.startIso), tz, 'yyyy-MM-dd');
  const toYmd = formatInTimeZone(new Date(window.endIso), tz, 'yyyy-MM-dd');
  return { fromYmd, toYmd };
}
