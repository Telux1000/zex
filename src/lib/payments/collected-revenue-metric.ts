import type { SupabaseClient } from '@supabase/supabase-js';
import { paidUtcToResolvedPaymentsShape } from '@/lib/business-assistant/financial-metric-queries';
import type { AssistantPaidUtcWindow } from '@/lib/invoices/assistant-invoice-paid-bounds';
import {
  collectionQueryUpperBound,
  resolvePaymentsReceivedTimeRange,
  type PaymentsNaturalRangeSpec,
  type ResolvedPaymentsTimeRange,
} from '@/lib/analytics/payments-received-time-range';
import {
  getDashboardFinancialRange,
  type DashboardRangePreset,
} from '@/lib/dashboard/date-range';
import {
  getDashboardCollectedBreakdown,
  getPaymentBaseAmount,
  getPaymentsInFinancialRange,
  type DashboardCollectedBreakdown,
  type DashboardInvoiceCollectedInput,
  type NormalizedPaymentRecord,
} from '@/lib/payments/normalize';
import { formatCurrencyAmount } from '@/lib/utils/currency';

/**
 * Per leg-currency bucket for collected revenue (payment rows only; FX via stored `amount_in_base` /
 * `exchange_rate_to_base` on each **payment** record). Invoice-issue FX must not be substituted here.
 */
export type CurrencyAmountRow = {
  currency: string;
  original_amount: number;
  base_currency_equivalent: number;
};

export type CollectedRevenueDebug = {
  source: 'dashboard_collected_pipeline';
  surface: 'dashboard' | 'assistant' | 'ai_payments_question';
  /** Lower bound used for `payments.created_at >=` fetch. */
  fetchStartIso: string;
  /** Inclusive end instant used for in-range payment / supplement touch filtering. */
  rangeEndIso: string;
  timezone: string | null | undefined;
  dashboardPreset: DashboardRangePreset | null;
  ledgerRowCount: number;
  supplementCount: number;
  ledgerPaymentIds: string[];
  totalBase: number;
  byCurrency: CurrencyAmountRow[];
};

export type CollectedRevenueMetricResult = {
  totalBase: number;
  breakdown: DashboardCollectedBreakdown;
  byCurrency: CurrencyAmountRow[];
  debug: CollectedRevenueDebug;
};

export type CollectedRevenueMetricLogContext = Pick<
  CollectedRevenueDebug,
  'surface' | 'fetchStartIso' | 'rangeEndIso' | 'timezone' | 'dashboardPreset'
>;

/** Tool/API row: canonical names plus legacy `amount` / `amount_in_base` aliases. */
export type CollectedByCurrencyToolRow = {
  currency: string;
  original_amount: number;
  base_currency_equivalent: number;
  amount: number;
  amount_in_base: number;
  /** Pre-formatted line for user-facing breakdown — copy verbatim so LLMs do not round FX (e.g. $63.67 not $64). */
  breakdown_line: string;
};

/**
 * One breakdown row as shown after "Breakdown by currency:" (matches `revenueCollectedSummaryStructured`).
 */
export function formatCollectedByCurrencyBreakdownLine(
  row: CurrencyAmountRow,
  baseCurrencyCode: string
): string {
  const base = (baseCurrencyCode || 'USD').trim().toUpperCase();
  const cur = (row.currency || base).trim().toUpperCase();
  const leg = formatCurrencyAmount(row.original_amount, cur);
  if (cur === base) {
    return `${cur}: ${leg}`;
  }
  return `${cur}: ${leg} → ${formatCurrencyAmount(row.base_currency_equivalent, base)}`;
}

export function collectedByCurrencyRowsForTool(
  rows: CurrencyAmountRow[],
  baseCurrencyCode: string
): CollectedByCurrencyToolRow[] {
  return rows.map((r) => ({
    currency: r.currency,
    original_amount: r.original_amount,
    base_currency_equivalent: r.base_currency_equivalent,
    amount: r.original_amount,
    amount_in_base: r.base_currency_equivalent,
    breakdown_line: formatCollectedByCurrencyBreakdownLine(r, baseCurrencyCode),
  }));
}

/**
 * Collected cash: sum **payment** rows in the period (see `getPaymentsInFinancialRange`). Each row
 * carries its own amount and FX; partial payments are separate rows.
 */
