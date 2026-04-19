import type { ResolvedPaymentsTimeRange } from '@/lib/analytics/payments-received-time-range';
import { buildWizardShellResponse } from '@/lib/business-assistant/wizard-shell';
import type { AssistantRouterContext } from '@/lib/business-assistant/router-context';
import {
  financialDefaultPromptBody,
  financialLoadErrorBody,
  financialRangeUnresolvedBody,
  invoicesIssuedBody,
  invoicedRevenueWithCollectedContextStructured,
  openBalanceEmptyBody,
  openBalanceWithCardBody,
  overdueCountBody,
  overdueEmptyBody,
  partiallyPaidInvoiceCountBody,
  partiallyPaidInvoicesDetailStructured,
  overdueWithCardBody,
  revenueByCustomerProgressiveQuickReplies,
  REVENUE_BY_CUSTOMER_FOLLOW_UP,
  revenueByDayProgressiveQuickReplies,
  REVENUE_BY_DAY_FOLLOW_UP,
  REVENUE_BY_INVOICE_FOLLOW_UP,
  revenueCollectedSummaryStructured,
  revenueCollectedZeroBody,
  revenueFollowUpNeedsPeriodBody,
  formatFinancialPeriodLine,
  revenueAfterInvoiceBreakdownQuickReplies,
  revenuePeriodInvoiceListPrompt,
  revenueProgressiveQuickReplies,
} from '@/lib/business-assistant/financial-assistant-copy';
import { assistantBoldLine } from '@/lib/assistant/assistant-bold-line';
import { snapshotActiveQueryFromStructured } from '@/lib/business-assistant/assistant-structured-intent';
import { roundMoney2 } from '@/lib/currency/amounts-in-base';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import { metricContextForRevenueWindow } from '@/lib/business-assistant/metric-session-context';
import { resolveFinancialMetricIntent } from '@/lib/business-assistant/financial-metric-resolve';
import {
  assistantAnalyticsPeriodTitleSuffix,
  assistantRevenueScopePhraseForMessage,
  resolveFinancialDateRangeFromUserText,
  tryResolveFinancialDateRangeFromUserText,
} from '@/lib/business-assistant/financial-date-range-resolver';
import {
  aggregateOverdueInvoices,
  aggregateUnpaidBalancesByCurrency,
  countInvoicesIssuedInIssueDateRange,
  sumInvoicedRevenueInIssueDateRange,
  countPartiallyPaidInvoices,
  fetchPartiallyPaidInvoicesDetail,
  formatFinancialMoney,
  issueDateYmdBoundsFromPaymentsWindow,
  listTopIssuedInvoicesInIssueDateRange,
  metricSessionPaymentsWindowToPaidUtc,
  paidUtcToResolvedPaymentsShape,
  resolvedPaymentsWindowToPaidUtc,
} from '@/lib/business-assistant/financial-metric-queries';
import {
  tryParseRevenueMetricFollowUpIntent,
  type RevenueMetricFollowUpIntent,
} from '@/lib/business-assistant/revenue-metric-follow-up';
import {
  aggregateCollectedRevenueByCalendarMonthInUtcWindow,
  aggregateCollectedRevenueByCustomerInUtcWindow,
  aggregateCollectedRevenueByDayInUtcWindow,
  type CollectedRevenueByCalendarMonthRow,
  type CollectedRevenueByDayRow,
  aggregatePaidInUtcWindow,
  customerGroupKeySetForScope,
  fetchCollectedInvoicesBreakdownInUtcWindow,
  formatCollectedRevenueDayLabel,
  formatCollectedRevenueMonthLabel,
} from '@/lib/invoices/assistant-invoice-queries';
import type { AssistantPaidUtcWindow } from '@/lib/invoices/assistant-invoice-paid-bounds';
import type {
  InvoiceAssistantChatCard,
  InvoiceWizardResponse,
} from '@/lib/invoices/conversational-invoice-wizard/types';
import {
  collectedMetricFetchStartIso,
  dashboardPresetForRevenueSpec,
  loadCollectedRevenueMetricForBusiness,
} from '@/lib/payments/collected-revenue-metric';

function shell(ctx: AssistantRouterContext) {
  return {
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    pending_invoice_lookup: null,
  };
}

function metricCtxWithStructured(
  ctx: AssistantRouterContext,
  w: ResolvedPaymentsTimeRange,
  rest: Pick<AssistantMetricSessionContext, 'currentIntent' | 'currentResultType'>,
  revenueMetric: 'collected_revenue' | 'invoiced_revenue' = 'collected_revenue'
) {
  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, {
          baseCurrencyCode: ctx.reportingCurrency,
        })
      : undefined;
  return metricContextForRevenueWindow(w, rest, aq, revenueMetric);
}

