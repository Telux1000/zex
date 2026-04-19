import type { ResolvedPaymentsTimeRange } from '@/lib/analytics/payments-received-time-range';
import { assistantAnalyticsPeriodTitleSuffix } from '@/lib/business-assistant/financial-date-range-resolver';

/**
 * Echo of structured intent for follow-ups (`snapshotActiveQueryFromStructured`).
 * String fields keep this module free of circular imports with the structured parser.
 */
export type AssistantActiveQueryContext = {
  intentFamily: string;
  businessObject: string;
  queryShape: string;
  scope: string;
  breakdownDimension?: string;
  invoiceStatusFilter?: string;
  includePartialPayments?: boolean;
  baseCurrencyCode?: string;
  rangeLabel?: string;
  periodTitleSuffix?: string;
  paymentsWindow?: {
    startIso: string;
    endIso: string;
    timezone: string;
    label: string;
  };
};

/**
 * Optional state describing the last financial assistant answer so follow-ups stay scoped.
 * Serialized on `InvoiceWizardResponse` for clients that want to echo it on the next turn.
 */
export type AssistantMetricSessionContext = {
  currentIntent:
    | 'revenue_collected_total'
    | 'revenue_invoiced_total'
    | 'revenue_breakdown_by_invoice'
    | 'revenue_breakdown_by_customer'
    | 'revenue_breakdown_by_customer_deferred'
    | 'revenue_breakdown_by_day'
    | 'revenue_breakdown_by_day_deferred'
    | 'revenue_breakdown_by_currency'
    | 'revenue_breakdown_by_month';
  /** `invoiced_revenue` = invoice totals by issue_date; `collected_revenue` = cash by payment time. */
  currentMetric: 'collected_revenue' | 'invoiced_revenue';
  /** Resolver label e.g. `past_14_days`, `this_month` */
  rangeLabel: string;
  /** User-facing period suffix e.g. `last 14 days` */
  periodTitleSuffix: string;
  currentResultType:
    | 'currency_summary'
    | 'invoice_list'
    | 'deferred_breakdown'
    | 'customer_breakdown'
    | 'day_breakdown'
    | 'currency_breakdown'
    | 'month_breakdown';
  availableBreakdowns: readonly ('customer' | 'day' | 'invoice')[];
  /**
   * Collected metrics count partial payments as separate payment rows (ledger), not invoice face totals.
   */
  collections_include_partial?: boolean;
  /** Lets bare chips (e.g. “By invoice”) reuse the last period without re-parsing the user message. */
  paymentsWindow?: {
    startIso: string;
    endIso: string;
    timezone: string;
    label: string;
  };
  /**
   * When set, drill-downs (by invoice / by day / by customer) stay within these customers only.
   * Keys match `aggregateCollectedRevenueByCustomerInUtcWindow`: `id:<uuid>` or `name:<lowercase>`.
   */
  scoped_customer_group_keys?: string[];
  /** Origin of `scoped_customer_group_keys` (for UX / future routing). */
  report_parent_kind?: 'top_customers' | 'customer_breakdown';
  /**
   * Assistant asked a drill-down question and is waiting for a specific option
   * (e.g. "by invoice or by day"). Bare confirmations should clarify, not reroute.
   */
  pending_followup_choice?: {
    kind: 'drilldown_dimension';
    options: Array<'invoice' | 'day' | 'customer' | 'month' | 'currency'>;
    prompt: string;
  };
  active_query?: AssistantActiveQueryContext;
};

export const DEFAULT_REVENUE_BREAKDOWNS = ['customer', 'day', 'invoice'] as const;

const INTENT_OK: AssistantMetricSessionContext['currentIntent'][] = [
  'revenue_collected_total',
  'revenue_invoiced_total',
  'revenue_breakdown_by_invoice',
  'revenue_breakdown_by_customer',
  'revenue_breakdown_by_customer_deferred',
  'revenue_breakdown_by_day',
  'revenue_breakdown_by_day_deferred',
  'revenue_breakdown_by_currency',
  'revenue_breakdown_by_month',
];

const RESULT_OK: AssistantMetricSessionContext['currentResultType'][] = [
  'currency_summary',
  'invoice_list',
  'deferred_breakdown',
  'customer_breakdown',
  'day_breakdown',
  'currency_breakdown',
  'month_breakdown',
];

