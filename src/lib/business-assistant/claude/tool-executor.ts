import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PaymentsNaturalRangeSpec,
  ResolvedPaymentsTimeRange,
} from '@/lib/analytics/payments-received-time-range';
import { resolvePaymentsReceivedTimeRange } from '@/lib/analytics/payments-received-time-range';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { parseInvoiceReferenceFromText } from '@/lib/invoices/invoice-reference';
import { findCustomerRecordsByName } from '@/lib/business-assistant/assistant-customer-find';
import {
  findInvoicesByReference,
  type InvoiceLookupRow,
} from '@/lib/invoices/resolve-invoices-by-reference';
import {
  aggregateOverdueInvoices,
  aggregateUnpaidBalancesByCurrency,
  countInvoicesIssuedInIssueDateRange,
  countPartiallyPaidInvoices,
  formatFinancialMoney,
  issueDateYmdBoundsFromPaymentsWindow,
  resolvedPaymentsWindowToPaidUtc,
} from '@/lib/business-assistant/financial-metric-queries';
import {
  aggregateCollectedRevenueByCalendarMonthInUtcWindow,
  aggregateCollectedRevenueByCustomerInUtcWindow,
  aggregateCollectedRevenueByDayInUtcWindow,
  fetchCollectedInvoicesBreakdownInUtcWindow,
  fetchPaidInvoicesInUtcWindow,
} from '@/lib/invoices/assistant-invoice-queries';
import { metricContextForRevenueWindow } from '@/lib/business-assistant/metric-session-context';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import {
  collectedByCurrencyRowsForTool,
  collectedMetricFetchStartIso,
  dashboardPresetForRevenueSpec,
  loadCollectedRevenueMetricForBusiness,
} from '@/lib/payments/collected-revenue-metric';
import type { AssistantActiveContextV1 } from '@/lib/business-assistant/claude/assistant-active-context';
import type { BusinessRole } from '@/lib/rbac/types';

const SCAN = 3000;

export type BusinessAssistantToolExecutorContext = {
  supabase: SupabaseClient;
  businessId: string;
  reportingCurrency: string;
  workspaceTimezone: string | null;
  role: BusinessRole;
  now: Date;
  /** Mutable outputs */
  metricSessionContext: AssistantMetricSessionContext | null;
  assistantActiveContext: AssistantActiveContextV1 | null;
  /** Tool names invoked this turn (order preserved) — for deterministic response meta. */
  toolTrace: string[];
  /** Last `find_invoice` matches this turn (for client invoice cards). */
  findInvoiceLookupMatches: InvoiceLookupRow[] | null;
};

function jsonErr(message: string, detail?: unknown) {
  return JSON.stringify({ ok: false, error: message, detail: detail ?? undefined });
}

function jsonOk(data: Record<string, unknown>) {
  return JSON.stringify({ ok: true, ...data });
}

export function periodKeyToSpec(
  period_key: string,
  start_date: string | null | undefined,
  end_date: string | null | undefined
): PaymentsNaturalRangeSpec | null {
  const k = String(period_key || '').toLowerCase();
  const map: Record<string, PaymentsNaturalRangeSpec> = {
    today: { kind: 'today' },
    yesterday: { kind: 'yesterday' },
    this_week: { kind: 'this_week' },
    last_week: { kind: 'last_week' },
    this_month: { kind: 'this_month' },
    last_month: { kind: 'last_month' },
    last_7_days: { kind: 'rolling_days', days: 7 },
    last_14_days: { kind: 'rolling_days', days: 14 },
    last_30_days: { kind: 'rolling_days', days: 30 },
    last_90_days: { kind: 'rolling_days', days: 90 },
  };
  if (k === 'custom' && start_date && end_date) {
    return { kind: 'explicit_calendar_range', start: start_date, end: end_date };
  }
  return map[k] ?? null;
}