/** Keep top-customer (or other) scope across invoice/day/customer drill-downs. */
function carryScopedParentMetricSession(
  ctx: AssistantRouterContext,
  built: AssistantMetricSessionContext
): AssistantMetricSessionContext {
  const keys = ctx.metricSessionContext?.scoped_customer_group_keys;
  const kind = ctx.metricSessionContext?.report_parent_kind;
  if (!keys?.length) return built;
  return {
    ...built,
    scoped_customer_group_keys: keys,
    ...(kind ? { report_parent_kind: kind } : {}),
  };
}

type DrilldownOption = 'invoice' | 'day' | 'customer' | 'month' | 'currency';

function withPendingDrilldownChoice(
  metricCtx: AssistantMetricSessionContext,
  prompt: string,
  options: DrilldownOption[]
): AssistantMetricSessionContext {
  return {
    ...metricCtx,
    pending_followup_choice: {
      kind: 'drilldown_dimension',
      prompt,
      options,
    },
  };
}

function buildDrilldownChoiceQuickReplies(
  metricCtx: AssistantMetricSessionContext | null | undefined
): { label: string; message: string }[] {
  const pending = metricCtx?.pending_followup_choice;
  if (!pending || pending.kind !== 'drilldown_dimension') return [];
  const pseudo =
    metricCtx?.paymentsWindow &&
    metricCtx.paymentsWindow.startIso &&
    metricCtx.paymentsWindow.endIso &&
    metricCtx.paymentsWindow.timezone &&
    metricCtx.paymentsWindow.label
      ? paidUtcToResolvedPaymentsShape(metricSessionPaymentsWindowToPaidUtc(metricCtx.paymentsWindow))
      : null;
  const scope = pseudo ? assistantRevenueScopePhraseForMessage(pseudo) : 'this period';
  const out: { label: string; message: string }[] = [];
  for (const opt of pending.options) {
    if (opt === 'invoice') {
      out.push({
        label: 'By invoice',
        message: pseudo ? revenuePeriodInvoiceListPrompt(pseudo) : 'Break down revenue by invoice for this period',
      });
    }
    if (opt === 'day') out.push({ label: 'By day', message: `Break down revenue by day for ${scope}` });
    if (opt === 'customer') out.push({ label: 'By customer', message: `Break down revenue by customer for ${scope}` });
    if (opt === 'month')
      out.push({
        label: 'By month',
        message: `Break down collected revenue by calendar month for ${scope}`,
      });
    if (opt === 'currency')
      out.push({
        label: 'By currency',
        message: `Show collected amounts by currency for ${scope}`,
      });
  }
  return out.slice(0, 4);
}

function clearPendingFollowupChoice(
  metricCtx: AssistantMetricSessionContext | null | undefined
): AssistantMetricSessionContext | null {
  if (!metricCtx) return null;
  const next: AssistantMetricSessionContext = { ...metricCtx };
  delete next.pending_followup_choice;
  return next;
}

function resolveRevenuePaymentsWindowFromContext(
  ctx: AssistantRouterContext,
  userText: string,
  tz: string | null,
  now: Date
) {
  const explicit = tryResolveFinancialDateRangeFromUserText(userText, tz, now);
  if (explicit) return explicit;
  const pw = ctx.metricSessionContext?.paymentsWindow;
  if (pw?.startIso && pw.endIso && pw.timezone && pw.label) {
    return paidUtcToResolvedPaymentsShape(metricSessionPaymentsWindowToPaidUtc(pw));
  }
  // Never default to this_month here — that breaks follow-ups when context was missing; callers surface range-unresolved instead.
  return null;
}

async function buildRevenueCustomerBreakdownResponse(
  ctx: AssistantRouterContext,
  utc: AssistantPaidUtcWindow
): Promise<InvoiceWizardResponse> {
  const scopeSet = customerGroupKeySetForScope(ctx.metricSessionContext?.scoped_customer_group_keys);
  let rows = await aggregateCollectedRevenueByCustomerInUtcWindow(
    ctx.supabase,
    ctx.businessId,
    utc,
    ctx.reportingCurrency
  );
  if (scopeSet) {
    rows = rows.filter((r) => scopeSet.has(r.groupKey));
  }
  const pseudo = paidUtcToResolvedPaymentsShape(utc);
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(utc.startIso, utc.endIso, utc.timezone);
  const metricCtx = carryScopedParentMetricSession(
    ctx,
    withPendingDrilldownChoice(
      metricCtxWithStructured(ctx, pseudo, {
        currentIntent: 'revenue_breakdown_by_customer',
        currentResultType: 'customer_breakdown',
      }),
      'would you like it by invoice or by day?',
      ['invoice', 'day']
    )
  );

  if (rows.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Collected by customer (${titleSuffix})`),
        lines: [
          'No collected revenue in this period (by payment time).',
          assistantBoldLine(periodLine),
          REVENUE_BY_CUSTOMER_FOLLOW_UP,
        ],
      },
      chat_cards: null,
      quick_replies: revenueByCustomerProgressiveQuickReplies(pseudo),
      metric_session_context: metricCtx,
    });
  }

  const lines: string[] = [];
  for (const r of rows) {
    lines.push(assistantBoldLine(r.customerLabel));
    lines.push(assistantBoldLine(formatFinancialMoney(r.totalCollected, r.currency)));
  }

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Collected by customer (${titleSuffix})`),
      lines: [...lines, assistantBoldLine(periodLine), REVENUE_BY_CUSTOMER_FOLLOW_UP],
    },
    chat_cards: null,
    quick_replies: revenueByCustomerProgressiveQuickReplies(pseudo),
    metric_session_context: metricCtx,
  });
}

