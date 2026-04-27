import type { SupabaseClient } from '@supabase/supabase-js';
import { getDueDateRange, getIssueDateRange } from '@/lib/invoices/list-filters';

/** Columns for list fetch — no `customers` embed, no `select *`. */
export const INVOICE_LIST_LEAN_COLS =
  'id, invoice_number, customer_name, customer_id, customer_email, reference_po, subtotal, tax_amount, total, total_in_base, currency, base_currency_code, exchange_rate_to_base, amount_paid, balance_due, total_refunded, use_payment_schedule, status, issue_date, due_date, paid_at, created_at, updated_at, recurring_rule_id, use_customer_reminder_defaults, reminder_settings, scheduled_send_at';

export const INVOICE_LIST_LEAN_COLS_LEGACY =
  'id, invoice_number, customer_name, customer_id, customer_email, reference_po, total, currency, amount_paid, balance_due, use_payment_schedule, status, due_date, created_at, scheduled_send_at';

/** Same as lean list, plus `discount_amount` for CSV (subtotal/tax are already in lean). */
export const INVOICE_LIST_LEAN_CSV_EXPORT_COLS = `${INVOICE_LIST_LEAN_COLS}, discount_amount`;
export const INVOICE_LIST_LEAN_CSV_EXPORT_COLS_LEGACY = `${INVOICE_LIST_LEAN_COLS_LEGACY}, discount_amount`;

export type InvoiceListUrlParams = {
  q: string;
  status: string;
  due: string;
  due_from: string;
  due_to: string;
  issue: string;
  issue_from: string;
  issue_to: string;
  customer: string;
  schedule_filter: string;
  filter: string;
  balance: string;
  sort: string;
  order: 'asc' | 'desc';
};

/**
 * When true, filters + sort can be expressed in PostgREST and we paginate with range()
 * before enrichment (refunds, payments, reminders).
 */