function resolveWindow(
  spec: PaymentsNaturalRangeSpec | null,
  tz: string | null,
  now: Date
): ResolvedPaymentsTimeRange {
  if (!spec) throw new Error('missing_period');
  const r = resolvePaymentsReceivedTimeRange(spec, now, tz);
  if (!r.ok) throw new Error(r.error ?? 'bad_range');
  return r.value;
}

async function collectedSummaryForWindow(
  ctx: BusinessAssistantToolExecutorContext,
  spec: PaymentsNaturalRangeSpec,
  period_key: string
) {
  const window = resolveWindow(spec, ctx.workspaceTimezone, ctx.now);
  const tz = ctx.workspaceTimezone ?? null;
  const fetchStartIso = collectedMetricFetchStartIso(spec, tz, ctx.now);
  const collected = await loadCollectedRevenueMetricForBusiness(
    ctx.supabase,
    ctx.businessId,
    ctx.reportingCurrency,
    {
      fetchStartIso,
      paymentsWindow: window,
      surface: 'assistant',
      timezone: tz,
      dashboardPreset: dashboardPresetForRevenueSpec(spec),
    }
  );
  if ('error' in collected) {
    return jsonErr('load_collected_failed', collected.error);
  }
  const utc = resolvedPaymentsWindowToPaidUtc(window);
  ctx.metricSessionContext = metricContextForRevenueWindow(window, {
    currentIntent: 'revenue_collected_total',
    currentResultType: 'currency_summary',
  });
  ctx.assistantActiveContext = {
    current_intent_family: 'metric_query',
    active_metric_context: {
      metric: 'collected_from_invoices',
      period_key,
      scope: 'all',
      include_partial_payments: true,
      base_currency: ctx.reportingCurrency,
      payments_window: {
        start_iso: utc.startIso,
        end_iso: utc.endIso,
        timezone: utc.timezone,
        label: utc.label,
      },
    },
  };
  return jsonOk({
    metric: 'collected_from_invoices',
    base_currency: ctx.reportingCurrency,
    base_currency_total: collected.totalBase,
    total_base: collected.totalBase,
    human_range: window.humanRange,
    label: window.label,
    by_currency: collectedByCurrencyRowsForTool(collected.byCurrency, ctx.reportingCurrency),
    disclaimer:
      'Includes full and partial payments (received amounts only). Each by_currency row includes breakdown_line — copy those strings verbatim for "Breakdown by currency:" (do not reformat or round). Numeric fields original_amount and base_currency_equivalent are authoritative; amount and amount_in_base mirror them.',
  });
}

export async function executeBusinessAssistantTool(
  ctx: BusinessAssistantToolExecutorContext,
  name: string,
  input: unknown
): Promise<string> {
  ctx.toolTrace.push(name);
  try {
    switch (name) {
      case 'get_metric_summary':
        return await toolGetMetricSummary(ctx, input);
      case 'get_metric_breakdown':
        return await toolGetMetricBreakdown(ctx, input);
      case 'find_invoice':
        return await toolFindInvoice(ctx, input);
      case 'find_customer':
        return await toolFindCustomer(ctx, input);
      case 'list_invoices':
        return await toolListInvoices(ctx, input);
      case 'create_invoice_draft':
        return jsonOk({
          delegate: 'invoice_wizard',
          message:
            'Guide the user to describe the customer and line items in chat; the invoice composer will capture details on the next messages.',
        });
      case 'update_invoice_draft':
        return jsonOk({
          delegate: 'invoice_wizard',
          message: 'Acknowledge the change and ask for any missing invoice fields in plain language.',
        });
      case 'create_customer':
        return jsonOk({
          delegate: 'customers',
          message: 'Ask for customer name and email, then direct them to Customers to add, or continue in invoice flow.',
        });
      default:
        return jsonErr('unknown_tool', name);
    }
  } catch (e) {
    console.error('[business-assistant-tool]', name, e);
    return jsonErr('tool_failed', e instanceof Error ? e.message : 'error');
  }
}