async function buildRevenueDayBreakdownResponse(
  ctx: AssistantRouterContext,
  utc: AssistantPaidUtcWindow
): Promise<InvoiceWizardResponse> {
  const scopeKeys = ctx.metricSessionContext?.scoped_customer_group_keys;
  const rows = await aggregateCollectedRevenueByDayInUtcWindow(
    ctx.supabase,
    ctx.businessId,
    utc,
    ctx.reportingCurrency,
    scopeKeys?.length ? scopeKeys : null
  );
  const pseudo = paidUtcToResolvedPaymentsShape(utc);
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(utc.startIso, utc.endIso, utc.timezone);
  const metricCtx = carryScopedParentMetricSession(
    ctx,
    withPendingDrilldownChoice(
      metricCtxWithStructured(ctx, pseudo, {
        currentIntent: 'revenue_breakdown_by_day',
        currentResultType: 'day_breakdown',
      }),
      'would you like it by customer or by invoice?',
      ['customer', 'invoice']
    )
  );

  if (rows.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Collected by day (${titleSuffix})`),
        lines: [
          'No collected revenue in this period (by payment time).',
          assistantBoldLine(periodLine),
          REVENUE_BY_DAY_FOLLOW_UP,
        ],
      },
      chat_cards: null,
      quick_replies: revenueByDayProgressiveQuickReplies(pseudo),
      metric_session_context: metricCtx,
    });
  }

  const byYmd = new Map<string, CollectedRevenueByDayRow[]>();
  for (const r of rows) {
    const arr = byYmd.get(r.dayYmd) ?? [];
    arr.push(r);
    byYmd.set(r.dayYmd, arr);
  }
  const ymds = Array.from(byYmd.keys()).sort();
  const lines: string[] = [];
  for (const ymd of ymds) {
    const dayRows = byYmd.get(ymd)!;
    const dayLabel = formatCollectedRevenueDayLabel(ymd, utc.timezone);
    lines.push(assistantBoldLine(dayLabel));
    for (const r of dayRows) {
      lines.push(assistantBoldLine(formatFinancialMoney(r.totalCollected, r.currency)));
    }
  }

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Collected by day (${titleSuffix})`),
      lines: [...lines, assistantBoldLine(periodLine), REVENUE_BY_DAY_FOLLOW_UP],
    },
    chat_cards: null,
    quick_replies: revenueByDayProgressiveQuickReplies(pseudo),
    metric_session_context: metricCtx,
  });
}

