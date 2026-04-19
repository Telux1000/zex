import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDashboardDateKey } from '@/lib/dashboard/date-range';
import {
  isInvoiceOpenForReporting,
  isInvoiceOverdue,
  normalizeInvoiceRecord,
  type NormalizedInvoiceRecord,
} from '@/lib/invoices/normalize';
import { deriveInvoiceStatus } from '@/lib/invoices/status';

/** Columns needed for `normalizeInvoiceRecord` + past-due UI predicate (invoice list + assistant). */
export const INVOICE_PAST_DUE_SCAN_COLUMNS =
  'id, invoice_number, customer_id, customer_name, total, currency, status, amount_paid, balance_due, total_refunded, issue_date, due_date, created_at, use_payment_schedule, total_in_base, exchange_rate_to_base, base_currency_code';

/**
 * Civil “today” for past-due comparisons. Must match invoice list API and dashboard UI (workspace TZ).
 */
export function resolvePastDueCivilTodayYmd(now: Date, workspaceTimezone?: string | null): string {
  return formatDashboardDateKey(now, workspaceTimezone ?? undefined);
}

export type PastDueComparableInvoice = Pick<
  NormalizedInvoiceRecord,
  'id' | 'status' | 'due_date' | 'balance_due' | 'total' | 'amount_paid' | 'use_payment_schedule' | 'total_refunded'
>;

/**
 * First row per invoice_id wins — caller must pass rows ordered by `due_date` ascending
 * (same as `/api/invoices` GET + `invoice_payment_schedule_items` query).
 */
export function buildEarliestPendingDueYmdByInvoiceId(
  pendingRows: Array<{ invoice_id?: string; due_date?: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of pendingRows) {
    const id = String(row.invoice_id ?? '');
    const d = String(row.due_date ?? '').slice(0, 10);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!map.has(id)) map.set(id, d);
  }
  return map;
}

export async function fetchEarliestPendingDueYmdByInvoiceIds(
  supabase: SupabaseClient,
  invoiceIds: string[]
): Promise<Map<string, string>> {
  const empty = new Map<string, string>();
  if (invoiceIds.length === 0) return empty;
  const { data, error } = await supabase
    .from('invoice_payment_schedule_items')
    .select('invoice_id, due_date')
    .in('invoice_id', invoiceIds)
    .eq('status', 'pending')
    .order('due_date', { ascending: true });
  if (error) {
    console.error('[invoice-past-due-ui] pending_fetch', error.message);
    return empty;
  }
  return buildEarliestPendingDueYmdByInvoiceId(data ?? []);
}

/** `next_due_date` in `/api/invoices`: earliest pending installment, else invoice `due_date`. */
export function nextDueYmdForPastDueUi(
  inv: Pick<PastDueComparableInvoice, 'id' | 'due_date' | 'use_payment_schedule'>,
  earliestPendingByInvoice: Map<string, string>
): string {
  const fromSchedule = earliestPendingByInvoice.get(inv.id);
  if (fromSchedule) return fromSchedule;
  return String(inv.due_date ?? '').slice(0, 10);
}

/**
 * Authoritative past-due predicate for invoice management UI:
 * `status=overdue` quick filter and `schedule_filter=past_due`.
 * — `due_date` / schedule dates compared to civil today (workspace TZ)
 * — remaining balance via `isInvoiceOverdue` → `getInvoiceRemainingBalance`
 */
export function invoiceMatchesPastDueUi(
  inv: PastDueComparableInvoice,
  civilTodayYmd: string,
  nextDueYmd: string
): boolean {
  const derived = deriveInvoiceStatus({
    status: inv.status,
    total: inv.total,
    amount_paid: inv.amount_paid,
    balance_due: inv.balance_due,
    total_refunded: inv.total_refunded ?? 0,
  });
  return isInvoiceOverdue(
    {
      status: derived,
      due_date: inv.due_date,
      balance_due: inv.balance_due,
      total: inv.total,
      amount_paid: inv.amount_paid,
      use_payment_schedule: inv.use_payment_schedule,
      total_refunded: inv.total_refunded ?? 0,
    },
    {
      hasOverduePendingInstallment:
        !!inv.use_payment_schedule &&
        !!nextDueYmd &&
        nextDueYmd < civilTodayYmd &&
        isInvoiceOpenForReporting({
          status: derived,
          total: inv.total,
          amount_paid: inv.amount_paid,
          balance_due: inv.balance_due,
          total_refunded: inv.total_refunded ?? 0,
        }),
    },
    civilTodayYmd
  );
}

export function normalizedInvoiceMatchesPastDueUi(
  inv: NormalizedInvoiceRecord,
  earliestPendingByInvoice: Map<string, string>,
  civilTodayYmd: string
): boolean {
  const nextDue = nextDueYmdForPastDueUi(inv, earliestPendingByInvoice);
  return invoiceMatchesPastDueUi(inv, civilTodayYmd, nextDue);
}

export function rawInvoiceRowMatchesPastDueUi(
  row: Record<string, unknown>,
  baseCurrencyCode: string,
  earliestPendingByInvoice: Map<string, string>,
  civilTodayYmd: string
): boolean {
  const inv = normalizeInvoiceRecord(row, baseCurrencyCode);
  if (!inv) return false;
  return normalizedInvoiceMatchesPastDueUi(inv, earliestPendingByInvoice, civilTodayYmd);
}

/**
 * Loads recent invoices and returns those matching the invoice table “Past due” rules.
 * (Business is resolved from the authenticated user in API routes / assistant pipeline.)
 */
export async function getPastDueInvoicesForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  workspaceTimezone: string | null | undefined,
  baseCurrencyCode: string,
  maxScan = 2000
): Promise<{
  matches: NormalizedInvoiceRecord[];
  civilTodayYmd: string;
  truncated: boolean;
}> {
  const cap = Math.min(Math.max(maxScan, 1), 5000);
  const base = (baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';
  const civilTodayYmd = resolvePastDueCivilTodayYmd(new Date(), workspaceTimezone);

  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_PAST_DUE_SCAN_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (error) {
    console.error('[invoice-past-due-ui] getPastDueInvoicesForBusiness', error.message);
    return { matches: [], civilTodayYmd, truncated: false };
  }

  const rawRows = (data ?? []) as Record<string, unknown>[];
  const ids = rawRows.map((r) => String(r.id ?? '')).filter(Boolean);
  const earliestPending =
    ids.length > 0 ? await fetchEarliestPendingDueYmdByInvoiceIds(supabase, ids) : new Map<string, string>();

  const matches: NormalizedInvoiceRecord[] = [];
  for (const r of rawRows) {
    const inv = normalizeInvoiceRecord(r, base);
    if (!inv) continue;
    if (normalizedInvoiceMatchesPastDueUi(inv, earliestPending, civilTodayYmd)) matches.push(inv);
  }

  return {
    matches,
    civilTodayYmd,
    truncated: rawRows.length >= cap,
  };
}