async function toolGetMetricSummary(ctx: BusinessAssistantToolExecutorContext, input: unknown): Promise<string> {
  const o = input as Record<string, unknown>;
  const metric = String(o.metric ?? '');
  const period_key = String(o.period_key ?? 'this_month');
  const scope = String(o.scope ?? 'all');
  const customer_id = o.customer_id != null ? String(o.customer_id) : null;
  const start_date = o.start_date != null ? String(o.start_date) : null;
  const end_date = o.end_date != null ? String(o.end_date) : null;

  if (metric === 'partially_paid_invoice_count') {
    const n = await countPartiallyPaidInvoices(ctx.supabase, ctx.businessId);
    ctx.assistantActiveContext = {
      current_intent_family: 'metric_query',
      active_metric_context: {
        metric: 'partially_paid_invoice_count',
        period_key: 'all',
        scope: 'all',
        base_currency: ctx.reportingCurrency,
      },
    };
    return jsonOk({ metric, count: n });
  }

  if (metric === 'unpaid_total') {
    const rows = await aggregateUnpaidBalancesByCurrency(ctx.supabase, ctx.businessId);
    return jsonOk({
      metric,
      by_currency: rows,
      note: 'Open balances (not collected KPI).',
    });
  }

  if (metric === 'overdue_total' || metric === 'overdue_invoice_count') {
    const { byCurrency, invoiceCount } = await aggregateOverdueInvoices(ctx.supabase, ctx.businessId);
    if (metric === 'overdue_invoice_count') {
      return jsonOk({ metric, count: invoiceCount });
    }
    return jsonOk({ metric, by_currency: byCurrency, invoice_count: invoiceCount });
  }

  if (metric === 'invoice_count') {
    const spec = periodKeyToSpec(period_key, start_date, end_date);
    if (!spec) return jsonErr('invalid_period');
    const window = resolveWindow(spec, ctx.workspaceTimezone, ctx.now);
    const { fromYmd, toYmd } = issueDateYmdBoundsFromPaymentsWindow(window);
    const n = await countInvoicesIssuedInIssueDateRange(ctx.supabase, ctx.businessId, fromYmd, toYmd);
    return jsonOk({ metric, count: n, issue_date_range: { fromYmd, toYmd }, human_range: window.humanRange });
  }

  if (metric === 'paid_invoice_count') {
    const spec = periodKeyToSpec(period_key, start_date, end_date);
    if (!spec) return jsonErr('invalid_period');
    const window = resolveWindow(spec, ctx.workspaceTimezone, ctx.now);
    const utc = resolvedPaymentsWindowToPaidUtc(window);
    const paid = await fetchPaidInvoicesInUtcWindow(
      ctx.supabase,
      ctx.businessId,
      utc,
      500,
      ctx.reportingCurrency
    );
    return jsonOk({
      metric,
      count: paid.length,
      human_range: window.humanRange,
    });
  }

  if (metric === 'collected_from_invoices') {
    const spec = periodKeyToSpec(period_key, start_date, end_date);
    if (!spec) return jsonErr('invalid_period');
    if (scope === 'customer' && customer_id) {
      const window = resolveWindow(spec, ctx.workspaceTimezone, ctx.now);
      const utc = resolvedPaymentsWindowToPaidUtc(window);
      const rows = await aggregateCollectedRevenueByCustomerInUtcWindow(
        ctx.supabase,
        ctx.businessId,
        utc,
        ctx.reportingCurrency
      );
      const subset = rows.filter((r) => r.groupKey === customer_id);
      if (subset.length === 0) {
        return jsonOk({
          metric,
          total_base: 0,
          base_currency: ctx.reportingCurrency,
          human_range: window.humanRange,
          note: 'No collections for that customer in this window.',
        });
      }
      ctx.assistantActiveContext = {
        current_intent_family: 'metric_query',
        active_metric_context: {
          metric: 'collected_from_invoices',
          period_key,
          scope: 'customer',
          customer_id,
          include_partial_payments: true,
          base_currency: ctx.reportingCurrency,
          payments_window: {
            start_iso: utc.startIso,
            end_iso: utc.endIso,
            timezone: utc.timezone,
            label: utc.label,
          },
        },
      };
      return jsonOk({
        metric,
        customer_label: subset[0]?.customerLabel,
        by_currency: subset.map((r) => ({
          currency: r.currency,
          total_collected: r.totalCollected,
        })),
        human_range: window.humanRange,
      });
    }
    return await collectedSummaryForWindow(ctx, spec, period_key);
  }

  return jsonErr('unsupported_metric', metric);
}