export function invoiceListUsesDatabasePagination(p: InvoiceListUrlParams): boolean {
  if (p.filter || p.balance || p.schedule_filter) return false;
  const st = p.status;
  /** `pending` uses derived status (not raw `sent` / `pending` columns alone). */
  if (st === 'overdue' || st === 'partially_paid' || st === 'paid' || st === 'pending') return false;
  const normalizedSort = p.sort === 'default' ? 'created_at' : p.sort;
  if (normalizedSort === 'status' || normalizedSort === 'next_due') return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySearchOr(query: any, q: string) {
  if (!q.trim()) return query;
  const qLower = `%${q.toLowerCase()}%`;
  const num = parseFloat(q.replace(/[^0-9.-]/g, ''));
  const conditions = [
    `invoice_number.ilike.${qLower}`,
    `customer_name.ilike.${qLower}`,
    `metadata->>company.ilike.${qLower}`,
    `customer_email.ilike.${qLower}`,
    `reference_po.ilike.${qLower}`,
  ];
  if (!Number.isNaN(num)) conditions.push(`total.eq.${num}`);
  return query.or(conditions.join(','));
}

type SelectOpts = { count: 'exact' | 'planned' | 'estimated' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyCommonInvoiceListFilters(query: any, businessId: string, p: InvoiceListUrlParams, applyStatusInSql: boolean) {
  const dueRange = getDueDateRange(
    p.due || undefined,
    p.due_from || undefined,
    p.due_to || undefined
  );
  const issueRange = getIssueDateRange(
    p.issue || undefined,
    p.issue_from || undefined,
    p.issue_to || undefined
  );

  query = query.eq('business_id', businessId);
  if (issueRange) {
    query = query.gte('issue_date', issueRange.from).lte('issue_date', issueRange.to);
  }
  if (dueRange) {
    query = query.gte('due_date', dueRange.from).lte('due_date', dueRange.to);
  }
  if (p.customer) query = query.eq('customer_id', p.customer);
  query = applySearchOr(query, p.q);

  if (applyStatusInSql) {
    const st = p.status;
    if (st === 'cancelled') {
      query = query.in('status', ['cancelled', 'voided']);
    } else if (st) {
      query = query.eq('status', st);
    }
  }
  return query;
}

/** `exact_count=1` on the list API — use {@link parseInvoiceListExactCountParam}. */
export function parseInvoiceListExactCountParam(raw: string | null): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Estimated row count for current filters (no row payload). */
export function invoiceListEstimatedCountQuery(
  supabase: SupabaseClient,
  businessId: string,
  p: InvoiceListUrlParams,
  applyStatusInSql: boolean
) {
  let query = supabase.from('invoices').select('id', { count: 'estimated', head: true });
  query = applyCommonInvoiceListFilters(query, businessId, p, applyStatusInSql);
  return query;
}

/**
 * Exact `COUNT(*)` for current SQL filters (no row payload).
 * Run in parallel with the paged `range()` query so total time is `max`, not `sum`, of the two.
 */
export function invoiceListExactCountQuery(
  supabase: SupabaseClient,
  businessId: string,
  p: InvoiceListUrlParams,
  applyStatusInSql: boolean
) {
  let query = supabase.from('invoices').select('id', { count: 'exact', head: true });
  query = applyCommonInvoiceListFilters(query, businessId, p, applyStatusInSql);
  return query;
}

/** Base URL filters shared by legacy (in-memory status) and DB-paginated paths. */
export function applyInvoiceListBaseFilters(
  supabase: SupabaseClient,
  businessId: string,
  selectCols: string,
  p: InvoiceListUrlParams,
  opts?: { count?: SelectOpts['count']; applyStatusInSql?: boolean }
) {
  let query =
    opts?.count != null
      ? supabase.from('invoices').select(selectCols, { count: opts.count })
      : supabase.from('invoices').select(selectCols);
  return applyCommonInvoiceListFilters(query, businessId, p, opts?.applyStatusInSql ?? false);
}

/** PostgREST order for list sort (DB-paginated path only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyInvoiceListSort(query: any, sortRaw: string, order: 'asc' | 'desc'): any {
  const normalizedSort = sortRaw === 'default' ? 'created_at' : sortRaw;
  const asc = order === 'asc';
  switch (normalizedSort) {
    case 'issue_date':
      return query.order('issue_date', { ascending: asc, nullsFirst: false });
    case 'due_date':
      return query.order('due_date', { ascending: asc, nullsFirst: false });
    case 'total':
      return query.order('total', { ascending: asc });
    case 'amount':
      return query.order('balance_due', { ascending: asc, nullsFirst: false });
    case 'number':
      return query.order('invoice_number', { ascending: asc });
    case 'customer':
      return query.order('customer_name', { ascending: asc, nullsFirst: false });
    case 'created_at':
    default:
      return query.order('created_at', { ascending: asc, nullsFirst: false });
  }
}

const DEFAULT_INVOICE_LIST_PAGE_SIZE = 25;
const MAX_INVOICE_LIST_PAGE_SIZE = 100;

/** Query params for GET /api/invoices and GET /api/invoices/export-csv (list filters and pagination). */
export function parseInvoiceListRequestParams(
  searchParams: URLSearchParams
): {
  listParams: InvoiceListUrlParams;
  page: number;
  pageSize: number;
  wantExactCount: boolean;
} {
  return {
    listParams: {
      q: (searchParams.get('q') ?? '').trim(),
      status: (searchParams.get('status') ?? '').trim().toLowerCase(),
      due: searchParams.get('due') ?? '',
      due_from: searchParams.get('due_from') ?? '',
      due_to: searchParams.get('due_to') ?? '',
      issue: searchParams.get('issue') ?? '',
      issue_from: searchParams.get('issue_from') ?? '',
      issue_to: searchParams.get('issue_to') ?? '',
      customer: searchParams.get('customer') ?? '',
      schedule_filter: searchParams.get('schedule_filter') ?? '',
      filter: searchParams.get('filter') ?? '',
      balance: searchParams.get('balance') ?? '',
      sort: searchParams.get('sort') ?? 'created_at',
      order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    },
    page: Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)),
    pageSize: Math.min(
      MAX_INVOICE_LIST_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get('page_size') ?? String(DEFAULT_INVOICE_LIST_PAGE_SIZE), 10))
    ),
    wantExactCount: parseInvoiceListExactCountParam(searchParams.get('exact_count')),
  };
}