/** Validate JSON echoed from the client on the next assistant turn. */
export function coerceMetricSessionContextFromClient(raw: unknown): AssistantMetricSessionContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.currentMetric !== 'collected_revenue' && o.currentMetric !== 'invoiced_revenue') return null;
  if (typeof o.rangeLabel !== 'string' || typeof o.periodTitleSuffix !== 'string') return null;
  const ci = o.currentIntent;
  const cr = o.currentResultType;
  if (typeof ci !== 'string' || !INTENT_OK.includes(ci as AssistantMetricSessionContext['currentIntent'])) {
    return null;
  }
  if (typeof cr !== 'string' || !RESULT_OK.includes(cr as AssistantMetricSessionContext['currentResultType'])) {
    return null;
  }
  const pwRaw = o.paymentsWindow;
  let paymentsWindow: AssistantMetricSessionContext['paymentsWindow'];
  if (pwRaw && typeof pwRaw === 'object') {
    const p = pwRaw as Record<string, unknown>;
    if (
      typeof p.startIso === 'string' &&
      typeof p.endIso === 'string' &&
      typeof p.timezone === 'string' &&
      typeof p.label === 'string'
    ) {
      paymentsWindow = {
        startIso: p.startIso,
        endIso: p.endIso,
        timezone: p.timezone,
        label: p.label,
      };
    }
  }
  const bd = o.availableBreakdowns;
  const availableBreakdowns =
    Array.isArray(bd) && bd.every((x) => x === 'customer' || x === 'day' || x === 'invoice')
      ? (bd as ('customer' | 'day' | 'invoice')[])
      : [...DEFAULT_REVENUE_BREAKDOWNS];
  const collections_include_partial =
    o.collections_include_partial === true ? true : undefined;

  let scoped_customer_group_keys: string[] | undefined;
  const sk = o.scoped_customer_group_keys;
  if (Array.isArray(sk) && sk.length > 0) {
    const cleaned = sk
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => x.length > 0 && x.length < 240);
    if (cleaned.length) scoped_customer_group_keys = cleaned.slice(0, 25);
  }
  let report_parent_kind: AssistantMetricSessionContext['report_parent_kind'];
  if (o.report_parent_kind === 'top_customers' || o.report_parent_kind === 'customer_breakdown') {
    report_parent_kind = o.report_parent_kind;
  }
  let pending_followup_choice: AssistantMetricSessionContext['pending_followup_choice'];
  const pfc = o.pending_followup_choice;
  if (pfc && typeof pfc === 'object') {
    const p = pfc as Record<string, unknown>;
    if (p.kind === 'drilldown_dimension' && typeof p.prompt === 'string' && Array.isArray(p.options)) {
      const options = p.options
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x): x is 'invoice' | 'day' | 'customer' | 'month' | 'currency' =>
          x === 'invoice' || x === 'day' || x === 'customer' || x === 'month' || x === 'currency'
        );
      if (options.length > 0) {
        pending_followup_choice = {
          kind: 'drilldown_dimension',
          options: options.slice(0, 5),
          prompt: p.prompt,
        };
      }
    }
  }

  const aqRaw = o.active_query;
  let active_query: AssistantActiveQueryContext | undefined;
  if (aqRaw && typeof aqRaw === 'object') {
    const a = aqRaw as Record<string, unknown>;
    if (typeof a.intentFamily === 'string' && typeof a.businessObject === 'string') {
      const pwA = a.paymentsWindow;
      let paymentsWindowA: AssistantActiveQueryContext['paymentsWindow'];
      if (pwA && typeof pwA === 'object') {
        const p = pwA as Record<string, unknown>;
        if (
          typeof p.startIso === 'string' &&
          typeof p.endIso === 'string' &&
          typeof p.timezone === 'string' &&
          typeof p.label === 'string'
        ) {
          paymentsWindowA = {
            startIso: p.startIso,
            endIso: p.endIso,
            timezone: p.timezone,
            label: p.label,
          };
        }
      }
      active_query = {
        intentFamily: a.intentFamily,
        businessObject: a.businessObject,
        queryShape: typeof a.queryShape === 'string' ? a.queryShape : 'unknown',
        scope: typeof a.scope === 'string' ? a.scope : 'workspace',
        breakdownDimension: typeof a.breakdownDimension === 'string' ? a.breakdownDimension : undefined,
        invoiceStatusFilter: typeof a.invoiceStatusFilter === 'string' ? a.invoiceStatusFilter : undefined,
        includePartialPayments: a.includePartialPayments === true ? true : undefined,
        baseCurrencyCode: typeof a.baseCurrencyCode === 'string' ? a.baseCurrencyCode : undefined,
        rangeLabel: typeof a.rangeLabel === 'string' ? a.rangeLabel : undefined,
        periodTitleSuffix: typeof a.periodTitleSuffix === 'string' ? a.periodTitleSuffix : undefined,
        paymentsWindow: paymentsWindowA,
      };
    }
  }

  return {
    currentIntent: ci as AssistantMetricSessionContext['currentIntent'],
    currentMetric: o.currentMetric === 'invoiced_revenue' ? 'invoiced_revenue' : 'collected_revenue',
    rangeLabel: o.rangeLabel,
    periodTitleSuffix: o.periodTitleSuffix,
    currentResultType: cr as AssistantMetricSessionContext['currentResultType'],
    availableBreakdowns,
    collections_include_partial,
    paymentsWindow,
    ...(scoped_customer_group_keys ? { scoped_customer_group_keys } : {}),
    ...(report_parent_kind ? { report_parent_kind } : {}),
    ...(pending_followup_choice ? { pending_followup_choice } : {}),
    active_query,
  };
}

export function metricContextForRevenueWindow(
  w: ResolvedPaymentsTimeRange,
  rest: Pick<AssistantMetricSessionContext, 'currentIntent' | 'currentResultType'>,
  activeQuery?: AssistantActiveQueryContext | null,
  metric: 'collected_revenue' | 'invoiced_revenue' = 'collected_revenue'
): AssistantMetricSessionContext {
  const base: AssistantMetricSessionContext = {
    currentMetric: metric,
    availableBreakdowns: [...DEFAULT_REVENUE_BREAKDOWNS],
    rangeLabel: w.label,
    periodTitleSuffix: assistantAnalyticsPeriodTitleSuffix(w),
    collections_include_partial: true,
    paymentsWindow: {
      startIso: w.startIso,
      endIso: w.endIso,
      timezone: w.timezone,
      label: w.label,
    },
    ...rest,
  };
  if (activeQuery) {
    return {
      ...base,
      active_query: {
        ...activeQuery,
        rangeLabel: w.label,
        periodTitleSuffix: base.periodTitleSuffix,
        paymentsWindow: base.paymentsWindow,
        includePartialPayments: activeQuery.includePartialPayments ?? true,
      },
    };
  }
  return base;
}