async function buildRevenueInvoiceBreakdownResponse(
  ctx: AssistantRouterContext,
  utc: AssistantPaidUtcWindow
): Promise<InvoiceWizardResponse> {
  const base = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const scopeKeys = ctx.metricSessionContext?.scoped_customer_group_keys;
  const rows = await fetchCollectedInvoicesBreakdownInUtcWindow(
    ctx.supabase,
    ctx.businessId,
    utc,
    base,
    40,
    scopeKeys?.length ? { customerGroupKeys: scopeKeys } : undefined
  );
  const pseudo = paidUtcToResolvedPaymentsShape(utc);
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(utc.startIso, utc.endIso, utc.timezone);

  let summaryMoney: string | null = null;
  if (scopeKeys?.length) {
    let sumBase = 0;
    let baseKnown = true;
    for (const r of rows) {
      if (r.receivedInBase == null) baseKnown = false;
      else sumBase += r.receivedInBase;
    }
    if (baseKnown && sumBase > 0.00001) {
      summaryMoney = formatFinancialMoney(roundMoney2(sumBase), base);
    }
  } else {
    const agg = await aggregatePaidInUtcWindow(ctx.supabase, ctx.businessId, utc, base);
    summaryMoney =
      agg.totalCollectedInBase != null && agg.totalCollectedInBase > 0
        ? formatFinancialMoney(agg.totalCollectedInBase, base)
        : null;
  }

  const metricCtx = carryScopedParentMetricSession(
    ctx,
    withPendingDrilldownChoice(
      metricCtxWithStructured(ctx, pseudo, {
        currentIntent: 'revenue_breakdown_by_invoice',
        currentResultType: 'invoice_list',
      }),
      'would you like the same period by customer, by calendar month, or by currency?',
      ['customer', 'month', 'currency']
    )
  );

  if (rows.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Collected by invoice (${titleSuffix})`),
        lines: [
          scopeKeys?.length
            ? 'No invoices with collections for those customers in this period (by payment time).'
            : 'No payment activity in this period (by payment time).',
          assistantBoldLine(periodLine),
          REVENUE_BY_INVOICE_FOLLOW_UP,
        ],
      },
      chat_cards: null,
      quick_replies: revenueAfterInvoiceBreakdownQuickReplies(pseudo),
      metric_session_context: metricCtx,
    });
  }

  const card: InvoiceAssistantChatCard = {
    card_type: 'invoice_list',
    title: 'Invoices',
    list_variant: 'paid_period',
    base_currency_code: base,
    items: rows.map((m) => ({
      invoice_id: m.invoice_id,
      invoice_number: m.invoice_number,
      customer_name: m.customer_name,
      total: m.invoice_total,
      currency: m.invoice_currency,
      status: m.status,
      paid_at: m.paid_at,
      amount_in_base: m.receivedInBase,
      received_by_currency: m.receivedByCurrency,
      balance_due: m.balance_due,
    })),
  };

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Collected by invoice (${titleSuffix})`),
        lines: [
          ...(scopeKeys?.length
            ? [
                assistantBoldLine(
                  ctx.metricSessionContext?.report_parent_kind === 'top_customers'
                    ? 'Only invoices for customers from your top list.'
                    : 'Same customer scope as your previous breakdown.'
                ),
                '',
              ]
            : []),
          assistantBoldLine(
            `${rows.length} invoice${rows.length === 1 ? '' : 's'} with collections in this period`
          ),
          ...(summaryMoney ? [assistantBoldLine(summaryMoney)] : []),
          assistantBoldLine(periodLine),
          REVENUE_BY_INVOICE_FOLLOW_UP,
        ],
      },
    chat_cards: [card],
    quick_replies: revenueAfterInvoiceBreakdownQuickReplies(pseudo),
    metric_session_context: metricCtx,
  });
}

async function buildRevenueCurrencyBreakdownResponse(
  ctx: AssistantRouterContext,
  utc: AssistantPaidUtcWindow
): Promise<InvoiceWizardResponse> {
  const base = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const agg = await aggregatePaidInUtcWindow(ctx.supabase, ctx.businessId, utc, base);
  const pseudo = paidUtcToResolvedPaymentsShape(utc);
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(utc.startIso, utc.endIso, utc.timezone);
  const metricCtx = withPendingDrilldownChoice(
    metricCtxWithStructured(ctx, pseudo, {
      currentIntent: 'revenue_breakdown_by_currency',
      currentResultType: 'currency_breakdown',
    }),
    'would you like the same period by customer, by calendar month, or by invoice?',
    ['customer', 'month', 'invoice']
  );

  if (agg.byCurrency.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Collected by currency (${titleSuffix})`),
        lines: [
          'No collected amounts in this period (by payment time).',
          assistantBoldLine(periodLine),
          REVENUE_BY_INVOICE_FOLLOW_UP,
        ],
      },
      chat_cards: null,
      quick_replies: revenueAfterInvoiceBreakdownQuickReplies(pseudo),
      metric_session_context: metricCtx,
    });
  }

  const curLines: string[] = [];
  for (const r of agg.byCurrency) {
    curLines.push(assistantBoldLine(r.currency));
    curLines.push(assistantBoldLine(formatFinancialMoney(r.totalCollected, r.currency)));
  }
  if (agg.totalCollectedInBase != null && agg.totalCollectedInBase > 0.0001) {
    curLines.push(assistantBoldLine(`Total (${base})`));
    curLines.push(assistantBoldLine(formatFinancialMoney(agg.totalCollectedInBase, base)));
  }

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Collected by currency (${titleSuffix})`),
      lines: [...curLines, assistantBoldLine(periodLine), REVENUE_BY_INVOICE_FOLLOW_UP],
    },
    chat_cards: null,
    quick_replies: revenueAfterInvoiceBreakdownQuickReplies(pseudo),
    metric_session_context: metricCtx,
  });
}

