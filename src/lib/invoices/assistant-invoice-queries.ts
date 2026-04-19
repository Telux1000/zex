import type { SupabaseClient } from '@supabase/supabase-js';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { roundMoney2 } from '@/lib/currency/amounts-in-base';
import {
  DASHBOARD_OVERDUE_INVOICE_COLUMNS,
  fetchEarliestPendingDueYmdByInvoiceIds,
  loadDashboardOverdueSnapshot,
  logOverdueParityDebug,
  rawInvoiceRowMatchesDashboardOverdue,
  resolveCivilTodayYmdForOverdue,
} from '@/lib/invoices/dashboard-invoice-overdue';
import { nextDueYmdForPastDueUi } from '@/lib/invoices/invoice-past-due-ui';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import {
  resolveInvoiceBalanceDue,
} from '@/lib/invoices/compute-invoice-balance-due';
import type { InvoiceLookupRow } from '@/lib/invoices/resolve-invoices-by-reference';
import type { AssistantPaidUtcWindow } from '@/lib/invoices/assistant-invoice-paid-bounds';
import { loadLedgerPaymentsForCollectedAssistantWindow } from '@/lib/payments/collected-revenue-metric';
import type { InvoiceAssistantChatCard } from '@/lib/invoices/conversational-invoice-wizard/types';
import {
  normalizeInvoiceRecord,
  type NormalizedInvoiceRecord,
} from '@/lib/invoices/normalize';
import {
  normalizeCurrencyForRefund,
  resolveRefundDisplayStatus,
  succeededPaymentGrossInInvoiceCurrency,
} from '@/lib/invoices/refund-display';

const SELECT_SHORT =
  'id, invoice_number, customer_name, total, currency, status, amount_paid, balance_due, total_refunded, issue_date, due_date, created_at';

const SELECT_WITH_PAID_AT = `${SELECT_SHORT}, paid_at`;

/**
 * Invoice rows for assistant lists that show **open balance** with optional foreign → base.
 * Uses invoice **issue-time** stored FX (`total_in_base`, `exchange_rate_to_base`, `base_currency_code`)
 * — the same column set as past-due scanning. Do **not** use this for collected-revenue / payment-received
 * metrics; those must use payment ledger `amount_in_base` (see `getPaymentBaseAmount`).
 */
export const ASSISTANT_INVOICE_BALANCE_LIST_COLUMNS = DASHBOARD_OVERDUE_INVOICE_COLUMNS;

export type AssistantPaidInvoiceRow = InvoiceLookupRow & { paid_at: string | null };

const MAX_SCOPED_CUSTOMER_GROUP_KEYS = 25;

/** Stable customer bucket key for collected-revenue grouping (matches aggregate by customer). */
export function collectedRevenueCustomerGroupKeyFromInvoiceRow(inv: Record<string, unknown>): string {
  const cid = inv.customer_id != null ? String(inv.customer_id).trim() : '';
  if (cid) return `id:${cid}`;
  const name =
    inv.customer_name != null ? String(inv.customer_name).trim().toLowerCase() : '';
  return `name:${name || '__none__'}`;
}

export function customerGroupKeySetForScope(keys: string[] | null | undefined): Set<string> | null {
  if (!keys?.length) return null;
  const s = new Set<string>();
  for (const k of keys.slice(0, MAX_SCOPED_CUSTOMER_GROUP_KEYS)) {
    const t = String(k).trim();
    if (t.length > 0 && t.length < 240) s.add(t);
  }
  return s.size ? s : null;
}

export type FetchCollectedInvoicesBreakdownOptions = {
  customerGroupKeys?: string[] | null;
};

function rowToLookup(r: Record<string, unknown>): InvoiceLookupRow {
  return {
    id: String(r.id),
    invoice_number: r.invoice_number != null ? String(r.invoice_number) : null,
    customer_name: r.customer_name != null ? String(r.customer_name) : null,
    total: typeof r.total === 'number' ? r.total : r.total != null ? Number(r.total) : null,
    currency: r.currency != null ? String(r.currency).trim().toUpperCase() : null,
    status: r.status != null ? String(r.status) : null,
  };
}

/** Calendar days from `fromYmd` to `toYmd` (inclusive span, both YYYY-MM-DD). */
function ymdCalendarDaysBetween(fromYmd: string, toYmd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) return 0;
  const from = Date.UTC(
    Number(fromYmd.slice(0, 4)),
    Number(fromYmd.slice(5, 7)) - 1,
    Number(fromYmd.slice(8, 10))
  );
  const to = Date.UTC(
    Number(toYmd.slice(0, 4)),
    Number(toYmd.slice(5, 7)) - 1,
    Number(toYmd.slice(8, 10))
  );
  return Math.max(0, Math.round((to - from) / 86400000));
}

export type AssistantInvoiceListRow = InvoiceLookupRow & {
  due_date?: string | null;
  amount_paid?: number | null;
  balance_due?: number | null;
  total_refunded?: number | null;
  /** Effective due (invoice or next pending installment), YYYY-MM-DD — overdue list only. */
  display_due_ymd?: string | null;
  days_overdue?: number | null;
  /** Stored invoice FX (open-balance lists); client recomputes base open balance from effective balance_due. */
  total_in_base?: number | null;
  exchange_rate_to_base?: number | null;
  fx_for_base_reliable?: boolean;
};

export type InvoiceAssistantListItemPayload = Extract<
  InvoiceAssistantChatCard,
  { card_type: 'invoice_list' }
>['items'][number];

function assistantOverdueRowHasReliableBaseFx(
  r: Record<string, unknown>,
  norm: NormalizedInvoiceRecord
): boolean {
  const cur = norm.currency.trim().toUpperCase();
  const base = norm.base_currency_code.trim().toUpperCase();
  if (cur === base) return true;
  if (norm.exchange_rate_to_base > 0) return true;
  const raw = r.total_in_base;
  if (raw != null && raw !== '') {
    const t = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(t) && t > 0.0001) return true;
  }
  return false;
}

export function assistantInvoiceListRowToChatItem(m: AssistantInvoiceListRow): InvoiceAssistantListItemPayload {
  return {
    invoice_id: m.id,
    invoice_number: m.invoice_number,
    customer_name: m.customer_name,
    total: m.total,
    currency: m.currency,
    status: m.status,
    due_date: m.due_date ?? null,
    amount_paid: m.amount_paid ?? null,
    balance_due: m.balance_due ?? null,
    total_refunded: m.total_refunded ?? null,
    display_due_ymd: m.display_due_ymd ?? null,
    days_overdue: m.days_overdue ?? null,
    total_in_base: m.total_in_base ?? null,
    exchange_rate_to_base: m.exchange_rate_to_base ?? null,
    fx_for_base_reliable: m.fx_for_base_reliable,
  };
}

/**
 * Paid + receivable balance for assistant surfaces: balance from totals + `total_refunded`
 * (stored `balance_due` can lag refunds).
 */
export function assistantInvoiceDisplayAmountsFromRow(r: Record<string, unknown>): {
  amount_paid: number | null;
  balance_due: number;
} {
  const apRaw = r.amount_paid;
  const amountPaidN =
    typeof apRaw === 'number' ? apRaw : apRaw != null && apRaw !== '' ? Number(apRaw) : NaN;
  const storedPaid = Number.isFinite(amountPaidN) ? amountPaidN : null;
  const balanceDue = rowBalanceDuePreferStoredColumn(r);
  const amountPaid = resolveAmountPaidForAssistantDisplay(r, balanceDue, storedPaid);
  return { amount_paid: amountPaid, balance_due: balanceDue };
}