export function computeCollectedRevenueMetric(
  paymentRows: Record<string, unknown>[],
  collectedInvoiceSlice: DashboardInvoiceCollectedInput[],
  baseCurrencyCode: string,
  rangePeriodStart: Date,
  rangeEnd: Date,
  logCtx: CollectedRevenueMetricLogContext
): CollectedRevenueMetricResult {
  const breakdown = getDashboardCollectedBreakdown(
    paymentRows,
    collectedInvoiceSlice,
    baseCurrencyCode,
    rangePeriodStart,
    rangeEnd
  );
  const totalBase = breakdown.ledger;

  const inRange = getPaymentsInFinancialRange(
    paymentRows,
    rangePeriodStart,
    rangeEnd,
    baseCurrencyCode
  );

  const base = (baseCurrencyCode || 'USD').toUpperCase();
  const bucket = new Map<string, { leg: number; baseSum: number }>();
  const bump = (currency: string, legDelta: number, baseDelta: number) => {
    const cur = (currency || base).toUpperCase();
    const row = bucket.get(cur) ?? { leg: 0, baseSum: 0 };
    row.leg += legDelta;
    row.baseSum += baseDelta;
    bucket.set(cur, row);
  };

  for (const p of inRange) {
    bump(p.currency, p.amount, getPaymentBaseAmount(p, baseCurrencyCode));
  }

  const byCurrency = Array.from(bucket.entries())
    .filter(([, v]) => Math.abs(v.leg) > 0.0000001 || Math.abs(v.baseSum) > 0.0000001)
    .map(([currency, v]) => ({
      currency,
      original_amount: v.leg,
      base_currency_equivalent: v.baseSum,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const debug: CollectedRevenueDebug = {
    source: 'dashboard_collected_pipeline',
    surface: logCtx.surface,
    fetchStartIso: logCtx.fetchStartIso,
    rangeEndIso: logCtx.rangeEndIso,
    timezone: logCtx.timezone,
    dashboardPreset: logCtx.dashboardPreset,
    ledgerRowCount: inRange.length,
    supplementCount: breakdown.supplements.length,
    ledgerPaymentIds: inRange.map((p) => String(p.id || '')).filter(Boolean),
    totalBase,
    byCurrency,
  };

  console.info('[collected-revenue-metric]', debug);

  return { totalBase, breakdown, byCurrency, debug };
}

/**
 * Load payments whose **receipt time** (`paid_at`) falls in the reporting window. Using `created_at`
 * can miss rows that belong in-range but were inserted with an older created_at.
 */
async function selectPaymentsForCollectedMetric(
  supabase: SupabaseClient,
  businessId: string,
  paidAtStartIso: string,
  paidAtEndIso: string
) {
  const primary = await supabase
    .from('payments')
    .select(
      'id, invoice_id, amount, amount_in_base, currency, exchange_rate_to_base, status, created_at, paid_at, metadata'
    )
    .eq('business_id', businessId)
    .gte('paid_at', paidAtStartIso)
    .lte('paid_at', paidAtEndIso)
    .order('paid_at', { ascending: false })
    .limit(5000);

  // Backstop for rows where paid_at is missing or set to a future synthetic instant while the
  // payment event itself was recorded in-range (created_at). This keeps "paid today" accurate.
  const createdAtFallback = await supabase
    .from('payments')
    .select(
      'id, invoice_id, amount, amount_in_base, currency, exchange_rate_to_base, status, created_at, paid_at, metadata'
    )
    .eq('business_id', businessId)
    .gte('created_at', paidAtStartIso)
    .lte('created_at', paidAtEndIso)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (!primary.error && !createdAtFallback.error) {
    const merged = new Map<string, Record<string, unknown>>();
    for (const row of ((primary.data ?? []) as Record<string, unknown>[])) {
      const id = String(row.id ?? '').trim();
      if (id) merged.set(id, row);
    }
    for (const row of ((createdAtFallback.data ?? []) as Record<string, unknown>[])) {
      const id = String(row.id ?? '').trim();
      if (id) merged.set(id, row);
    }
    return { data: Array.from(merged.values()), error: null };
  }

  if (!primary.error) return primary;
  if (!/column .* does not exist/i.test(primary.error?.message ?? '')) return primary;
  return supabase
    .from('payments')
    .select('id, invoice_id, amount, created_at, paid_at, status')
    .eq('business_id', businessId)
    .gte('paid_at', paidAtStartIso)
    .lte('paid_at', paidAtEndIso)
    .order('paid_at', { ascending: false })
    .limit(5000);
}

/** Same payment rows + in-range filter as `loadCollectedRevenueMetricForBusiness` (ledger-only, stored FX). */
export type LedgerPaymentsForWindowResult =
  | { ok: true; payments: NormalizedPaymentRecord[]; rangeEnd: Date }
  | { ok: false; error: string };

export async function loadLedgerPaymentsForCollectedResolvedWindow(
  supabase: SupabaseClient,
  businessId: string,
  baseCurrencyCode: string,
  resolved: ResolvedPaymentsTimeRange
): Promise<LedgerPaymentsForWindowResult> {
  const rangeEnd = collectionQueryUpperBound(resolved);
  const paidAtStart = resolved.startIso;
  const paidAtEnd = rangeEnd.toISOString();
  const payRes = await selectPaymentsForCollectedMetric(supabase, businessId, paidAtStart, paidAtEnd);
  if (payRes.error) {
    return { ok: false, error: payRes.error.message ?? 'Failed to load payments' };
  }
  const raw = (payRes.data ?? []) as Record<string, unknown>[];
  const rangePeriodStart = new Date(resolved.startIso);
  const baseCode = (baseCurrencyCode || 'USD').toUpperCase();
  const inRange = getPaymentsInFinancialRange(raw, rangePeriodStart, rangeEnd, baseCode);
  return { ok: true, payments: inRange, rangeEnd };
}

export async function loadLedgerPaymentsForCollectedAssistantWindow(
  supabase: SupabaseClient,
  businessId: string,
  baseCurrencyCode: string,
  utcWindow: AssistantPaidUtcWindow
): Promise<LedgerPaymentsForWindowResult> {
  const resolved = paidUtcToResolvedPaymentsShape(utcWindow);
  return loadLedgerPaymentsForCollectedResolvedWindow(supabase, businessId, baseCurrencyCode, resolved);
}

export function dashboardPresetForRevenueSpec(
  spec: PaymentsNaturalRangeSpec
): DashboardRangePreset | null {
  if (spec.kind === 'rolling_days' && spec.days === 7) return 'last_7_days';
  if (spec.kind === 'rolling_days' && spec.days === 90) return 'last_90_days';
  if (spec.kind === 'this_month') return 'this_month';
  return null;
}

/**
 * Aligns `payments.created_at >=` lower bound with the dashboard date picker for presets the UI exposes.
 */
export function collectedMetricFetchStartIso(
  spec: PaymentsNaturalRangeSpec,
  workspaceTimezone: string | null | undefined,
  now: Date
): string {
  const tz = workspaceTimezone ?? undefined;
  const preset = dashboardPresetForRevenueSpec(spec);
  if (preset) {
    return getDashboardFinancialRange(preset, now, tz).startIso;
  }
  const r = resolvePaymentsReceivedTimeRange(spec, now, workspaceTimezone);
  return r.ok ? r.value.startIso : '';
}

export type LoadCollectedRevenueOptions = {
  paymentsWindow: ResolvedPaymentsTimeRange;
  fetchStartIso: string;
  surface: CollectedRevenueDebug['surface'];
  timezone?: string | null;
  dashboardPreset?: DashboardRangePreset | null;
};

/**
 * Loads payments in the **paid_at** window, then runs the same collected pipeline as the dashboard.
 * Invoice rows are not used for totals (payment ledger only).
 */
export async function loadCollectedRevenueMetricForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  baseCurrencyCode: string,
  opts: LoadCollectedRevenueOptions
): Promise<CollectedRevenueMetricResult | { error: string }> {
  const rangeEnd = collectionQueryUpperBound(opts.paymentsWindow);
  const paidAtStart = opts.paymentsWindow.startIso;
  const paidAtEnd = rangeEnd.toISOString();

  const payRes = await selectPaymentsForCollectedMetric(
    supabase,
    businessId,
    paidAtStart,
    paidAtEnd
  );

  if (payRes.error) {
    return { error: payRes.error.message ?? 'Failed to load payments' };
  }

  const baseCode = (baseCurrencyCode || 'USD').toUpperCase();
  const payments = (payRes.data ?? []) as Record<string, unknown>[];
  const rangePeriodStart = new Date(opts.paymentsWindow.startIso);

  return computeCollectedRevenueMetric(
    payments,
    [],
    baseCode,
    rangePeriodStart,
    rangeEnd,
    {
      surface: opts.surface,
      fetchStartIso: opts.fetchStartIso,
      rangeEndIso: rangeEnd.toISOString(),
      timezone: opts.timezone ?? opts.paymentsWindow.timezone,
      dashboardPreset: opts.dashboardPreset ?? null,
    }
  );
}