async function buildRevenueMonthBreakdownResponse(
  ctx: AssistantRouterContext,
  utc: AssistantPaidUtcWindow
): Promise<InvoiceWizardResponse> {
  const rows = await aggregateCollectedRevenueByCalendarMonthInUtcWindow(
    ctx.supabase,
    ctx.businessId,
    utc,
    ctx.reportingCurrency
  );
  const pseudo = paidUtcToResolvedPaymentsShape(utc);
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(utc.startIso, utc.endIso, utc.timezone);
  const metricCtx = withPendingDrilldownChoice(
    metricCtxWithStructured(ctx, pseudo, {
      currentIntent: 'revenue_breakdown_by_month',
      currentResultType: 'month_breakdown',
    }),
    'would you like the same period by customer, by currency, or by invoice?',
    ['customer', 'currency', 'invoice']
  );

  if (rows.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Collected by month (${titleSuffix})`),
        lines: [
          'No collected amounts in this period (by payment time).',
          assistantBoldLine(periodLine),
          REVENUE_BY_INVOICE_FOLLOW_UP,
        ],
      },
      chat_cards: null,
      quick_replies: revenueAfterInvoiceBreakdownQuickReplies(pseudo),
      metric_session_context: metricCtx,
    });
  }

  const byMonth = new Map<string, CollectedRevenueByCalendarMonthRow[]>();
  for (const r of rows) {
    const arr = byMonth.get(r.monthYmd) ?? [];
    arr.push(r);
    byMonth.set(r.monthYmd, arr);
  }
  const monthsSorted = Array.from(byMonth.keys()).sort();
  const lines: string[] = [];
  for (const my of monthsSorted) {
    const monthRows = byMonth.get(my)!;
    const monthLabel = formatCollectedRevenueMonthLabel(my, utc.timezone);
    lines.push(assistantBoldLine(monthLabel));
    for (const r of monthRows) {
      lines.push(assistantBoldLine(formatFinancialMoney(r.totalCollected, r.currency)));
    }
  }

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Collected by month (${titleSuffix})`),
      lines: [...lines, assistantBoldLine(periodLine), REVENUE_BY_INVOICE_FOLLOW_UP],
    },
    chat_cards: null,
    quick_replies: revenueAfterInvoiceBreakdownQuickReplies(pseudo),
    metric_session_context: metricCtx,
  });
}

async function handleRevenueMetricFollowUpTurn(
  ctx: AssistantRouterContext,
  intent: RevenueMetricFollowUpIntent
): Promise<InvoiceWizardResponse> {
  const tz = ctx.workspaceTimezone ?? null;
  const now = new Date();

  if (intent.bareChip) {
    const pw = ctx.metricSessionContext?.paymentsWindow;
    if (pw?.startIso && pw.endIso && pw.timezone && pw.label) {
      const utc: AssistantPaidUtcWindow = {
        startIso: pw.startIso,
        endIso: pw.endIso,
        timezone: pw.timezone,
        label: pw.label,
      };
      if (intent.kind === 'revenue_breakdown_by_invoice') {
        return buildRevenueInvoiceBreakdownResponse(ctx, utc);
      }
      if (intent.kind === 'revenue_breakdown_by_customer') {
        return buildRevenueCustomerBreakdownResponse(ctx, utc);
      }
      if (intent.kind === 'revenue_breakdown_by_day') {
        return buildRevenueDayBreakdownResponse(ctx, utc);
      }
      if (intent.kind === 'revenue_breakdown_by_currency') {
        return buildRevenueCurrencyBreakdownResponse(ctx, utc);
      }
      if (intent.kind === 'revenue_breakdown_by_month') {
        return buildRevenueMonthBreakdownResponse(ctx, utc);
      }
    }
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: revenueFollowUpNeedsPeriodBody(),
      chat_cards: null,
      metric_session_context: ctx.metricSessionContext ?? null,
    });
  }

  if (intent.kind === 'revenue_breakdown_by_customer') {
    const window = resolveRevenuePaymentsWindowFromContext(ctx, ctx.userText, tz, now);
    if (!window) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: financialRangeUnresolvedBody(),
        chat_cards: null,
        metric_session_context: ctx.metricSessionContext ?? null,
      });
    }
    return buildRevenueCustomerBreakdownResponse(ctx, resolvedPaymentsWindowToPaidUtc(window));
  }

  if (intent.kind === 'revenue_breakdown_by_day') {
    const window = resolveRevenuePaymentsWindowFromContext(ctx, ctx.userText, tz, now);
    if (!window) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: financialRangeUnresolvedBody(),
        chat_cards: null,
        metric_session_context: ctx.metricSessionContext ?? null,
      });
    }
    return buildRevenueDayBreakdownResponse(ctx, resolvedPaymentsWindowToPaidUtc(window));
  }

  if (intent.kind === 'revenue_breakdown_by_currency') {
    const window = resolveRevenuePaymentsWindowFromContext(ctx, ctx.userText, tz, now);
    if (!window) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: financialRangeUnresolvedBody(),
        chat_cards: null,
        metric_session_context: ctx.metricSessionContext ?? null,
      });
    }
    return buildRevenueCurrencyBreakdownResponse(ctx, resolvedPaymentsWindowToPaidUtc(window));
  }

  if (intent.kind === 'revenue_breakdown_by_month') {
    const window = resolveRevenuePaymentsWindowFromContext(ctx, ctx.userText, tz, now);
    if (!window) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: financialRangeUnresolvedBody(),
        chat_cards: null,
        metric_session_context: ctx.metricSessionContext ?? null,
      });
    }
    return buildRevenueMonthBreakdownResponse(ctx, resolvedPaymentsWindowToPaidUtc(window));
  }

  const window = resolveRevenuePaymentsWindowFromContext(ctx, ctx.userText, tz, now);
  if (!window) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: financialRangeUnresolvedBody(),
      chat_cards: null,
      metric_session_context: ctx.metricSessionContext ?? null,
    });
  }
  return buildRevenueInvoiceBreakdownResponse(ctx, resolvedPaymentsWindowToPaidUtc(window));
}