function assistantInvoiceListRowFromRecord(
  r: Record<string, unknown>,
  opts: {
    filter: AssistantInvoiceListFilter;
    civilTodayYmd: string;
    earliestPendingDue: Map<string, string> | null;
    baseCurrencyCode: string;
  }
): AssistantInvoiceListRow {
  const base = rowToLookup(r);
  const id = base.id;
  const totalRefunded = Number(r.total_refunded ?? 0);
  const { amount_paid: amountPaid, balance_due: balanceDue } = assistantInvoiceDisplayAmountsFromRow(r);
  const dueRaw = r.due_date != null && String(r.due_date).trim() !== '' ? String(r.due_date) : null;

  let displayDueYmd: string | null = null;
  let daysOverdue: number | null = null;

  if (opts.filter === 'overdue' && opts.earliestPendingDue) {
    const nextDue = nextDueYmdForPastDueUi(
      {
        id,
        due_date: String(r.due_date ?? ''),
        use_payment_schedule: Boolean(r.use_payment_schedule),
      },
      opts.earliestPendingDue
    );
    if (/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) {
      displayDueYmd = nextDue;
      if (nextDue < opts.civilTodayYmd) {
        daysOverdue = ymdCalendarDaysBetween(nextDue, opts.civilTodayYmd);
      } else {
        daysOverdue = 0;
      }
    }
  }

  let total_in_base: number | null = null;
  let exchange_rate_to_base: number | null = null;
  let fx_for_base_reliable: boolean | undefined;
  if (assistantInvoiceListFilterUsesBalanceFx(opts.filter)) {
    const norm = normalizeInvoiceRecord(r, opts.baseCurrencyCode);
    if (norm && assistantOverdueRowHasReliableBaseFx(r, norm)) {
      fx_for_base_reliable = true;
      total_in_base =
        norm.total_in_base > 0.0001 ? roundMoney2(norm.total_in_base) : null;
      exchange_rate_to_base =
        norm.exchange_rate_to_base > 0 ? norm.exchange_rate_to_base : null;
    } else {
      fx_for_base_reliable = false;
    }
  }

  return {
    ...base,
    due_date: dueRaw,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    total_refunded: totalRefunded,
    display_due_ymd: displayDueYmd,
    days_overdue: daysOverdue,
    total_in_base,
    exchange_rate_to_base,
    fx_for_base_reliable,
  };
}

function rowToPaidLookup(r: Record<string, unknown>): AssistantPaidInvoiceRow {
  const base = rowToLookup(r);
  const pa = r.paid_at;
  const paid_at =
    pa == null || pa === ''
      ? null
      : typeof pa === 'string'
        ? pa
        : new Date(String(pa)).toISOString();
  return { ...base, paid_at };
}

