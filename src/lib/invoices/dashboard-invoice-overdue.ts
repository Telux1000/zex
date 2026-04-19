/**
 * Dashboard / assistant parity with invoice management “Past due” (see `invoice-past-due-ui.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedInvoiceRecord } from '@/lib/invoices/normalize';
import { getInvoiceRemainingBalance } from '@/lib/invoices/normalize';
import {
  fetchEarliestPendingDueYmdByInvoiceIds,
  getPastDueInvoicesForBusiness,
  INVOICE_PAST_DUE_SCAN_COLUMNS,
  normalizedInvoiceMatchesPastDueUi,
  rawInvoiceRowMatchesPastDueUi,
  resolvePastDueCivilTodayYmd,
} from '@/lib/invoices/invoice-past-due-ui';

export const DASHBOARD_OVERDUE_INVOICE_COLUMNS = INVOICE_PAST_DUE_SCAN_COLUMNS;

export const resolveCivilTodayYmdForOverdue = resolvePastDueCivilTodayYmd;

export { fetchEarliestPendingDueYmdByInvoiceIds } from '@/lib/invoices/invoice-past-due-ui';

export function normalizedInvoiceMatchesDashboardOverdue(
  inv: NormalizedInvoiceRecord,
  earliestPendingDueByInvoice: Map<string, string>,
  civilTodayYmd: string
): boolean {
  return normalizedInvoiceMatchesPastDueUi(inv, earliestPendingDueByInvoice, civilTodayYmd);
}

export function rawInvoiceRowMatchesDashboardOverdue(
  row: Record<string, unknown>,
  baseCurrencyCode: string,
  earliestPendingDueByInvoice: Map<string, string>,
  civilTodayYmd: string
): boolean {
  return rawInvoiceRowMatchesPastDueUi(row, baseCurrencyCode, earliestPendingDueByInvoice, civilTodayYmd);
}

export type DashboardOverdueSnapshot = {
  invoiceCount: number;
  totalBase: number;
  byCurrency: Array<{ currency: string; amount: number }>;
};

/**
 * Canonical overdue snapshot used by dashboard and assistant.
 */
export async function loadDashboardOverdueSnapshot(
  supabase: SupabaseClient,
  businessId: string,
  opts?: { baseCurrencyCode?: string; workspaceTimezone?: string | null; maxScan?: number }
): Promise<DashboardOverdueSnapshot> {
  const base = (opts?.baseCurrencyCode || 'USD').trim().toUpperCase() || 'USD';
  const { matches } = await getPastDueInvoicesForBusiness(
    supabase,
    businessId,
    opts?.workspaceTimezone,
    base,
    opts?.maxScan ?? 5000
  );

  let invoiceCount = 0;
  let totalBase = 0;
  const byCurrencyMap = new Map<string, number>();

  for (const inv of matches) {
    const remaining = getInvoiceRemainingBalance(inv);
    if (!Number.isFinite(remaining) || remaining <= 0.02) continue;
    const rate =
      Number(inv.exchange_rate_to_base || 0) > 0
        ? Number(inv.exchange_rate_to_base)
        : String(inv.currency || base).toUpperCase() === base
          ? 1
          : 1;
    invoiceCount += 1;
    totalBase += remaining * rate;
    const cur = String(inv.currency || base).trim().toUpperCase() || base;
    byCurrencyMap.set(cur, (byCurrencyMap.get(cur) ?? 0) + remaining);
  }

  const byCurrency = Array.from(byCurrencyMap.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  return { invoiceCount, totalBase, byCurrency };
}

export function logOverdueParityDebug(payload: {
  surface: string;
  overdueCount: number;
  civilTodayYmd: string;
  scanTruncated?: boolean;
  extra?: Record<string, unknown>;
}): void {
  console.info('[overdue-parity]', {
    ...payload,
    at: new Date().toISOString(),
  });
}