/**
 * Deterministic financial KPI answers in chat (payments + invoice rollups; no LLM).
 */
export async function handleFinancialAssistantTurn(ctx: AssistantRouterContext) {
  if (ctx.structuredQuery?.handlerHint === 'invoice_superlative') {
    const tz = ctx.workspaceTimezone ?? null;
    const now = new Date();
    const window = resolveFinancialDateRangeFromUserText(ctx.userText, tz, now);
    if (!window) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: financialRangeUnresolvedBody(),
        chat_cards: null,
      });
    }
    const { fromYmd, toYmd } = issueDateYmdBoundsFromPaymentsWindow(window);
    const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
    const top = await listTopIssuedInvoicesInIssueDateRange(
      ctx.supabase,
      ctx.businessId,
      fromYmd,
      toYmd,
      baseCur,
      3
    );
    const titleSuffix = assistantAnalyticsPeriodTitleSuffix(window);
    if (top.length === 0) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: {
          title: assistantBoldLine(`Top invoice — ${titleSuffix}`),
          lines: ['No issued invoices found in this period.'],
        },
        chat_cards: null,
      });
    }

    const first = top[0];
    const lines: string[] = [
      assistantBoldLine('Rank 1'),
      `${assistantBoldLine('Invoice ID')}: ${first.invoiceNumber ?? first.invoiceId}`,
      `${assistantBoldLine('Customer')}: ${first.customerName}`,
      `${assistantBoldLine('Amount')}: ${formatFinancialMoney(first.amount, first.currency)} (${formatFinancialMoney(first.amountBase, baseCur)} in ${baseCur})`,
      `${assistantBoldLine('Date')}: ${first.issueDate ?? '—'}`,
    ];
    if (top.length > 1) {
      lines.push('', assistantBoldLine('Top 3 invoices'));
      top.forEach((r, idx) => {
        lines.push(
          `${idx + 1}. ${assistantBoldLine(r.invoiceNumber ?? r.invoiceId)} · ${r.customerName} · ${formatFinancialMoney(r.amountBase, baseCur)} ${baseCur}`
        );
      });
    }

    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Biggest invoice — ${titleSuffix}`),
        lines,
      },
      chat_cards: null,
    });
  }

  if (ctx.structuredQuery?.handlerHint === 'revenue_follow_up_choice_clarify') {
    const pending = ctx.metricSessionContext?.pending_followup_choice;
    if (pending?.kind === 'drilldown_dimension') {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: {
          title: assistantBoldLine('Choose breakdown'),
          lines: [`Sure — ${pending.prompt}`],
        },
        chat_cards: null,
        quick_replies: buildDrilldownChoiceQuickReplies(ctx.metricSessionContext),
        metric_session_context: ctx.metricSessionContext ?? null,
      });
    }
  }
  if (ctx.structuredQuery?.handlerHint === 'revenue_follow_up_choice_decline') {
    const cleared = clearPendingFollowupChoice(ctx.metricSessionContext);
    const pseudo =
      cleared?.paymentsWindow &&
      cleared.paymentsWindow.startIso &&
      cleared.paymentsWindow.endIso &&
      cleared.paymentsWindow.timezone &&
      cleared.paymentsWindow.label
        ? paidUtcToResolvedPaymentsShape(metricSessionPaymentsWindowToPaidUtc(cleared.paymentsWindow))
        : null;
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Got it'),
        lines: [
          pseudo
            ? `Okay — anything else you want to look at for **${assistantAnalyticsPeriodTitleSuffix(pseudo)}**?`
            : 'Okay.',
        ],
      },
      chat_cards: null,
      quick_replies: pseudo ? revenueProgressiveQuickReplies(pseudo) : null,
      metric_session_context: cleared,
    });
  }

  const followUp = tryParseRevenueMetricFollowUpIntent(ctx.userText);
  if (followUp) {
    return handleRevenueMetricFollowUpTurn(ctx, followUp);
  }

  const sq = ctx.structuredQuery;
  if (
    sq?.routeCategory === 'financial_queries' &&
    sq.businessObject === 'invoice' &&
    sq.filters?.invoiceStatus === 'partially_paid'
  ) {
    if (sq.queryShape === 'count') {
      const n = await countPartiallyPaidInvoices(ctx.supabase, ctx.businessId);
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: partiallyPaidInvoiceCountBody(n),
        chat_cards: null,
      });
    }
    const rows = await fetchPartiallyPaidInvoicesDetail(ctx.supabase, ctx.businessId);
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: partiallyPaidInvoicesDetailStructured(rows, formatFinancialMoney),
      chat_cards: null,
    });
  }

  const resolved = resolveFinancialMetricIntent(ctx.userText);
  if (!resolved) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: financialDefaultPromptBody(),
      chat_cards: null,
    });
  }

  const tz = ctx.workspaceTimezone ?? null;

  if (resolved.kind === 'unpaid_balance') {
    const rows = await aggregateUnpaidBalancesByCurrency(ctx.supabase, ctx.businessId);
    if (rows.length === 0) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: openBalanceEmptyBody(),
        chat_cards: null,
      });
    }
    const card: InvoiceAssistantChatCard = {
      card_type: 'insight_summary',
      presentation: 'compact',
      title: '',
      rows: rows.map((r) => ({
        label: r.currency,
        value: assistantBoldLine(formatFinancialMoney(r.amount, r.currency)),
      })),
    };
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: openBalanceWithCardBody(),
      chat_cards: [card],
    });
  }

  if (resolved.kind === 'overdue_balance') {
    const { byCurrency, invoiceCount } = await aggregateOverdueInvoices(ctx.supabase, ctx.businessId, {
      workspaceTimezone: tz,
      baseCurrencyCode: ctx.reportingCurrency,
    });
    if (invoiceCount === 0) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: overdueEmptyBody(),
        chat_cards: null,
      });
    }
    const card: InvoiceAssistantChatCard = {
      card_type: 'insight_summary',
      presentation: 'compact',
      title: '',
      rows: [
        ...byCurrency.map((r) => ({
          label: r.currency,
          value: assistantBoldLine(formatFinancialMoney(r.amount, r.currency)),
        })),
        { label: 'Invoices', value: assistantBoldLine(String(invoiceCount)) },
      ],
      cta: { label: 'View Invoices', href: '/dashboard/invoices?status=overdue' },
    };
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: overdueWithCardBody(),
      chat_cards: [card],
    });
  }

  if (resolved.kind === 'overdue_invoice_count') {
    const { invoiceCount } = await aggregateOverdueInvoices(ctx.supabase, ctx.businessId, {
      workspaceTimezone: tz,
      baseCurrencyCode: ctx.reportingCurrency,
    });
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: overdueCountBody(invoiceCount),
      chat_cards: null,
    });
  }

  if (resolved.kind === 'partially_paid_invoice_detail') {
    const rows = await fetchPartiallyPaidInvoicesDetail(ctx.supabase, ctx.businessId);
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: partiallyPaidInvoicesDetailStructured(rows, formatFinancialMoney),
      chat_cards: null,
    });
  }

  if (resolved.kind === 'partially_paid_invoice_count') {
    const n = await countPartiallyPaidInvoices(ctx.supabase, ctx.businessId);
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: partiallyPaidInvoiceCountBody(n),
      chat_cards: null,
    });
  }

  if (resolved.kind === 'revenue_detail_unavailable') {
    const nowInner = new Date();
    if (resolved.detail === 'customer') {
      const window = resolveRevenuePaymentsWindowFromContext(ctx, ctx.userText, tz, nowInner);
      if (!window) {
        return buildWizardShellResponse({
          ...shell(ctx),
          assistant_lines: [],
          assistant_structured: financialRangeUnresolvedBody(),
          chat_cards: null,
          metric_session_context: ctx.metricSessionContext ?? null,
        });
      }
      return buildRevenueCustomerBreakdownResponse(ctx, resolvedPaymentsWindowToPaidUtc(window));
    }
    const dayWindow = resolveRevenuePaymentsWindowFromContext(ctx, ctx.userText, tz, nowInner);
    if (!dayWindow) {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: financialRangeUnresolvedBody(),
        chat_cards: null,
        metric_session_context: ctx.metricSessionContext ?? null,
      });
    }
    return buildRevenueDayBreakdownResponse(ctx, resolvedPaymentsWindowToPaidUtc(dayWindow));
  }

  const now = new Date();
  const window = resolveFinancialDateRangeFromUserText(ctx.userText, tz, now);
  if (!window) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: financialRangeUnresolvedBody(),
      chat_cards: null,
    });
  }

  const fetchStartIso = collectedMetricFetchStartIso(resolved.rangeSpec, tz, now);

  console.info('[financial-assistant]', {
    kind: resolved.kind,
    rangeLabel: window.label,
    humanRange: window.humanRange,
    timezone: window.timezone,
    startIso: window.startIso,
    endIso: window.endIso,
    collectedFetchStartIso: fetchStartIso,
  });

  if (resolved.kind === 'invoices_issued_count') {
    const { fromYmd, toYmd } = issueDateYmdBoundsFromPaymentsWindow(window);
    const n = await countInvoicesIssuedInIssueDateRange(ctx.supabase, ctx.businessId, fromYmd, toYmd);
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: invoicesIssuedBody(window, n),
      chat_cards: null,
    });
  }

  if (resolved.kind === 'revenue_invoiced') {
    const { fromYmd, toYmd } = issueDateYmdBoundsFromPaymentsWindow(window);
    const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
    const invoiced = await sumInvoicedRevenueInIssueDateRange(
      ctx.supabase,
      ctx.businessId,
      fromYmd,
      toYmd,
      baseCur
    );
    const collectedForContext = await loadCollectedRevenueMetricForBusiness(
      ctx.supabase,
      ctx.businessId,
      ctx.reportingCurrency,
      {
        fetchStartIso,
        paymentsWindow: window,
        surface: 'assistant',
        timezone: tz,
        dashboardPreset: dashboardPresetForRevenueSpec(resolved.rangeSpec),
      }
    );
    if ('error' in collectedForContext) {
      console.error('[financial-assistant] collected metric (invoiced context)', collectedForContext.error);
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: financialLoadErrorBody(),
        chat_cards: null,
      });
    }
    const invoicedMetricCtx = withPendingDrilldownChoice(
      metricCtxWithStructured(
        ctx,
        window,
        {
          currentIntent: 'revenue_invoiced_total',
          currentResultType: 'currency_summary',
        },
        'invoiced_revenue'
      ),
      'would you like it by customer, by day, or by invoice?',
      ['customer', 'day', 'invoice']
    );
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: invoicedRevenueWithCollectedContextStructured(window, {
        formatMoney: formatFinancialMoney,
        invoicedBase: invoiced.totalBase,
        invoicedInvoiceCount: invoiced.invoiceCount,
        collectedBase: collectedForContext.totalBase,
        baseCurrency: ctx.reportingCurrency,
      }),
      quick_replies: revenueProgressiveQuickReplies(window),
      chat_cards: null,
      metric_session_context: invoicedMetricCtx,
    });
  }

  if (resolved.kind !== 'revenue_collected') {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: financialDefaultPromptBody(),
      chat_cards: null,
    });
  }

  const collected = await loadCollectedRevenueMetricForBusiness(
    ctx.supabase,
    ctx.businessId,
    ctx.reportingCurrency,
    {
      fetchStartIso,
      paymentsWindow: window,
      surface: 'assistant',
      timezone: tz,
      dashboardPreset: dashboardPresetForRevenueSpec(resolved.rangeSpec),
    }
  );

  if ('error' in collected) {
    console.error('[financial-assistant] collected metric', collected.error);
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: financialLoadErrorBody(),
      chat_cards: null,
    });
  }

  const byCur = collected.byCurrency;
  const revenueMetricCtx = withPendingDrilldownChoice(
    metricCtxWithStructured(ctx, window, {
      currentIntent: 'revenue_collected_total',
      currentResultType: 'currency_summary',
    }),
    'would you like it by customer, by day, or by invoice?',
    ['customer', 'day', 'invoice']
  );

  if (collected.totalBase <= 0.0001 && byCur.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: revenueCollectedZeroBody(
        window,
        formatFinancialMoney,
        ctx.reportingCurrency
      ),
      quick_replies: revenueProgressiveQuickReplies(window),
      chat_cards: null,
      metric_session_context: revenueMetricCtx,
    });
  }

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: revenueCollectedSummaryStructured(window, {
      formatMoney: formatFinancialMoney,
      totalAmount: collected.totalBase,
      displayCurrency: ctx.reportingCurrency,
      baseCurrency: ctx.reportingCurrency,
      byCurrency: collected.byCurrency,
    }),
    quick_replies: revenueProgressiveQuickReplies(window),
    chat_cards: null,
    metric_session_context: revenueMetricCtx,
  });
}