async function toolGetMetricBreakdown(ctx: BusinessAssistantToolExecutorContext, input: unknown): Promise<string> {
  const o = input as Record<string, unknown>;
  const period_key = String(o.period_key ?? 'this_month');
  const start_date = o.start_date != null ? String(o.start_date) : null;
  const end_date = o.end_date != null ? String(o.end_date) : null;
  const dimension = String(o.breakdown_dimension ?? 'customer');
  const spec = periodKeyToSpec(period_key, start_date, end_date);
  if (!spec) return jsonErr('invalid_period');
  const window = resolveWindow(spec, ctx.workspaceTimezone, ctx.now);
  const utc = resolvedPaymentsWindowToPaidUtc(window);

  ctx.assistantActiveContext = {
    current_intent_family: 'record_breakdown',
    active_metric_context: {
      metric: 'collected_from_invoices',
      period_key,
      scope: 'all',
      include_partial_payments: true,
      base_currency: ctx.reportingCurrency,
      breakdown_dimension: dimension,
      payments_window: {
        start_iso: utc.startIso,
        end_iso: utc.endIso,
        timezone: utc.timezone,
        label: utc.label,
      },
    },
  };

  if (dimension === 'customer') {
    const rows = await aggregateCollectedRevenueByCustomerInUtcWindow(
      ctx.supabase,
      ctx.businessId,
      utc,
      ctx.reportingCurrency
    );
    ctx.metricSessionContext = metricContextForRevenueWindow(window, {
      currentIntent: 'revenue_breakdown_by_customer',
      currentResultType: 'customer_breakdown',
    });
    return jsonOk({
      dimension: 'customer',
      human_range: window.humanRange,
      rows: rows.map((r) => ({
        label: r.customerLabel,
        currency: r.currency,
        total: r.totalCollected,
      })),
    });
  }
  if (dimension === 'day') {
    const rows = await aggregateCollectedRevenueByDayInUtcWindow(
      ctx.supabase,
      ctx.businessId,
      utc,
      ctx.reportingCurrency
    );
    ctx.metricSessionContext = metricContextForRevenueWindow(window, {
      currentIntent: 'revenue_breakdown_by_day',
      currentResultType: 'day_breakdown',
    });
    return jsonOk({
      dimension: 'day',
      human_range: window.humanRange,
      rows: rows.map((r) => ({
        day: r.dayYmd,
        currency: r.currency,
        total: r.totalCollected,
      })),
    });
  }
  if (dimension === 'month') {
    const rows = await aggregateCollectedRevenueByCalendarMonthInUtcWindow(
      ctx.supabase,
      ctx.businessId,
      utc,
      ctx.reportingCurrency
    );
    ctx.metricSessionContext = metricContextForRevenueWindow(window, {
      currentIntent: 'revenue_breakdown_by_month',
      currentResultType: 'month_breakdown',
    });
    return jsonOk({
      dimension: 'month',
      human_range: window.humanRange,
      rows: rows.map((r) => ({
        month: r.monthYmd,
        currency: r.currency,
        total: r.totalCollected,
      })),
    });
  }
  if (dimension === 'currency') {
    const collected = await loadCollectedRevenueMetricForBusiness(
      ctx.supabase,
      ctx.businessId,
      ctx.reportingCurrency,
      {
        fetchStartIso: collectedMetricFetchStartIso(spec, ctx.workspaceTimezone ?? null, ctx.now),
        paymentsWindow: window,
        surface: 'assistant',
        timezone: ctx.workspaceTimezone ?? null,
        dashboardPreset: dashboardPresetForRevenueSpec(spec),
      }
    );
    if ('error' in collected) return jsonErr('load_collected_failed', collected.error);
    ctx.metricSessionContext = metricContextForRevenueWindow(window, {
      currentIntent: 'revenue_breakdown_by_currency',
      currentResultType: 'currency_breakdown',
    });
    return jsonOk({
      dimension: 'currency',
      human_range: window.humanRange,
      base_currency: ctx.reportingCurrency,
      base_currency_total: collected.totalBase,
      total_base: collected.totalBase,
      by_currency: collectedByCurrencyRowsForTool(collected.byCurrency, ctx.reportingCurrency),
      note: 'For each by_currency row, print breakdown_line verbatim under "Breakdown by currency:" (do not round or recompute FX).',
    });
  }
  if (dimension === 'invoice') {
    const rows = await fetchCollectedInvoicesBreakdownInUtcWindow(
      ctx.supabase,
      ctx.businessId,
      utc,
      ctx.reportingCurrency,
      60
    );
    ctx.metricSessionContext = metricContextForRevenueWindow(window, {
      currentIntent: 'revenue_breakdown_by_invoice',
      currentResultType: 'invoice_list',
    });
    return jsonOk({
      dimension: 'invoice',
      human_range: window.humanRange,
      total_base: rows.reduce((s, r) => s + (r.receivedInBase ?? 0), 0),
      base_currency: ctx.reportingCurrency,
      invoice_count: rows.length,
      rows: rows.map((r) => {
        const native =
          r.receivedByCurrency.length === 1
            ? formatFinancialMoney(r.receivedByCurrency[0].amount, r.receivedByCurrency[0].currency)
            : r.receivedByCurrency.map((x) => formatFinancialMoney(x.amount, x.currency)).join(' + ');
        return {
          invoice_number: r.invoice_number,
          customer_name: r.customer_name,
          received: native,
          base_equivalent:
            r.receivedInBase != null
              ? formatFinancialMoney(r.receivedInBase, ctx.reportingCurrency)
              : null,
          paid_at: r.paid_at,
        };
      }),
    });
  }

  return jsonErr('unsupported_dimension', dimension);
}