async function loadRefundDisplayStatusByInvoiceId(
  supabase: SupabaseClient,
  invoiceIds: string[]
): Promise<Map<string, string>> {
  const ids = invoiceIds.map((id) => String(id).trim()).filter(Boolean);
  const out = new Map<string, string>();
  if (!ids.length) return out;

  const { data: invCurRows } = await supabase.from('invoices').select('id, currency').in('id', ids);
  const invCurrencyById = new Map(
    (invCurRows ?? []).map((r) => [
      String((r as { id?: string }).id ?? ''),
      normalizeCurrencyForRefund((r as { currency?: string }).currency),
    ])
  );

  const { data: paymentRows } = await supabase
    .from('payments')
    .select('invoice_id, amount, amount_in_invoice_currency, currency')
    .in('invoice_id', ids)
    .eq('status', 'succeeded');
  const grossByInvoice = new Map<string, number>();
  for (const row of paymentRows ?? []) {
    const invoiceId = String((row as { invoice_id?: string }).invoice_id ?? '');
    if (!invoiceId) continue;
    const invCur = invCurrencyById.get(invoiceId) ?? 'USD';
    const chunk = succeededPaymentGrossInInvoiceCurrency(
      {
        amount: (row as { amount?: number | null }).amount,
        amount_in_invoice_currency: (row as { amount_in_invoice_currency?: number | null })
          .amount_in_invoice_currency,
        currency: (row as { currency?: string | null }).currency,
      },
      invCur
    );
    if (!(chunk > 0)) continue;
    grossByInvoice.set(invoiceId, (grossByInvoice.get(invoiceId) ?? 0) + chunk);
  }

  const { data: refundRows } = await supabase
    .from('payment_refunds')
    .select('invoice_id, amount, status')
    .in('invoice_id', ids);
  const refundedByInvoice = new Map<string, number>();
  for (const row of refundRows ?? []) {
    const status = String((row as { status?: string }).status ?? '').toLowerCase();
    if (status !== 'succeeded') continue;
    const invoiceId = String((row as { invoice_id?: string }).invoice_id ?? '');
    if (!invoiceId) continue;
    const amount = Number((row as { amount?: number }).amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    refundedByInvoice.set(invoiceId, (refundedByInvoice.get(invoiceId) ?? 0) + amount);
  }

  for (const invoiceId of ids) {
    const refundStatus = resolveRefundDisplayStatus({
      grossPaidAmount: grossByInvoice.get(invoiceId) ?? 0,
      refundedAmount: refundedByInvoice.get(invoiceId) ?? 0,
    });
    if (refundStatus) out.set(invoiceId, refundStatus);
  }
  return out;
}

function derivedStatus(r: Record<string, unknown>): string {
  return deriveInvoiceStatus({
    status: String(r.status ?? ''),
    total: Number(r.total ?? 0),
    amount_paid: Number(r.amount_paid ?? 0),
    total_refunded: Number(r.total_refunded ?? 0),
  });
}

export type AssistantInvoiceStatusFilter = 'unpaid' | 'overdue' | 'partially_paid' | 'paid';

/** List-only filter (due date vs workspace “today”, or drafts). */
export type AssistantInvoiceListFilter = AssistantInvoiceStatusFilter | 'due_today' | 'draft';

export function assistantInvoiceListFilterUsesBalanceFx(filter: AssistantInvoiceListFilter): boolean {
  return (
    filter === 'overdue' ||
    filter === 'unpaid' ||
    filter === 'due_today' ||
    filter === 'partially_paid'
  );
}

function rowBalanceDue(r: Record<string, unknown>): number {
  return resolveInvoiceBalanceDue({
    status: String(r.status ?? ''),
    total: Number(r.total ?? 0),
    amount_paid: Number(r.amount_paid ?? 0),
    total_refunded: Number(r.total_refunded ?? 0),
  });
}

/** Receivable balance from totals + refunds (stored `balance_due` can lag refunds). */
function rowBalanceDuePreferStoredColumn(r: Record<string, unknown>): number {
  return rowBalanceDue(r);
}

/**
 * Some rows keep `balance_due` authoritative while `amount_paid` is stale or zero (e.g. status partially_paid).
 * For assistant lists, prefer stored amount_paid when positive; else derive total − balance_due when consistent.
 */
function resolveAmountPaidForAssistantDisplay(
  r: Record<string, unknown>,
  balanceDue: number,
  storedRaw: number | null
): number | null {
  const st = String(r.status ?? '').toLowerCase();
  if (st === 'voided' || st === 'cancelled') {
    return storedRaw != null && Number.isFinite(storedRaw) ? roundMoney2(Math.max(0, storedRaw)) : null;
  }
  const totalN = Number(r.total ?? 0);
  if (storedRaw != null && storedRaw > 0.02) {
    return roundMoney2(storedRaw);
  }
  if (totalN > 0.02 && balanceDue >= -0.02 && balanceDue < totalN - 0.02) {
    return roundMoney2(Math.max(0, totalN - balanceDue));
  }
  if (storedRaw != null && Number.isFinite(storedRaw)) {
    return roundMoney2(Math.max(0, storedRaw));
  }
  return null;
}

/** Derived status + balance; used for assistant list/count filters. */
export function assistantInvoiceRowMatchesStatusFilter(
  r: Record<string, unknown>,
  filter: AssistantInvoiceStatusFilter
): boolean {
  const st = derivedStatus(r).toLowerCase();
  const bal = rowBalanceDue(r);

  if (filter === 'unpaid') {
    if (['paid', 'voided', 'cancelled', 'draft', 'refunded'].includes(st)) return false;
    if (bal <= 0.02) return false;
    return true;
  }
  /** Overdue uses `rawInvoiceRowMatchesDashboardOverdue` (balance + due date + installments). */
  if (filter === 'overdue') return false;
  if (filter === 'partially_paid')
    return st === 'partially_paid' || st === 'partially_refunded';
  if (filter === 'paid') return st === 'paid';
  return false;
}

/** YYYY-MM-DD prefix from invoice `due_date` (DB date or ISO). */
export function assistantInvoiceDueDateYmd(due: unknown): string | null {
  if (due == null || due === '') return null;
  const s = String(due).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : null;
}

function assistantInvoiceRowHasOpenBalance(r: Record<string, unknown>): boolean {
  const st = derivedStatus(r).toLowerCase();
  if (['paid', 'voided', 'cancelled', 'draft', 'refunded'].includes(st)) return false;
  return rowBalanceDue(r) > 0.02;
}

export function assistantInvoiceRowDueToday(
  r: Record<string, unknown>,
  todayYmd: string
): boolean {
  if (!assistantInvoiceRowHasOpenBalance(r)) return false;
  const d = assistantInvoiceDueDateYmd(r.due_date);
  return d != null && d === todayYmd;
}

const STATUS_AGGREGATE_MAX_SCAN = 2000;

export type AssistantInvoiceStatusAggregate = {
  count: number;
  truncated: boolean;
  /** Balance due (unpaid / overdue / partially paid) or invoice total when filter is paid */
  byCurrency: Array<{ currency: string; amount: number }>;
};

/**
 * Count and optionally sum amounts for invoices matching a derived status filter.
 * Scans up to `maxScan` most recent invoices by `created_at`.
 */
export async function aggregateAssistantInvoiceStatus(
  supabase: SupabaseClient,
  businessId: string,
  filter: AssistantInvoiceStatusFilter,
  maxScan = STATUS_AGGREGATE_MAX_SCAN,
  opts?: { workspaceTimezone?: string | null; baseCurrencyCode?: string }
): Promise<AssistantInvoiceStatusAggregate> {
  const cap = Math.min(Math.max(maxScan, 1), 5000);
  const base = (opts?.baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';
  const civilTodayYmd = resolveCivilTodayYmdForOverdue(new Date(), opts?.workspaceTimezone ?? null);
  const selectCols =
    filter === 'paid' ? SELECT_SHORT : ASSISTANT_INVOICE_BALANCE_LIST_COLUMNS;

  const { data, error } = await supabase
    .from('invoices')
    .select(selectCols as string)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (error) {
    console.error('[assistant-invoice-queries] status_aggregate', error.message);
    return { count: 0, truncated: false, byCurrency: [] };
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id ?? '')).filter(Boolean);
  let earliestPending: Map<string, string> | null = null;
  if (filter === 'overdue' && ids.length > 0) {
    earliestPending = await fetchEarliestPendingDueYmdByInvoiceIds(supabase, ids);
  }

  let count = 0;
  const curMap = new Map<string, number>();

  for (const r of rows) {
    if (filter === 'overdue') {
      if (!rawInvoiceRowMatchesDashboardOverdue(r, base, earliestPending ?? new Map(), civilTodayYmd)) {
        continue;
      }
    } else if (!assistantInvoiceRowMatchesStatusFilter(r, filter)) {
      continue;
    }
    count++;
    const c = String(r.currency ?? 'USD').trim().toUpperCase() || 'USD';
    const add =
      filter === 'paid'
        ? Number(r.total ?? 0)
        : rowBalanceDue(r);
    curMap.set(c, (curMap.get(c) ?? 0) + add);
  }

  const byCurrency = Array.from(curMap.entries()).map(([currency, amount]) => ({
    currency,
    amount,
  }));

  return {
    count,
    truncated: rows.length >= cap,
    byCurrency,
  };
}

export type AssistantDailyBusinessPriorityCounts = {
  overdue: number;
  dueToday: number;
  unpaid: number;
  /** Derived status `draft` (same row scan as other counts). */
  drafts: number;
  truncated: boolean;
};

/**
 * Single scan of recent invoices: overdue (dashboard rules), due today (workspace TZ), unpaid, drafts.
 */
export async function aggregateAssistantDailyBusinessPriorityCounts(
  supabase: SupabaseClient,
  businessId: string,
  workspaceTimezone: string | null | undefined,
  baseCurrencyCode: string,
  maxScan = STATUS_AGGREGATE_MAX_SCAN
): Promise<AssistantDailyBusinessPriorityCounts> {
  const tz = (workspaceTimezone && workspaceTimezone.trim()) || 'UTC';
  const civilTodayYmd = resolveCivilTodayYmdForOverdue(new Date(), tz);
  const todayYmd = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
  const base = (baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';
  const cap = Math.min(Math.max(maxScan, 1), 5000);
  const { data, error } = await supabase
    .from('invoices')
    .select(DASHBOARD_OVERDUE_INVOICE_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (error) {
    console.error('[assistant-invoice-queries] daily_business_priority', error.message);
    return { overdue: 0, dueToday: 0, unpaid: 0, drafts: 0, truncated: false };
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id ?? '')).filter(Boolean);
  const earliestPendingDueByInvoice =
    ids.length > 0 ? await fetchEarliestPendingDueYmdByInvoiceIds(supabase, ids) : new Map<string, string>();

  let overdue = 0;
  let dueToday = 0;
  let unpaid = 0;
  let drafts = 0;

  for (const r of rows) {
    const st = derivedStatus(r).toLowerCase();
    if (st === 'draft') {
      drafts++;
      continue;
    }
    if (rawInvoiceRowMatchesDashboardOverdue(r, base, earliestPendingDueByInvoice, civilTodayYmd)) {
      overdue++;
    }
    if (assistantInvoiceRowMatchesStatusFilter(r, 'unpaid')) unpaid++;
    if (assistantInvoiceRowDueToday(r, todayYmd)) dueToday++;
  }

  const truncated = rows.length >= cap;
  logOverdueParityDebug({
    surface: 'assistant_daily_aggregate',
    overdueCount: overdue,
    civilTodayYmd,
    scanTruncated: truncated,
    extra: { businessId },
  });

  return {
    overdue,
    dueToday,
    unpaid,
    drafts,
    truncated,
  };
}

/** Open-balance amounts for invoices due **today** (workspace civil date), same scan rules as daily priority counts. */
export async function aggregateAssistantDueTodayBalances(
  supabase: SupabaseClient,
  businessId: string,
  workspaceTimezone: string | null | undefined,
  maxScan = STATUS_AGGREGATE_MAX_SCAN
): Promise<{
  count: number;
  byCurrency: Array<{ currency: string; amount: number }>;
  truncated: boolean;
}> {
  const tz = (workspaceTimezone && workspaceTimezone.trim()) || 'UTC';
  const todayYmd = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
  const cap = Math.min(Math.max(maxScan, 1), 5000);
  const { data, error } = await supabase
    .from('invoices')
    .select(DASHBOARD_OVERDUE_INVOICE_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (error) {
    console.error('[assistant-invoice-queries] due_today_balances', error.message);
    return { count: 0, byCurrency: [], truncated: false };
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  const curMap = new Map<string, number>();
  let count = 0;

  for (const r of rows) {
    const st = derivedStatus(r).toLowerCase();
    if (st === 'draft') continue;
    if (!assistantInvoiceRowDueToday(r, todayYmd)) continue;
    count++;
    const c = String(r.currency ?? 'USD').trim().toUpperCase() || 'USD';
    curMap.set(c, (curMap.get(c) ?? 0) + rowBalanceDue(r));
  }

  const byCurrency = Array.from(curMap.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    count,
    byCurrency,
    truncated: rows.length >= cap,
  };
}

export async function fetchAssistantInvoiceList(
  supabase: SupabaseClient,
  businessId: string,
  opts: {
    limit?: number;
    filter: AssistantInvoiceListFilter;
    workspaceTimezone?: string | null;
    baseCurrencyCode?: string;
  }
): Promise<AssistantInvoiceListRow[]> {
  const limit = Math.min(opts.limit ?? 25, 50);
  const mult =
    opts.filter === 'partially_paid' ||
    opts.filter === 'paid' ||
    opts.filter === 'due_today' ||
    opts.filter === 'draft' ||
    opts.filter === 'overdue' ||
    opts.filter === 'unpaid'
      ? 8
      : 3;
  const selectCols = assistantInvoiceListFilterUsesBalanceFx(opts.filter)
    ? ASSISTANT_INVOICE_BALANCE_LIST_COLUMNS
    : SELECT_SHORT;
  let q = supabase
    .from('invoices')
    .select(selectCols as string)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit * mult, 200));

  const { data, error } = await q;
  if (error) {
    console.error('[assistant-invoice-queries] list', error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const refundStatusByInvoice = await loadRefundDisplayStatusByInvoiceId(
    supabase,
    rows.map((r) => String(r.id ?? ''))
  );
  const out: AssistantInvoiceListRow[] = [];
  const tz = (opts.workspaceTimezone && opts.workspaceTimezone.trim()) || 'UTC';
  const todayYmd = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
  const civilTodayYmd = resolveCivilTodayYmdForOverdue(new Date(), tz);
  const base = (opts.baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';

  const ids = rows.map((r) => String(r.id ?? '')).filter(Boolean);
  let earliestPendingDue: Map<string, string> | null = null;
  if (opts.filter === 'overdue' && ids.length > 0) {
    earliestPendingDue = await fetchEarliestPendingDueYmdByInvoiceIds(supabase, ids);
  }

  for (const r of rows) {
    const invoiceId = String(r.id ?? '').trim();
    const displayStatus = invoiceId ? refundStatusByInvoice.get(invoiceId) : undefined;
    const rowForDisplay = displayStatus ? { ...r, status: displayStatus } : r;
    if (opts.filter === 'draft') {
      if (derivedStatus(rowForDisplay).toLowerCase() !== 'draft') continue;
    } else if (opts.filter === 'due_today') {
      if (!assistantInvoiceRowDueToday(rowForDisplay, todayYmd)) continue;
    } else if (opts.filter === 'overdue') {
      if (!rawInvoiceRowMatchesDashboardOverdue(rowForDisplay, base, earliestPendingDue ?? new Map(), civilTodayYmd)) {
        continue;
      }
    } else if (!assistantInvoiceRowMatchesStatusFilter(rowForDisplay, opts.filter)) continue;
    out.push(
      assistantInvoiceListRowFromRecord(rowForDisplay, {
        filter: opts.filter,
        civilTodayYmd,
        earliestPendingDue: opts.filter === 'overdue' ? earliestPendingDue ?? new Map() : null,
        baseCurrencyCode: base,
      })
    );
    if (out.length >= limit) break;
  }

  return out;
}

export type AssistantBalancePeriodFilter = 'unpaid' | 'overdue';

/**
 * Invoices whose due_date falls in `bounds`, then filtered by derived unpaid/overdue status.
 * This is the operational AR view: balances due in the requested window (including currently overdue).
 */
export async function aggregateAssistantBalanceInDueWindow(
  supabase: SupabaseClient,
  businessId: string,
  bounds: { from: string; to: string },
  filter: AssistantBalancePeriodFilter,
  maxRows = 2000,
  opts?: { workspaceTimezone?: string | null; baseCurrencyCode?: string }
): Promise<{
  count: number;
  byCurrency: Array<{ currency: string; amount: number }>;
  rows: AssistantInvoiceListRow[];
  truncated: boolean;
}> {
  const cap = Math.min(Math.max(maxRows, 1), 5000);
  const base = (opts?.baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';
  const civilTodayYmd = resolveCivilTodayYmdForOverdue(new Date(), opts?.workspaceTimezone ?? null);
  const selectCols = ASSISTANT_INVOICE_BALANCE_LIST_COLUMNS;

  const { data, error } = await supabase
    .from('invoices')
    .select(selectCols)
    .eq('business_id', businessId)
    .gte('due_date', bounds.from)
    .lte('due_date', bounds.to)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (error) {
    console.error('[assistant-invoice-queries] balance_due_window', error.message);
    return { count: 0, byCurrency: [], rows: [], truncated: false };
  }

  const rawRows = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = rawRows.map((r) => String(r.id ?? '')).filter(Boolean);
  let earliestPendingDue: Map<string, string> | null = null;
  if (filter === 'overdue' && ids.length > 0) {
    earliestPendingDue = await fetchEarliestPendingDueYmdByInvoiceIds(supabase, ids);
  }

  const rows: AssistantInvoiceListRow[] = [];
  const curMap = new Map<string, number>();
  const listFilterForRow: AssistantInvoiceListFilter = filter === 'overdue' ? 'overdue' : 'unpaid';

  for (const r of rawRows) {
    if (filter === 'overdue') {
      if (!rawInvoiceRowMatchesDashboardOverdue(r, base, earliestPendingDue ?? new Map(), civilTodayYmd)) {
        continue;
      }
    } else if (!assistantInvoiceRowMatchesStatusFilter(r, filter)) {
      continue;
    }
    rows.push(
      assistantInvoiceListRowFromRecord(r, {
        filter: listFilterForRow,
        civilTodayYmd,
        earliestPendingDue: filter === 'overdue' ? earliestPendingDue ?? new Map() : null,
        baseCurrencyCode: base,
      })
    );
    const c = String(r.currency ?? 'USD').trim().toUpperCase() || 'USD';
    const bal = rowBalanceDue(r);
    curMap.set(c, (curMap.get(c) ?? 0) + bal);
  }

  const byCurrency = Array.from(curMap.entries()).map(([currency, amount]) => ({
    currency,
    amount,
  }));

  return {
    count: rows.length,
    byCurrency,
    rows,
    truncated: (data ?? []).length >= cap,
  };
}

export async function searchAssistantInvoicesByCustomerName(
  supabase: SupabaseClient,
  businessId: string,
  nameQuery: string,
  limit = 20,
  opts?: { baseCurrencyCode?: string | null }
): Promise<AssistantInvoiceListRow[]> {
  const q = nameQuery.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/%/g, '\\%').toLowerCase()}%`;
  const base = (opts?.baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';
  const civilTodayYmd = resolveCivilTodayYmdForOverdue(new Date(), null);

  const { data, error } = await supabase
    .from('invoices')
    .select(ASSISTANT_INVOICE_BALANCE_LIST_COLUMNS)
    .eq('business_id', businessId)
    .ilike('customer_name', pattern)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[assistant-invoice-queries] customer search', error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) =>
    assistantInvoiceListRowFromRecord(r, {
      filter: 'unpaid',
      civilTodayYmd,
      earliestPendingDue: null,
      baseCurrencyCode: base,
    })
  );
}

export function dateRangeBounds(
  preset:
    | 'today'
    | 'this_week'
    | 'last_week'
    | 'last_7_days'
    | 'this_month'
    | 'last_month',
  now = new Date()
): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  if (preset === 'today') {
    const t = iso(now);
    return { from: t, to: t };
  }
  if (preset === 'this_week') {
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(d - (day === 0 ? 6 : day - 1));
    return { from: iso(mon), to: iso(now) };
  }
  if (preset === 'last_week') {
    const day = now.getDay();
    const thisMon = new Date(now);
    thisMon.setDate(d - (day === 0 ? 6 : day - 1));
    const lastMon = new Date(thisMon);
    lastMon.setDate(lastMon.getDate() - 7);
    const lastSun = new Date(thisMon);
    lastSun.setDate(thisMon.getDate() - 1);
    return { from: iso(lastMon), to: iso(lastSun) };
  }
  if (preset === 'last_7_days') {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: iso(start), to: iso(end) };
  }
  if (preset === 'this_month') {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return { from: iso(start), to: iso(end) };
  }
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { from: iso(start), to: iso(end) };
}

export type PaidWindowAggregate = {
  /** Distinct invoices with a succeeded payment row counted in the window (payment ledger only). */
  invoiceCount: number;
  /** Per payment-currency leg totals (same rows as dashboard collected pipeline). */
  byCurrency: Array<{ currency: string; totalCollected: number }>;
  /** Sum in business base via stored payment FX (`getPaymentBaseAmount`). */
  totalCollectedInBase: number | null;
};

/**
 * Strict payment-time FX conversion for assistant collected displays.
 * Never assume foreign-currency leg amount equals base when FX metadata is missing.
 */
function assistantPaymentBaseAmountStrict(
  p: { amount: number; currency: string; amount_in_base: number | null; exchange_rate_to_base: number | null },
  baseCurrencyCode: string
): number | null {
  const base = (baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';
  const cur = (p.currency || base).trim().toUpperCase() || base;
  const amt = Number(p.amount ?? 0);
  if (cur === base) return amt;
  if (p.amount_in_base != null && Number.isFinite(p.amount_in_base) && p.amount_in_base > 0) {
    return Number(p.amount_in_base);
  }
  if (
    p.exchange_rate_to_base != null &&
    Number.isFinite(p.exchange_rate_to_base) &&
    p.exchange_rate_to_base > 0
  ) {
    return amt * Number(p.exchange_rate_to_base);
  }
  return null;
}

/**
 * Invoices with at least one succeeded payment in the window — same ledger filter as
 * `loadCollectedRevenueMetricForBusiness` (no invoice-row supplements).
 */
export async function fetchPaidInvoicesInUtcWindow(
  supabase: SupabaseClient,
  businessId: string,
  window: AssistantPaidUtcWindow,
  limit = 40,
  reportingCurrency?: string | null
): Promise<AssistantPaidInvoiceRow[]> {
  const cap = Math.min(Math.max(limit, 1), 80);
  const { startIso, endIso, timezone, label } = window;
  const baseCode = String(reportingCurrency ?? 'USD').trim().toUpperCase() || 'USD';

  const ledger = await loadLedgerPaymentsForCollectedAssistantWindow(
    supabase,
    businessId,
    baseCode,
    window
  );
  if (!ledger.ok) {
    console.error('[assistant-paid-invoices]', ledger.error);
    return [];
  }

  type Agg = { latestPaidAt: string };
  const byInvoice = new Map<string, Agg>();

  for (const p of ledger.payments) {
    if (Number(p.amount ?? 0) <= 0) continue;
    const iid = p.invoice_id;
    if (!iid) continue;
    const ca = p.payment_date;
    const prev = byInvoice.get(iid);
    if (!prev || ca > prev.latestPaidAt) {
      byInvoice.set(iid, { latestPaidAt: ca });
    }
  }

  const invoiceIds = Array.from(byInvoice.keys());
  const invoiceMap = new Map<string, Record<string, unknown>>();

  if (invoiceIds.length > 0) {
    const { data: invs, error: invErr } = await supabase
      .from('invoices')
      .select(SELECT_WITH_PAID_AT)
      .eq('business_id', businessId)
      .in('id', invoiceIds);
    if (invErr) {
      console.error('[assistant-paid-invoices] invoices by id', invErr.message);
    }
    for (const r of (invs ?? []) as Record<string, unknown>[]) {
      invoiceMap.set(String(r.id), r);
    }
  }
  const refundStatusByInvoice = await loadRefundDisplayStatusByInvoiceId(supabase, invoiceIds);

  const merged: AssistantPaidInvoiceRow[] = [];

  for (const [iid, agg] of Array.from(byInvoice.entries())) {
    const inv = invoiceMap.get(iid);
    if (!inv) continue;
    const displayStatus = refundStatusByInvoice.get(iid);
    merged.push(
      rowToPaidLookup({
        ...inv,
        ...(displayStatus ? { status: displayStatus } : {}),
        paid_at: agg.latestPaidAt,
      })
    );
  }

  merged.sort((a, b) => {
    const ta = a.paid_at ? Date.parse(a.paid_at) : 0;
    const tb = b.paid_at ? Date.parse(b.paid_at) : 0;
    return tb - ta;
  });

  const out = merged.slice(0, cap);

  console.info('[assistant-paid-invoices]', {
    intent_window_label: label,
    timezone,
    startIso,
    endIso,
    source: 'payments ledger (loadLedgerPaymentsForCollectedAssistantWindow)',
    ledger_row_count: ledger.payments.length,
    matched_invoice_ids: out.map((r) => r.id),
  });

  return out;
}

export async function aggregatePaidInUtcWindow(
  supabase: SupabaseClient,
  businessId: string,
  window: AssistantPaidUtcWindow,
  reportingCurrency?: string | null
): Promise<PaidWindowAggregate> {
  const { startIso, endIso, timezone, label } = window;
  const baseCode = String(reportingCurrency ?? 'USD').trim().toUpperCase() || 'USD';
  const computeBase = baseCode.length > 0;

  const ledger = await loadLedgerPaymentsForCollectedAssistantWindow(
    supabase,
    businessId,
    baseCode,
    window
  );
  if (!ledger.ok) {
    console.error('[assistant-paid-aggregate]', ledger.error);
    return { invoiceCount: 0, byCurrency: [], totalCollectedInBase: computeBase ? 0 : null };
  }

  const invoiceIds = new Set<string>();
  const totals = new Map<string, number>();
  let totalCollectedInBase = 0;
  let totalCollectedInBaseKnown = true;

  for (const p of ledger.payments) {
    if (p.invoice_id) invoiceIds.add(p.invoice_id);
    const cur = (p.currency || 'USD').trim().toUpperCase() || 'USD';
    const amt = Number(p.amount);
    totals.set(cur, (totals.get(cur) ?? 0) + amt);
    const strictBase = assistantPaymentBaseAmountStrict(p, baseCode);
    if (strictBase == null) {
      totalCollectedInBaseKnown = false;
    } else {
      totalCollectedInBase += strictBase;
    }
  }

  const byCurrency = Array.from(totals.entries())
    .map(([currency, totalCollected]) => ({ currency, totalCollected }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  totalCollectedInBase = roundMoney2(totalCollectedInBase);

  console.info('[assistant-paid-aggregate]', {
    intent_window_label: label,
    timezone,
    startIso,
    endIso,
    source: 'payments ledger (loadLedgerPaymentsForCollectedAssistantWindow)',
    invoice_count: invoiceIds.size,
    by_currency: byCurrency,
    total_collected_in_base:
      computeBase && totalCollectedInBaseKnown ? totalCollectedInBase : undefined,
    base_currency: computeBase ? baseCode : undefined,
    base_total_strict_fx_complete: totalCollectedInBaseKnown,
  });

  return {
    invoiceCount: invoiceIds.size,
    byCurrency,
    totalCollectedInBase: computeBase && totalCollectedInBaseKnown ? totalCollectedInBase : null,
  };
}

/** Per-invoice amounts actually received in the window (payment rows summed; supplements use `amount_paid`). */
export type AssistantCollectedInvoiceBreakdownRow = {
  invoice_id: string;
  /** Present for scoped drill-downs; omitted in older payloads. */
  customer_id: string | null;
  invoice_number: string | null;
  customer_name: string | null;
  status: string;
  receivedByCurrency: Array<{ currency: string; amount: number }>;
  receivedInBase: number | null;
  paid_at: string | null;
  /** Invoice grand total (not period-only); for preview and context. */
  invoice_total: number | null;
  /** Invoice currency (balance / totals). */
  invoice_currency: string | null;
  /** Outstanding balance after all payments (invoice currency). */
  balance_due: number | null;
};

type InvoiceBreakdownAgg = {
  byCur: Map<string, number>;
  baseSum: number;
  baseKnown: boolean;
  latestPaid: string | null;
};

/**
 * Invoice-level collected breakdown: sums succeeded **payment rows** in the window per invoice
 * (partial payments = separate rows). Same ledger pipeline as dashboard collected KPI.
 *
 * `receivedInBase` is summed from payment-time FX on each payment row (`amount_in_base` / payment
 * `exchange_rate_to_base`) — never from invoice FX.
 */
export async function fetchCollectedInvoicesBreakdownInUtcWindow(
  supabase: SupabaseClient,
  businessId: string,
  window: AssistantPaidUtcWindow,
  reportingCurrency: string,
  limit = 40,
  opts?: FetchCollectedInvoicesBreakdownOptions
): Promise<AssistantCollectedInvoiceBreakdownRow[]> {
  const baseCode = String(reportingCurrency ?? '')
    .trim()
    .toUpperCase() || 'USD';
  const cap = Math.min(Math.max(limit, 1), 80);
  const { startIso, endIso, timezone, label } = window;
  const scopeSet = customerGroupKeySetForScope(opts?.customerGroupKeys ?? null);

  const ledger = await loadLedgerPaymentsForCollectedAssistantWindow(
    supabase,
    businessId,
    baseCode,
    window
  );
  if (!ledger.ok) {
    console.error('[assistant-collected-invoice-breakdown]', ledger.error);
    return [];
  }

  const aggs = new Map<string, InvoiceBreakdownAgg>();

  for (const norm of ledger.payments) {
    const iid = norm.invoice_id?.trim();
    if (!iid) continue;
    const baseAmt = assistantPaymentBaseAmountStrict(norm, baseCode);
    let g = aggs.get(iid);
    if (!g) {
      g = { byCur: new Map(), baseSum: 0, baseKnown: true, latestPaid: null };
      aggs.set(iid, g);
    }
    const cur = norm.currency.trim().toUpperCase() || 'USD';
    g.byCur.set(cur, (g.byCur.get(cur) ?? 0) + norm.amount);
    if (baseAmt == null) {
      g.baseKnown = false;
    } else {
      g.baseSum += baseAmt;
    }
    const pd = norm.payment_date;
    if (!g.latestPaid || pd > g.latestPaid) g.latestPaid = pd;
  }

  const ids = Array.from(aggs.keys());
  if (ids.length === 0) return [];

  const { data: invs, error: invErr } = await supabase
    .from('invoices')
    .select(
      'id, customer_id, invoice_number, customer_name, total, currency, status, amount_paid, balance_due, paid_at, updated_at'
    )
    .eq('business_id', businessId)
    .in('id', ids);

  if (invErr) {
    console.error('[assistant-collected-invoice-breakdown] invoices', invErr.message);
  }

  const meta = new Map<string, Record<string, unknown>>();
  for (const r of (invs ?? []) as Record<string, unknown>[]) {
    meta.set(String(r.id), r);
  }
  const refundStatusByInvoice = await loadRefundDisplayStatusByInvoiceId(
    supabase,
    Array.from(meta.keys())
  );

  const out: AssistantCollectedInvoiceBreakdownRow[] = [];
  for (const [iid, g] of Array.from(aggs.entries())) {
    const inv = meta.get(iid);
    if (scopeSet) {
      if (!inv) continue;
      if (!scopeSet.has(collectedRevenueCustomerGroupKeyFromInvoiceRow(inv))) continue;
    }
    const stBase = inv
      ? deriveInvoiceStatus({
          status: String(inv.status ?? ''),
          total: Number(inv.total ?? 0),
          amount_paid: Number(inv.amount_paid ?? 0),
          balance_due:
            inv.balance_due != null && inv.balance_due !== ''
              ? Number(inv.balance_due)
              : Math.max(0, Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0)),
        })
      : 'unknown';
    const explicitRefundStatus = refundStatusByInvoice.get(iid);
    const st = explicitRefundStatus ?? stBase;

    const receivedByCurrency = Array.from(g.byCur.entries())
      .map(([currency, amount]) => ({ currency, amount: roundMoney2(amount) }))
      .filter((x) => x.amount > 0.00001)
      .sort((a, b) => a.currency.localeCompare(b.currency));

    const invoiceTotal =
      inv?.total != null && inv.total !== '' ? Number(inv.total) : null;
    const invoiceCurrency =
      inv?.currency != null ? String(inv.currency).trim().toUpperCase() : null;
    const balanceDue = inv
      ? resolveInvoiceBalanceDue({
          status: String(inv.status ?? ''),
          total: Number(inv.total ?? 0),
          amount_paid: Number(inv.amount_paid ?? 0),
        })
      : null;

    const customerIdForRow =
      inv?.customer_id != null && String(inv.customer_id).trim()
        ? String(inv.customer_id).trim()
        : null;

    out.push({
      invoice_id: iid,
      customer_id: customerIdForRow,
      invoice_number: inv?.invoice_number != null ? String(inv.invoice_number) : null,
      customer_name: inv?.customer_name != null ? String(inv.customer_name) : null,
      status: st,
      receivedByCurrency,
      receivedInBase: g.baseKnown ? roundMoney2(g.baseSum) : null,
      paid_at: g.latestPaid,
      invoice_total: invoiceTotal != null && Number.isFinite(invoiceTotal) ? invoiceTotal : null,
      invoice_currency: invoiceCurrency,
      balance_due: balanceDue,
    });
  }

  out.sort((a, b) => {
    const ta = a.paid_at ? Date.parse(a.paid_at) : 0;
    const tb = b.paid_at ? Date.parse(b.paid_at) : 0;
    return tb - ta;
  });

  console.info('[assistant-collected-invoice-breakdown]', {
    intent_window_label: label,
    timezone,
    startIso,
    endIso,
    row_count: Math.min(out.length, cap),
  });

  return out.slice(0, cap);
}

export type CollectedRevenueByCustomerRow = {
  /** Stable grouping key (not shown to user). */
  groupKey: string;
  customerLabel: string;
  currency: string;
  totalCollected: number;
};

/**
 * Collected revenue in a UTC window, grouped by customer (invoice `customer_id` when set, else name).
 * Payment ledger only — same rows as `loadCollectedRevenueMetricForBusiness`.
 */
export async function aggregateCollectedRevenueByCustomerInUtcWindow(
  supabase: SupabaseClient,
  businessId: string,
  window: AssistantPaidUtcWindow,
  baseCurrencyCode: string
): Promise<CollectedRevenueByCustomerRow[]> {
  const { startIso, endIso, timezone, label } = window;
  const baseCode = (baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';

  const ledger = await loadLedgerPaymentsForCollectedAssistantWindow(
    supabase,
    businessId,
    baseCode,
    window
  );
  if (!ledger.ok) {
    console.error('[assistant-revenue-by-customer]', ledger.error);
    return [];
  }

  const invoiceIds = [
    ...new Set(ledger.payments.map((p) => p.invoice_id).filter(Boolean) as string[]),
  ];
  const invoiceMap = new Map<string, Record<string, unknown>>();

  if (invoiceIds.length > 0) {
    const { data: invs, error: invErr } = await supabase
      .from('invoices')
      .select('id, customer_id, customer_name, total, currency')
      .eq('business_id', businessId)
      .in('id', invoiceIds);
    if (invErr) {
      console.error('[assistant-revenue-by-customer] invoices by id', invErr.message);
    }
    for (const r of (invs ?? []) as Record<string, unknown>[]) {
      invoiceMap.set(String(r.id), r);
    }
  }

  type Group = { label: string; byCur: Map<string, number> };
  const groups = new Map<string, Group>();

  function labelFromInvoice(inv: Record<string, unknown>): string {
    const n = inv.customer_name != null ? String(inv.customer_name).trim() : '';
    return n || 'Unknown customer';
  }

  function addAmount(key: string, labelHint: string, currency: string, amount: number): void {
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.00001) return;
    let g = groups.get(key);
    if (!g) {
      g = { label: labelHint, byCur: new Map() };
      groups.set(key, g);
    } else if (labelHint && labelHint !== 'Unknown customer' && g.label === 'Unknown customer') {
      g.label = labelHint;
    }
    const cur = currency.trim().toUpperCase() || 'USD';
    g.byCur.set(cur, (g.byCur.get(cur) ?? 0) + amount);
  }

  for (const p of ledger.payments) {
    const iid = p.invoice_id;
    if (!iid) continue;
    const inv = invoiceMap.get(iid);
    if (!inv) continue;
    const cur = (p.currency || 'USD').trim().toUpperCase() || 'USD';
    const amt = Number(p.amount);
    const key = collectedRevenueCustomerGroupKeyFromInvoiceRow(inv);
    addAmount(key, labelFromInvoice(inv), cur, amt);
  }

  const flat: CollectedRevenueByCustomerRow[] = [];
  for (const [groupKey, g] of Array.from(groups.entries())) {
    for (const [currency, totalCollected] of Array.from(g.byCur.entries())) {
      flat.push({
        groupKey,
        customerLabel: g.label,
        currency,
        totalCollected,
      });
    }
  }

  flat.sort((a, b) => {
    const c = a.customerLabel.localeCompare(b.customerLabel, undefined, { sensitivity: 'base' });
    if (c !== 0) return c;
    return a.currency.localeCompare(b.currency);
  });

  console.info('[assistant-revenue-by-customer]', {
    intent_window_label: label,
    timezone,
    startIso,
    endIso,
    row_count: flat.length,
  });

  return flat;
}

export type CollectedRevenueByDayRow = {
  /** Civil date in workspace timezone (`yyyy-MM-dd`). */
  dayYmd: string;
  currency: string;
  totalCollected: number;
};

function paidInstantToWorkspaceYmd(isoLike: unknown, timezone: string): string | null {
  if (isoLike == null || isoLike === '') return null;
  const d =
    typeof isoLike === 'string'
      ? new Date(isoLike)
      : isoLike instanceof Date
        ? isoLike
        : new Date(String(isoLike));
  if (Number.isNaN(d.getTime())) return null;
  return formatInTimeZone(d, timezone, 'yyyy-MM-dd');
}

/** User-facing label for a civil day in the workspace zone (matches dashboard-style bucketing). */
export function formatCollectedRevenueDayLabel(dayYmd: string, timezone: string): string {
  const anchor = fromZonedTime(`${dayYmd}T12:00:00`, timezone);
  return formatInTimeZone(anchor, timezone, 'EEE, MMM d, yyyy');
}

/**
 * Collected revenue in a UTC window, grouped by civil day in `window.timezone` + currency.
 * Payment ledger only (`loadLedgerPaymentsForCollectedAssistantWindow`).
 */
export async function aggregateCollectedRevenueByDayInUtcWindow(
  supabase: SupabaseClient,
  businessId: string,
  window: AssistantPaidUtcWindow,
  baseCurrencyCode: string,
  customerGroupKeys?: string[] | null
): Promise<CollectedRevenueByDayRow[]> {
  const { startIso, endIso, timezone, label } = window;
  const baseCode = (baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';

  const ledger = await loadLedgerPaymentsForCollectedAssistantWindow(
    supabase,
    businessId,
    baseCode,
    window
  );
  if (!ledger.ok) {
    console.error('[assistant-revenue-by-day]', ledger.error);
    return [];
  }

  const scopeSet = customerGroupKeySetForScope(customerGroupKeys ?? null);
  const invoiceMap = new Map<string, Record<string, unknown>>();
  if (scopeSet) {
    const invoiceIds = [
      ...new Set(ledger.payments.map((p) => p.invoice_id).filter(Boolean) as string[]),
    ];
    if (invoiceIds.length > 0) {
      const { data: invs, error: invErr } = await supabase
        .from('invoices')
        .select('id, customer_id, customer_name')
        .eq('business_id', businessId)
        .in('id', invoiceIds);
      if (invErr) {
        console.error('[assistant-revenue-by-day] invoices by id', invErr.message);
      }
      for (const r of (invs ?? []) as Record<string, unknown>[]) {
        invoiceMap.set(String(r.id), r);
      }
    }
  }

  const byDay = new Map<string, Map<string, number>>();

  function addToDay(ymd: string | null, currency: string, amount: number): void {
    if (!ymd || !Number.isFinite(amount) || Math.abs(amount) < 0.00001) return;
    const cur = currency.trim().toUpperCase() || 'USD';
    let m = byDay.get(ymd);
    if (!m) {
      m = new Map();
      byDay.set(ymd, m);
    }
    m.set(cur, (m.get(cur) ?? 0) + amount);
  }

  for (const p of ledger.payments) {
    const iid = p.invoice_id?.trim();
    if (!iid) continue;
    if (scopeSet) {
      const inv = invoiceMap.get(iid);
      if (!inv || !scopeSet.has(collectedRevenueCustomerGroupKeyFromInvoiceRow(inv))) continue;
    }
    const ymd = paidInstantToWorkspaceYmd(p.payment_date, timezone);
    const cur = (p.currency || 'USD').trim().toUpperCase() || 'USD';
    const amt = Number(p.amount);
    addToDay(ymd, cur, amt);
  }

  const ymdsSorted = Array.from(byDay.keys()).sort();
  const flat: CollectedRevenueByDayRow[] = [];
  for (const ymd of ymdsSorted) {
    const curMap = byDay.get(ymd)!;
    const currencies = Array.from(curMap.keys()).sort();
    for (const c of currencies) {
      flat.push({
        dayYmd: ymd,
        currency: c,
        totalCollected: curMap.get(c)!,
      });
    }
  }

  console.info('[assistant-revenue-by-day]', {
    intent_window_label: label,
    timezone,
    startIso,
    endIso,
    row_count: flat.length,
  });

  return flat;
}

export type CollectedRevenueByCalendarMonthRow = {
  /** First day of month in workspace TZ (`yyyy-MM-dd`). */
  monthYmd: string;
  currency: string;
  totalCollected: number;
};

/** User-facing month label (e.g. `Jan 2026`) for a `monthYmd` anchor. */
export function formatCollectedRevenueMonthLabel(monthYmd: string, timezone: string): string {
  const anchor = fromZonedTime(`${monthYmd}T12:00:00`, timezone);
  return formatInTimeZone(anchor, timezone, 'MMM yyyy');
}

/**
 * Collected revenue grouped by calendar month in `window.timezone` + currency (payment ledger only).
 */
export async function aggregateCollectedRevenueByCalendarMonthInUtcWindow(
  supabase: SupabaseClient,
  businessId: string,
  window: AssistantPaidUtcWindow,
  baseCurrencyCode: string
): Promise<CollectedRevenueByCalendarMonthRow[]> {
  const { startIso, endIso, timezone, label } = window;
  const baseCode = (baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';

  const ledger = await loadLedgerPaymentsForCollectedAssistantWindow(
    supabase,
    businessId,
    baseCode,
    window
  );
  if (!ledger.ok) {
    console.error('[assistant-revenue-by-month]', ledger.error);
    return [];
  }

  const byMonth = new Map<string, Map<string, number>>();

  function addToMonth(ymd: string | null, currency: string, amount: number): void {
    if (!ymd || !Number.isFinite(amount) || Math.abs(amount) < 0.00001) return;
    const cur = currency.trim().toUpperCase() || 'USD';
    const monthYmd = `${ymd.slice(0, 7)}-01`;
    let m = byMonth.get(monthYmd);
    if (!m) {
      m = new Map();
      byMonth.set(monthYmd, m);
    }
    m.set(cur, (m.get(cur) ?? 0) + amount);
  }

  for (const p of ledger.payments) {
    const dayYmd = paidInstantToWorkspaceYmd(p.payment_date, timezone);
    const cur = (p.currency || 'USD').trim().toUpperCase() || 'USD';
    const amt = Number(p.amount);
    addToMonth(dayYmd, cur, amt);
  }

  const monthsSorted = Array.from(byMonth.keys()).sort();
  const flat: CollectedRevenueByCalendarMonthRow[] = [];
  for (const monthYmd of monthsSorted) {
    const curMap = byMonth.get(monthYmd)!;
    const currencies = Array.from(curMap.keys()).sort();
    for (const c of currencies) {
      flat.push({
        monthYmd,
        currency: c,
        totalCollected: curMap.get(c)!,
      });
    }
  }

  console.info('[assistant-revenue-by-month]', {
    intent_window_label: label,
    timezone,
    startIso,
    endIso,
    row_count: flat.length,
  });

  return flat;
}

export async function fetchAssistantInvoicesByDateRange(
  supabase: SupabaseClient,
  businessId: string,
  bounds: { from: string; to: string },
  field: 'issue' | 'created',
  limit = 25
): Promise<InvoiceLookupRow[]> {
  const col = field === 'issue' ? 'issue_date' : 'created_at';
  const { data, error } = await supabase
    .from('invoices')
    .select(SELECT_SHORT)
    .eq('business_id', businessId)
    .gte(col, `${bounds.from}T00:00:00`)
    .lte(col, `${bounds.to}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[assistant-invoice-queries] date range', error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(rowToLookup);
}

export async function aggregateAssistantInvoiceInsights(
  supabase: SupabaseClient,
  businessId: string,
  opts: {
    metric:
      | 'invoiced_today'
      | 'invoiced_this_week'
      | 'invoiced_this_month'
      | 'total_unpaid'
      | 'total_overdue';
    /** Base currency for rough display — per-invoice currency not converted here (MVP). */
    reportingCurrency: string;
    workspaceTimezone?: string | null;
  }
): Promise<{ total: number; currency: string; count: number }> {
  if (opts.metric === 'total_overdue') {
    const snap = await loadDashboardOverdueSnapshot(supabase, businessId, {
      baseCurrencyCode: opts.reportingCurrency,
      workspaceTimezone: opts.workspaceTimezone,
      maxScan: 5000,
    });
    return {
      total: snap.totalBase,
      currency: (opts.reportingCurrency || 'USD').trim().toUpperCase() || 'USD',
      count: snap.invoiceCount,
    };
  }

  const invoicedBounds =
    opts.metric === 'invoiced_today'
      ? dateRangeBounds('today')
      : opts.metric === 'invoiced_this_week'
        ? dateRangeBounds('this_week')
        : opts.metric === 'invoiced_this_month'
          ? dateRangeBounds('this_month')
          : null;

  let q = supabase.from('invoices').select(SELECT_SHORT).eq('business_id', businessId);

  if (invoicedBounds) {
    q = q.gte('issue_date', invoicedBounds.from).lte('issue_date', invoicedBounds.to).limit(500);
  } else {
    q = q.order('created_at', { ascending: false }).limit(500);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[assistant-invoice-queries] aggregate', error.message);
    return { total: 0, currency: opts.reportingCurrency, count: 0 };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  let total = 0;
  let count = 0;
  const curSet = new Set<string>();

  for (const r of rows) {
    const st = derivedStatus(r).toLowerCase();
    const totalNum = Number(r.total ?? 0);
    const bal = resolveInvoiceBalanceDue({
      status: String(r.status ?? ''),
      total: totalNum,
      amount_paid: Number(r.amount_paid ?? 0),
    });

    if (invoicedBounds) {
      total += totalNum;
      count += 1;
      if (r.currency) curSet.add(String(r.currency).toUpperCase());
      continue;
    }

    if (opts.metric === 'total_unpaid') {
      if (['paid', 'voided', 'cancelled', 'draft'].includes(st)) continue;
      if (bal <= 0.02) continue;
      total += bal;
      count += 1;
      if (r.currency) curSet.add(String(r.currency).toUpperCase());
      continue;
    }

    // total_overdue is resolved via canonical dashboard snapshot above.
  }

  const currency =
    curSet.size === 1
      ? Array.from(curSet)[0]!
      : curSet.size > 1
        ? 'MIXED'
        : opts.reportingCurrency;
  return { total, currency, count };
}