async function toolFindInvoice(ctx: BusinessAssistantToolExecutorContext, input: unknown): Promise<string> {
  const ref = String((input as { invoice_reference?: string }).invoice_reference ?? '').trim();
  if (!ref) return jsonErr('missing_reference');
  const parsed = parseInvoiceReferenceFromText(ref);
  if (!parsed) return jsonErr('could_not_parse_reference');
  const matches = await findInvoicesByReference(ctx.supabase, ctx.businessId, parsed, { limit: 500 });
  ctx.findInvoiceLookupMatches = matches.length > 0 ? matches : null;
  if (matches.length === 0) return jsonOk({ found: false });
  const row = matches[0]!;
  ctx.assistantActiveContext = {
    current_intent_family: 'record_lookup',
    active_metric_context: null,
  };
  return jsonOk({
    found: true,
    match_count: matches.length,
    invoice_id: row.id,
    invoice_number: row.invoice_number,
    customer_name: row.customer_name,
    total: row.total,
    currency: row.currency,
    status: row.status,
    note:
      matches.length > 1
        ? 'Multiple invoices match; the client shows a picker. Ask the user to choose if needed.'
        : undefined,
  });
}

async function toolFindCustomer(ctx: BusinessAssistantToolExecutorContext, input: unknown): Promise<string> {
  const name = String((input as { name?: string }).name ?? '').trim();
  if (!name) return jsonErr('missing_name');
  const { rows } = await findCustomerRecordsByName(ctx.supabase, ctx.businessId, name);
  if (rows.length === 0) {
    return jsonOk({ found: false, matches: [] });
  }
  return jsonOk({
    found: true,
    match_count: rows.length,
    matches: rows.map((r) => ({
      customer_id: r.id,
      display_name: r.display_name,
      email: r.email,
    })),
    note:
      rows.length > 1
        ? 'Several customers match; list them and ask the user to pick, or use dashboard Customers.'
        : undefined,
  });
}

async function toolListInvoices(ctx: BusinessAssistantToolExecutorContext, input: unknown): Promise<string> {
  const o = input as Record<string, unknown>;
  const statusFilter =
    o.status != null && String(o.status).trim() !== '' ? String(o.status).trim() : null;
  const period_key = o.period_key != null ? String(o.period_key) : 'this_month';
  const start_date = o.start_date != null ? String(o.start_date) : null;
  const end_date = o.end_date != null ? String(o.end_date) : null;
  const limit = Math.min(50, Math.max(1, Number(o.limit ?? 25) || 25));
  const customer_id = o.customer_id != null ? String(o.customer_id) : null;

  if (statusFilter === 'paid' && period_key && period_key !== 'custom') {
    const spec = periodKeyToSpec(period_key, start_date, end_date);
    if (spec) {
      const window = resolveWindow(spec, ctx.workspaceTimezone, ctx.now);
      const utc = resolvedPaymentsWindowToPaidUtc(window);
      const paid = await fetchPaidInvoicesInUtcWindow(
        ctx.supabase,
        ctx.businessId,
        utc,
        limit,
        ctx.reportingCurrency
      );
      return jsonOk({
        status: 'paid',
        human_range: window.humanRange,
        count: paid.length,
        rows: paid.map((p) => ({
          invoice_number: p.invoice_number,
          customer_name: p.customer_name,
          total: p.total,
          currency: p.currency,
          paid_at: p.paid_at,
        })),
      });
    }
  }

  const { data, error } = await ctx.supabase
    .from('invoices')
    .select('id, invoice_number, customer_name, total, currency, status, amount_paid, balance_due, customer_id')
    .eq('business_id', ctx.businessId)
    .limit(SCAN);
  if (error) return jsonErr('query_failed', error.message);

  let rows = (data ?? []) as Record<string, unknown>[];
  if (customer_id) {
    rows = rows.filter((r) => String(r.customer_id ?? '') === customer_id);
  }
  if (statusFilter) {
    rows = rows.filter((r) => {
      const bd = resolveInvoiceBalanceDue({
        status: String(r.status ?? ''),
        total: Number(r.total ?? 0),
        amount_paid: Number(r.amount_paid ?? 0),
      });
      const st = deriveInvoiceStatus({
        status: String(r.status ?? ''),
        total: Number(r.total ?? 0),
        amount_paid: Number(r.amount_paid ?? 0),
        balance_due: bd,
      }).toLowerCase();
      return st === statusFilter;
    });
  }

  return jsonOk({
    status: statusFilter ?? 'any',
    count: Math.min(rows.length, limit),
    rows: rows.slice(0, limit).map((r) => {
      const total = Number(r.total ?? 0);
      const amountPaid = Math.max(0, Number(r.amount_paid ?? 0));
      const balanceRemaining = resolveInvoiceBalanceDue({
        status: String(r.status ?? ''),
        total,
        amount_paid: amountPaid,
      });
      const derived = deriveInvoiceStatus({
        status: String(r.status ?? ''),
        total,
        amount_paid: amountPaid,
        balance_due: balanceRemaining,
      });
      return {
        id: String(r.id),
        invoice_number: r.invoice_number,
        customer_name: r.customer_name,
        currency: r.currency,
        invoice_total: total,
        total,
        amount_paid: amountPaid,
        balance_remaining: balanceRemaining,
        status: derived,
      };
    }),
  });
}
