import { formatInTimeZone } from 'date-fns-tz';
import { assistantBoldLine } from '@/lib/assistant/assistant-bold-line';
import {
  CUSTOMER_CHURN_MIN_QUIET_DAYS,
  CUSTOMER_INACTIVE_QUIET_DAYS,
  filterChurnedCustomers,
  filterInactiveCustomers,
  loadCustomerLifecycleRows,
  segmentInactiveCustomers,
  sortPreviouslyActiveByValueThenRecency,
} from '@/lib/business-assistant/customer-lifecycle-analytics';
import type { CustomerLifecycleRow } from '@/lib/business-assistant/customer-lifecycle-analytics';
import { findCustomerRecordsByName } from '@/lib/business-assistant/assistant-customer-find';
import type { PaymentsNaturalRangeSpec, ResolvedPaymentsTimeRange } from '@/lib/analytics/payments-received-time-range';
import { resolvePaymentsReceivedTimeRange } from '@/lib/analytics/payments-received-time-range';
import {
  snapshotActiveQueryFromStructured,
  tryInferDefaultPeriodComparisonForChangeQuery,
  tryParsePeriodComparisonPair,
} from '@/lib/business-assistant/assistant-structured-intent';
import {
  REVENUE_BY_CUSTOMER_FOLLOW_UP,
  formatFinancialPeriodLine,
  revenueByCustomerProgressiveQuickReplies,
  revenuePeriodScopePhraseForMessage,
  revenueProgressiveQuickReplies,
} from '@/lib/business-assistant/financial-assistant-copy';
import {
  assistantAnalyticsPeriodTitleSuffix,
  parseFinancialMetricRangeSpec,
  resolveFinancialDateRangeFromUserText,
} from '@/lib/business-assistant/financial-date-range-resolver';
import {
  aggregateInvoicedRevenueByCustomerInIssueDateRange,
  aggregateOverdueInvoices,
  aggregateUnpaidBalancesByCurrency,
  formatFinancialMoney,
  issueDateYmdBoundsFromPaymentsWindow,
  maxInvoiceBaseInIssueDateRange,
  paidUtcToResolvedPaymentsShape,
  resolvedPaymentsWindowToPaidUtc,
  sumInvoicedRevenueInIssueDateRange,
  type InvoicedCustomerShareRow,
} from '@/lib/business-assistant/financial-metric-queries';
import {
  collectedMetricFetchStartIso,
  dashboardPresetForRevenueSpec,
  loadCollectedRevenueMetricForBusiness,
} from '@/lib/payments/collected-revenue-metric';
import { metricContextForRevenueWindow } from '@/lib/business-assistant/metric-session-context';
import type { AssistantRouterContext } from '@/lib/business-assistant/router-context';
import { buildWizardShellResponse } from '@/lib/business-assistant/wizard-shell';
import {
  aggregateAssistantDueTodayBalances,
  aggregateCollectedRevenueByCustomerInUtcWindow,
  type CollectedRevenueByCustomerRow,
} from '@/lib/invoices/assistant-invoice-queries';
import { fetchCollectionsIntelligenceByCustomer } from '@/lib/invoices/assistant-overdue-priority';
import { loadDashboardOverdueSnapshot } from '@/lib/invoices/dashboard-invoice-overdue';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import type { InvoiceAssistantChatCard } from '@/lib/invoices/conversational-invoice-wizard/types';
import { isSafeIanaTimeZone } from '@/lib/dashboard/date-range';

const TOP_CUSTOMERS_LIMIT = 10;
const CUSTOMER_SPENDING_COMPARISON_LIMIT = 12;
const LIFECYCLE_PREVIEW_AT_RISK = 6;
const LIFECYCLE_PREVIEW_NEVER_ACTIVE = 4;

function formatLifecycleDateMs(ms: number, workspaceTimezone: string | null): string {
  const z = workspaceTimezone && isSafeIanaTimeZone(workspaceTimezone) ? workspaceTimezone : 'UTC';
  return formatInTimeZone(new Date(ms), z, 'MMM d, yyyy');
}

function formatLifecycleActivitySentence(r: CustomerLifecycleRow, workspaceTimezone: string | null): string {
  if (r.lastActivityMs != null) {
    return `Last activity: ${formatLifecycleDateMs(r.lastActivityMs, workspaceTimezone)}`;
  }
  if (r.hadRelationship) {
    return 'Last activity: not dated (see invoice list)';
  }
  return 'No activity recorded yet';
}

async function handleAttentionSummaryTurn(ctx: AssistantRouterContext) {
  const tz = ctx.workspaceTimezone ?? null;
  const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const z = tz && isSafeIanaTimeZone(tz) ? tz : 'UTC';
  const todayLabel = formatInTimeZone(new Date(), z, 'MMM d, yyyy');

  const [overdueSnap, dueToday, unpaidRows, lifecycleRows] = await Promise.all([
    loadDashboardOverdueSnapshot(ctx.supabase, ctx.businessId, {
      workspaceTimezone: tz,
      baseCurrencyCode: baseCur,
    }),
    aggregateAssistantDueTodayBalances(ctx.supabase, ctx.businessId, tz),
    aggregateUnpaidBalancesByCurrency(ctx.supabase, ctx.businessId),
    loadCustomerLifecycleRows(ctx.supabase, ctx.businessId),
  ]);

  const unpaidInBase = sumOutstandingInReportingCurrency(unpaidRows, baseCur);
  const inactiveCount = filterInactiveCustomers(lifecycleRows).length;

  const lines: string[] = [
    assistantBoldLine(`Priority snapshot — ${todayLabel}`),
    '**Order:** overdue → due today → total open AR → inactive customers.',
    '',
    assistantBoldLine('1. Overdue'),
  ];
  if (overdueSnap.invoiceCount === 0) {
    lines.push('**None** — no past-due open balances in the current scan.');
  } else {
    lines.push(
      `${assistantBoldLine(String(overdueSnap.invoiceCount))} invoice${overdueSnap.invoiceCount === 1 ? '' : 's'} · **${formatFinancialMoney(overdueSnap.totalBase, baseCur)}** open (approx. in ${baseCur}) — **collect first**.`,
      assistantBoldLine('By currency'),
      ...overdueSnap.byCurrency.map(
        (r) => `${assistantBoldLine(r.currency)} — ${formatFinancialMoney(r.amount, r.currency)}`
      )
    );
  }

  lines.push('', assistantBoldLine('2. Due today'));
  if (dueToday.count === 0) {
    lines.push('**None** — nothing due today with an open balance.');
  } else {
    lines.push(
      `${assistantBoldLine(String(dueToday.count))} invoice${dueToday.count === 1 ? '' : 's'} with balance due **today** — confirm payment or follow up before end of day.`,
      assistantBoldLine('By currency'),
      ...dueToday.byCurrency.map(
        (r) => `${assistantBoldLine(r.currency)} — ${formatFinancialMoney(r.amount, r.currency)}`
      )
    );
  }

  lines.push('', assistantBoldLine('3. Unpaid (open AR)'));
  if (unpaidRows.length === 0 || unpaidInBase <= 0.02) {
    lines.push('**None** — no open balances, or all caught up.');
  } else {
    lines.push(
      `**${formatFinancialMoney(unpaidInBase, baseCur)}** in ${baseCur} (sum of open balances in reporting currency).`,
      assistantBoldLine('By currency'),
      ...unpaidRows.map(
        (r) => `${assistantBoldLine(r.currency)} — ${formatFinancialMoney(r.amount, r.currency)}`
      )
    );
  }

  lines.push('', assistantBoldLine('4. At risk (inactive)'));
  lines.push(
    inactiveCount === 0
      ? '**None** in the **30-day** window — or no customers on file.'
      : `**${inactiveCount}** customer${inactiveCount === 1 ? '' : 's'} with **no invoice or payment in ${CUSTOMER_INACTIVE_QUIET_DAYS} days** — say **inactive customers** for names and detail.`
  );

  const hot =
    overdueSnap.invoiceCount > 0 || dueToday.count > 0
      ? '**Cash and terms** need attention first — overdue and due-today hit liquidity and trust fastest.'
      : inactiveCount > 0
        ? 'No urgent invoice dates, but **inactive relationships** can still slip into churn — worth a light touch.'
        : '**Nothing critical** in this snapshot — keep rhythm with quick AR checks and customer follow-ups.';

  lines.push('', assistantBoldLine('Insight'), hot);

  lines.push(
    '',
    assistantBoldLine('Next steps'),
    overdueSnap.invoiceCount > 0
      ? '• Start with **overdue** — reminders, calls, or payment links for the largest balances.'
      : '• When overdue appears, **triage by amount and age** before smaller items.',
    dueToday.count > 0
      ? '• For **due today**, confirm payment or send a same-day reminder before close of business.'
      : '• Review **due this week** in Invoices if you want to get ahead of the next cycle.',
    inactiveCount > 0
      ? '• Ask **inactive customers** to see who to re-engage before they go quiet too long.'
      : '• Ask **top customers this month** to compare against your quietest accounts.',
    '• Open **Invoices** to act on specific rows; use **Customers** for relationship context.'
  );

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine('What needs attention'),
      lines,
    },
    chat_cards: null,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Who to follow up with: customers ranked by overdue exposure and open balance (reporting base). */
async function handleCollectionsIntelligenceTurn(ctx: AssistantRouterContext) {
  const tz = ctx.workspaceTimezone ?? null;
  const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const { rows, invoiceScanTruncated } = await fetchCollectionsIntelligenceByCustomer(
    ctx.supabase,
    ctx.businessId,
    ctx.reportingCurrency,
    tz
  );

  if (rows.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Collections follow-up'),
        lines: [
          '**No open balances** in the current scan — nothing to chase right now.',
          ...(invoiceScanTruncated
            ? [
                '**Note:** The scan hit the invoice cap — open **Invoices** if you expect more rows.',
              ]
            : []),
        ],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const lines: string[] = [
    assistantBoldLine('Who to follow up with'),
    'Ranked: **overdue first**, then **total outstanding** (desc), then **max days overdue** (desc). Amounts are **approximate** in **' +
      baseCur +
      '** (per-invoice base).',
    '',
  ];

  const maxShow = 12;
  const shown = rows.slice(0, maxShow);
  for (const r of shown) {
    const overdueLabel = r.hasOverdue
      ? `**${r.maxDaysOverdue}** day${r.maxDaysOverdue === 1 ? '' : 's'} overdue (max across invoices)`
      : '**Not past due yet** (open balance)';
    lines.push(
      `• **${r.displayName}** — ${formatFinancialMoney(r.totalOutstandingBase, baseCur)} · **${r.invoiceCount}** invoice${
        r.invoiceCount === 1 ? '' : 's'
      } · ${overdueLabel}`
    );
  }
  if (rows.length > shown.length) {
    lines.push(`…**${rows.length - shown.length}** more customer${rows.length - shown.length === 1 ? '' : 's'} with open balances.`);
  }

  const top = rows[0];
  let insight: string;
  if (top.hasOverdue && top.maxDaysOverdue >= 14) {
    insight = `**Prioritize ${top.displayName}** — largest balance in **${baseCur}** with **${top.maxDaysOverdue}** days past due; send a clear reminder and payment link first.`;
  } else if (top.hasOverdue) {
    insight = `**Start with ${top.displayName}** — tops the list on **balance** and **overdue** age.`;
  } else {
    insight =
      '**No overdue balances** in this scan — these accounts still have **open** invoices; track upcoming due dates before they slip.';
  }

  lines.push('', assistantBoldLine('Insight'), insight);
  if (invoiceScanTruncated) {
    lines.push(
      '',
      '**Note:** Invoice list was capped — verify **Invoices → Past due** for anything missing from this ranking.'
    );
  }

  lines.push(
    '',
    assistantBoldLine('Try next'),
    '• **Send reminder** — open the customer’s invoice and use **Send reminder** (or your usual cadence).',
    '• **View invoices** — filter **Past due** on the Invoices screen.',
    '• **By customer** — “Break down revenue by customer for this month” for payment context.'
  );

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine('Collections intelligence'),
      lines,
    },
    chat_cards: null,
    quick_replies: [
      { label: 'What’s overdue', message: "What's overdue right now?" },
      { label: 'Total unpaid', message: 'What is my total unpaid balance?' },
      { label: 'By customer', message: 'Break down revenue by customer for this month' },
    ],
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Risk & exposure: overdue, AR, issuance vs collections, concentration, optional prior-period trend. */
async function handleRiskAdvisoryTurn(ctx: AssistantRouterContext) {
  const tz = ctx.workspaceTimezone ?? null;
  const now = new Date();
  const lower = ctx.userText.trim().toLowerCase();
  const spec = ctx.structuredQuery?.rangeSpec ?? parseFinancialMetricRangeSpec(lower);
  const window = resolveFinancialDateRangeFromUserText(ctx.userText, tz, now);
  if (!window) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Risk & exposure'),
        lines: ['Could not resolve a time period. Try “this month”, “this week”, or “last 7 days”.'],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const { fromYmd, toYmd } = issueDateYmdBoundsFromPaymentsWindow(window);
  const fetchStartIso = collectedMetricFetchStartIso(spec, tz, now);

  const baselineWindow =
    spec.kind === 'this_month'
      ? resolveFinancialDateRangeFromUserText('last month', tz, now)
      : spec.kind === 'this_week'
        ? resolveFinancialDateRangeFromUserText('last week', tz, now)
        : spec.kind === 'today'
          ? resolveFinancialDateRangeFromUserText('yesterday', tz, now)
          : null;

  const priorSpec =
    spec.kind === 'this_month'
      ? ({ kind: 'last_month' as const })
      : spec.kind === 'this_week'
        ? ({ kind: 'last_week' as const })
        : spec.kind === 'today'
          ? ({ kind: 'yesterday' as const })
          : null;

  const priorInvoicedPromise =
    baselineWindow && priorSpec
      ? (() => {
          const { fromYmd: pf, toYmd: pt } = issueDateYmdBoundsFromPaymentsWindow(baselineWindow);
          return sumInvoicedRevenueInIssueDateRange(ctx.supabase, ctx.businessId, pf, pt, baseCur);
        })()
      : Promise.resolve({ totalBase: 0, invoiceCount: 0 });

  const priorCollectedPromise =
    baselineWindow && priorSpec
      ? loadCollectedRevenueMetricForBusiness(ctx.supabase, ctx.businessId, ctx.reportingCurrency, {
          fetchStartIso: collectedMetricFetchStartIso(priorSpec, tz, now),
          paymentsWindow: baselineWindow,
          surface: 'assistant',
          timezone: tz,
          dashboardPreset: dashboardPresetForRevenueSpec(priorSpec),
        })
      : Promise.resolve(null);

  const [
    invoiced,
    collectedMetric,
    unpaidRows,
    overdueSnap,
    byCustomer,
    priorInvoiced,
    priorCollectedResult,
  ] = await Promise.all([
    sumInvoicedRevenueInIssueDateRange(ctx.supabase, ctx.businessId, fromYmd, toYmd, baseCur),
    loadCollectedRevenueMetricForBusiness(ctx.supabase, ctx.businessId, ctx.reportingCurrency, {
      fetchStartIso,
      paymentsWindow: window,
      surface: 'assistant',
      timezone: tz,
      dashboardPreset: dashboardPresetForRevenueSpec(spec),
    }),
    aggregateUnpaidBalancesByCurrency(ctx.supabase, ctx.businessId),
    loadDashboardOverdueSnapshot(ctx.supabase, ctx.businessId, {
      workspaceTimezone: tz,
      baseCurrencyCode: baseCur,
    }),
    aggregateInvoicedRevenueByCustomerInIssueDateRange(
      ctx.supabase,
      ctx.businessId,
      fromYmd,
      toYmd,
      baseCur
    ),
    priorInvoicedPromise,
    priorCollectedPromise,
  ]);

  if ('error' in collectedMetric) {
    console.error('[risk-advisory] collected metric', collectedMetric.error);
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Risk & exposure'),
        lines: ["Couldn't load payments for this period. Try again shortly."],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  let priorCollectedBase = 0;
  if (priorCollectedResult && !('error' in priorCollectedResult)) {
    priorCollectedBase = priorCollectedResult.totalBase;
  } else if (priorCollectedResult && 'error' in priorCollectedResult) {
    console.error('[risk-advisory] prior collected', priorCollectedResult.error);
  }

  const pseudo = paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(window));
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(window.startIso, window.endIso, window.timezone);
  const scopePhrase = revenuePeriodScopePhraseForMessage(window);

  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, { baseCurrencyCode: ctx.reportingCurrency })
      : undefined;
  const metricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_collected_total',
      currentResultType: 'currency_summary',
    },
    aq,
    'collected_revenue'
  );

  const outstandingInBase = sumOutstandingInReportingCurrency(unpaidRows, baseCur);
  const inv = invoiced.totalBase;
  const col = collectedMetric.totalBase;
  const overdueAmt = overdueSnap.totalBase;
  const top3 = byCustomer.slice(0, 3);
  const topShare =
    inv > 0.02 && top3.length > 0 ? Math.min(1, top3[0].totalBase / inv) : 0;
  const top3ShareSum =
    inv > 0.02 ? Math.min(1, top3.reduce((s, r) => s + r.totalBase, 0) / inv) : 0;

  let trendLine: string | null = null;
  if (priorSpec && baselineWindow && priorInvoiced.totalBase > 0.02) {
    const issuedDelta = inv - priorInvoiced.totalBase;
    const issuedPct = (issuedDelta / priorInvoiced.totalBase) * 100;
    const collDelta = col - priorCollectedBase;
    const collPct =
      priorCollectedBase > 0.02 ? (collDelta / priorCollectedBase) * 100 : null;
    const periodLabel =
      priorSpec.kind === 'last_month' ? 'prior month' : priorSpec.kind === 'last_week' ? 'prior week' : 'prior day';
    trendLine = `**Issued revenue** vs ${periodLabel}: **${issuedPct >= 0 ? '+' : ''}${issuedPct.toFixed(0)}%** (${
      issuedDelta >= 0 ? '+' : ''
    }${formatFinancialMoney(Math.abs(issuedDelta), baseCur)})`;
    if (collPct != null && priorCollectedBase > 0.02) {
      trendLine += ` · **Collected** vs ${periodLabel}: **${collPct >= 0 ? '+' : ''}${collPct.toFixed(0)}%**`;
    }
  }

  let insight: string;
  if (overdueSnap.invoiceCount >= 4) {
    insight = `**Cash-flow risk** is elevated — **${overdueSnap.invoiceCount}** overdue invoices (**${formatFinancialMoney(overdueAmt, baseCur)}** approximate open in ${baseCur}).`;
  } else if (overdueSnap.invoiceCount >= 1) {
    insight = `**Collection risk** is present — **${overdueSnap.invoiceCount}** overdue (**${formatFinancialMoney(overdueAmt, baseCur)}** in ${baseCur}) — follow up before balances age further.`;
  } else if (inv >= SNAPSHOT_MIN_BASE && top3ShareSum >= 0.55) {
    insight =
      '**Concentration risk:** most issued revenue in this window sits with a few customers — worth diversifying pipeline.';
  } else if (inv >= SNAPSHOT_MIN_BASE && col < inv * 0.35) {
    insight =
      '**Cash vs revenue gap:** collected cash is low versus issued revenue in this window — often timing, but monitor AR.';
  } else {
    insight =
      '**No acute red flags** in this scan — keep watching overdue balances and customer concentration as you grow.';
  }

  const unpaidLines =
    unpaidRows.length === 0
      ? ['None in reporting currency']
      : unpaidRows.map(
          (r) => `${assistantBoldLine(r.currency)} — ${formatFinancialMoney(r.amount, r.currency)}`
        );

  const concLines =
    inv <= 0.02
      ? ['No issued revenue in this window — concentration not meaningful yet.']
      : top3.length === 0
        ? ['No per-customer split available.']
        : top3.map((r) => {
            const pct = inv > 0 ? Math.round((r.totalBase / inv) * 100) : 0;
            return `• **${r.displayLabel}** — ${formatFinancialMoney(r.totalBase, baseCur)} (**${pct}%** of issued in window)`;
          });

  const lines: string[] = [
    assistantBoldLine(periodLine),
    '**Focus:** overdue → open AR → issuance vs collections → concentration.',
    '',
    assistantBoldLine('Overdue'),
    overdueSnap.invoiceCount === 0
      ? '**None** in the current past-due scan.'
      : `**${overdueSnap.invoiceCount}** invoice${overdueSnap.invoiceCount === 1 ? '' : 's'} · **${formatFinancialMoney(overdueAmt, baseCur)}** open (approx. in ${baseCur})`,
    ...(overdueSnap.invoiceCount > 0
      ? [
          assistantBoldLine('By currency'),
          ...overdueSnap.byCurrency.map(
            (r) => `${assistantBoldLine(r.currency)} — ${formatFinancialMoney(r.amount, r.currency)}`
          ),
        ]
      : []),
    '',
    assistantBoldLine('Outstanding (open AR)'),
    `**${formatFinancialMoney(outstandingInBase, baseCur)}** in ${baseCur} (reporting currency)`,
    assistantBoldLine('By currency'),
    ...unpaidLines,
    '',
    assistantBoldLine('Revenue vs collected (window)'),
    `**Issued:** ${formatFinancialMoney(inv, baseCur)} · **Collected:** ${formatFinancialMoney(col, baseCur)}`,
    inv >= SNAPSHOT_MIN_BASE && col < inv * 0.35
      ? '**Gap:** collections are well below issuance — often newer invoices or payments still landing.'
      : 'Issued uses **issue date**; collected uses **payment date** in this window.',
    '',
    assistantBoldLine('Concentration (issued, top customers)'),
    ...concLines,
    '',
    assistantBoldLine('Insight'),
    insight,
  ];

  if (trendLine) {
    lines.push('', assistantBoldLine('Vs prior period'), trendLine);
  }

  lines.push(
    '',
    assistantBoldLine('Try next'),
    `• **Show overdue** — “What’s overdue right now?”`,
    `• **Show unpaid** — “Total unpaid invoice amount ${scopePhrase.startsWith('the ') ? scopePhrase : scopePhrase}” or ask for open AR`,
    `• **By customer** — “Break down revenue by customer for ${scopePhrase}”`
  );

  const quickReplies: { label: string; message: string }[] = [
    { label: 'Show overdue', message: "What's overdue right now?" },
    { label: 'Show unpaid', message: `Total unpaid balance` },
    { label: 'By customer', message: `Break down revenue by customer for ${scopePhrase}` },
  ];

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Risk & exposure — ${titleSuffix}`),
      lines,
    },
    chat_cards: null,
    quick_replies: quickReplies,
    metric_session_context: metricCtx,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

function appendLifecycleCustomerBullets(
  lines: string[],
  rows: CustomerLifecycleRow[],
  baseCur: string,
  tz: string | null,
  max: number
): number {
  const slice = rows.slice(0, max);
  for (const r of slice) {
    const activity = formatLifecycleActivitySentence(r, tz);
    const valueBit =
      r.historicalInvoicedBase > 0.02
        ? ` · Lifetime invoiced **${formatFinancialMoney(r.historicalInvoicedBase, baseCur)}**`
        : '';
    lines.push(`• ${assistantBoldLine(r.displayLabel)} — ${activity}${valueBit}`);
  }
  return slice.length;
}

async function handleCustomerLifecycleAnalyticsTurn(
  ctx: AssistantRouterContext,
  kind: 'inactive' | 'churned'
) {
  const rows = await loadCustomerLifecycleRows(ctx.supabase, ctx.businessId);
  const tz = ctx.workspaceTimezone ?? null;
  const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const filtered =
    kind === 'inactive' ? filterInactiveCustomers(rows) : filterChurnedCustomers(rows);
  const count = filtered.length;

  const title = kind === 'inactive' ? 'Inactive customers' : 'Churned customers';
  const defLine =
    kind === 'inactive'
      ? `**Definition:** No invoice or payment activity in the last **${CUSTOMER_INACTIVE_QUIET_DAYS} days** (issued invoices only; draft/void/cancelled excluded).`
      : `**Definition:** Had billing activity before, but nothing in the last **${CUSTOMER_CHURN_MIN_QUIET_DAYS}+ days** (same rules).`;

  const lines: string[] = [
    assistantBoldLine(`${count} customer${count === 1 ? '' : 's'}`),
    defLine,
    '',
  ];

  if (count === 0) {
    if (kind === 'inactive') {
      lines.push(
        'Everyone has had a touch in this window — or you have no customer records yet.'
      );
    } else {
      lines.push(
        assistantBoldLine('Insight'),
        '**No churn detected** in the current window — **customer retention looks healthy** on this definition (no accounts with prior billing that have gone quiet **60+ days** without invoice or payment activity).',
        '',
        assistantBoldLine('Next steps'),
        '• Periodically ask for **inactive customers** — early quiet is easier to fix than late churn.',
        '• Monitor **overdue invoices** so payment friction doesn’t turn into disengagement.',
        '• Check **top customers this month** to keep your strongest relationships on your radar.'
      );
    }
  } else if (kind === 'inactive') {
    const { previouslyActive, neverActive } = segmentInactiveCustomers(filtered);
    lines.push(
      assistantBoldLine('Why this matters'),
      'Long gaps without billing or payment usually mean **renewal or follow-up risk** — especially for accounts that used to buy often. Prioritize **previously active** relationships before cold records with no history.'
    );
    lines.push('', assistantBoldLine(`Previously active (at risk) — ${previouslyActive.length}`));
    if (previouslyActive.length === 0) {
      lines.push('None in this segment.');
    } else {
      lines.push(
        `Sorted by **lifetime invoiced** (highest first), then **longest idle**. Showing up to **${LIFECYCLE_PREVIEW_AT_RISK}**.`
      );
      const shown = appendLifecycleCustomerBullets(
        lines,
        previouslyActive,
        baseCur,
        tz,
        LIFECYCLE_PREVIEW_AT_RISK
      );
      if (previouslyActive.length > shown) {
        lines.push(`…**${previouslyActive.length - shown}** more in this segment.`);
      }
    }
    lines.push('', assistantBoldLine(`No activity yet — ${neverActive.length}`));
    if (neverActive.length === 0) {
      lines.push('None — every customer has at least one issued invoice or payment on file.');
    } else {
      lines.push(
        `No issued invoice or payment recorded yet (alphabetical). Showing up to **${LIFECYCLE_PREVIEW_NEVER_ACTIVE}**.`
      );
      const shownNever = appendLifecycleCustomerBullets(
        lines,
        neverActive,
        baseCur,
        tz,
        LIFECYCLE_PREVIEW_NEVER_ACTIVE
      );
      if (neverActive.length > shownNever) {
        lines.push(`…**${neverActive.length - shownNever}** more in this segment.`);
      }
    }
  } else {
    const sorted = sortPreviouslyActiveByValueThenRecency(filtered);
    lines.push(
      assistantBoldLine('Why this matters'),
      'These accounts **used to bill or pay** and have gone quiet — **churn risk** is higher than for records with no history. Revenue may be walking out the door unless you re-engage.'
    );
    lines.push(
      '',
      assistantBoldLine('Priority list'),
      `Sorted by **lifetime invoiced** (highest first), then **longest idle**. Showing up to **${LIFECYCLE_PREVIEW_AT_RISK + LIFECYCLE_PREVIEW_NEVER_ACTIVE}**.`
    );
    const maxShow = LIFECYCLE_PREVIEW_AT_RISK + LIFECYCLE_PREVIEW_NEVER_ACTIVE;
    const shown = appendLifecycleCustomerBullets(lines, sorted, baseCur, tz, maxShow);
    if (sorted.length > shown) {
      lines.push(`…**${sorted.length - shown}** more.`);
    }
  }

  const churnZeroAlreadyComplete = count === 0 && kind === 'churned';
  if (!churnZeroAlreadyComplete) {
    lines.push('', assistantBoldLine('Suggested actions'));
    if (kind === 'inactive') {
      lines.push(
        '• **First:** call or email **previously active** accounts — reference their last invoice or payment.',
        '• **Then:** target **high lifetime invoiced** idle customers with a tailored offer or executive check-in.',
        '• **Prospects with no activity:** add to a light nurture sequence; compare with **top customers this month** for contrast.'
      );
    } else {
      lines.push(
        '• Start with the **highest lifetime invoiced** names — they represent the most revenue at stake.',
        '• Send a **win-back** note that references past work and asks for a 15-minute call.',
        '• Review **overdue** or **open balances** for these customers in Invoices before offers go out.'
      );
    }
  }

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(title),
      lines,
    },
    chat_cards: null,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Ignore tiny amounts when flagging ratio / “large” balances (reporting currency). */
const SNAPSHOT_MIN_BASE = 50;

type BusinessSnapshotNarrativeInput = {
  invoicedBase: number;
  collectedBase: number;
  overdueInvoiceCount: number;
  outstandingInBase: number;
};

function sumOutstandingInReportingCurrency(
  rows: { currency: string; amount: number }[],
  base: string
): number {
  const b = base.trim().toUpperCase();
  let s = 0;
  for (const r of rows) {
    if (String(r.currency ?? '').trim().toUpperCase() === b) s += Number(r.amount) || 0;
  }
  return s;
}

/**
 * Rule-based, deterministic copy: 1–2 short paragraphs + next steps (no LLM).
 * Priority for the second line: overdue risk → cash vs issuance gap → healthy AR.
 */
function buildBusinessSnapshotNarrative(inp: BusinessSnapshotNarrativeInput): {
  glanceLines: string[];
  actionLines: string[];
} {
  const { invoicedBase: inv, collectedBase: col, overdueInvoiceCount: od, outstandingInBase: ob } = inp;

  const p1 =
    'Issued revenue and collected cash use **different dates** (invoice issue vs payment), so they rarely match in one window — usually timing, not a mistake.';

  let p2: string | null = null;
  if (od >= 1) {
    p2 =
      od >= 10
        ? `**Risk:** ${od} overdue invoices — collection load is elevated.`
        : od >= 4
          ? `**Risk:** ${od} invoices are overdue — prioritize follow-up.`
          : od === 1
            ? '**Risk:** One invoice is overdue.'
            : `**Risk:** ${od} invoices are overdue.`;
  } else if (inv >= SNAPSHOT_MIN_BASE && col < inv * 0.35) {
    p2 =
      '**Signal:** Collected cash is low versus issued revenue in this window — often newer invoices or payments still arriving.';
  } else if (inv >= SNAPSHOT_MIN_BASE && col > inv * 1.2 && col >= SNAPSHOT_MIN_BASE) {
    p2 = '**Signal:** Collections are running above new issuance — typical when earlier invoices pay in this period.';
  } else if (ob >= SNAPSHOT_MIN_BASE) {
    p2 = 'Open balances are expected until paid; **none are overdue** right now.';
  }

  const glanceLines = p2 ? [p1, p2] : [p1];

  const actionLines: string[] = [];
  if (od >= 1) {
    actionLines.push('Follow up **overdue** invoices — reminders, calls, or payment links.');
    if (od >= 3) actionLines.push('Triage by **age** or **amount** and start with the worst.');
  }
  if (od === 0 && inv >= SNAPSHOT_MIN_BASE && col < inv * 0.35) {
    actionLines.push('Spot-check **recently issued** invoices that are still unpaid.');
  }
  if (ob >= SNAPSHOT_MIN_BASE && od === 0) {
    actionLines.push('Review **largest open balances** before they go overdue.');
  }
  if (actionLines.length === 0) {
    actionLines.push('Ask for **top customers** or a **by-day** breakdown to go deeper.');
  }
  if (actionLines.length > 3) actionLines.length = 3;

  return { glanceLines, actionLines };
}

/** Below this prior-period total (base currency), % change is noisy — emphasize $ delta. */
const CHANGE_BASELINE_SMALL = 100;
/** Above this |%|, show compact form and steer readers to absolute $. */
const PCT_EXTREME = 500;

function formatReadablePct(p: number): string {
  const abs = Math.abs(p);
  if (!Number.isFinite(p)) return '—';
  const sign = p >= 0 ? '+' : '−';
  if (abs >= 1000) {
    const rounded = Math.round(abs);
    return `${sign}${rounded.toLocaleString('en-US')}%`;
  }
  if (abs >= 100) return `${sign}${abs.toFixed(0)}%`;
  return `${sign}${abs.toFixed(1)}%`;
}

/**
 * Trust-first: absolute $ change first; % is secondary and capped/clarified when baseline is tiny or swing is extreme.
 */
function formatPeriodChangeLine(
  curr: number,
  prev: number,
  currency: string
): string {
  const delta = curr - prev;
  const absDelta = formatFinancialMoney(Math.abs(delta), currency);
  const signedMoney = delta >= 0 ? `+${absDelta}` : `−${absDelta}`;
  const dir = delta >= 0 ? 'increase' : 'decrease';

  if (Math.abs(delta) < 0.02 && Math.abs(prev) < 0.02) {
    return `**No material change**`;
  }

  // Near-zero prior: % is misleading — still show $ movement.
  if (prev < 0.02 && curr > 0.02) {
    return `${signedMoney} ${dir} vs prior (prior ~**${formatFinancialMoney(0, currency)}** — **use $ change**, not %)`;
  }

  const pctRaw = prev > 0.0001 ? (delta / prev) * 100 : NaN;

  if (prev < CHANGE_BASELINE_SMALL) {
    if (!Number.isFinite(pctRaw) || Math.abs(pctRaw) > PCT_EXTREME) {
      return `${signedMoney} ${dir} vs prior (≈**${formatReadablePct(pctRaw)}** — **small prior base**; trust **$**)`;
    }
    return `${signedMoney} ${dir} (**${formatReadablePct(pctRaw)}** vs prior; small baseline)`;
  }

  if (!Number.isFinite(pctRaw)) {
    return `${signedMoney} ${dir} vs prior`;
  }

  if (Math.abs(pctRaw) > PCT_EXTREME) {
    return `${signedMoney} ${dir} (≈**${formatReadablePct(pctRaw)}** ↑ — **$ change above is the reliable signal**)`;
  }

  return `${signedMoney} ${dir} (**${formatReadablePct(pctRaw)}** vs prior)`;
}

function formatInvoiceCountDeltaLine(curr: number, prev: number): string {
  const d = curr - prev;
  if (d === 0) return '**Flat** vs prior period';
  const dir = d > 0 ? 'up' : 'down';
  const pct = prev > 0 ? (d / prev) * 100 : NaN;
  const pctPart =
    Number.isFinite(pct) && Math.abs(pct) <= 500 ? ` — **${formatReadablePct(pct)}**` : '';
  return `**${curr}** vs **${prev}** (**${Math.abs(d)}** ${dir}${pctPart})`;
}

function detectPeriodComparisonAnomalies(args: {
  revCurr: number;
  revPrev: number;
  colCurr: number;
  colPrev: number;
  invCountCurr: number;
  invCountPrev: number;
}): string[] {
  const { revCurr, revPrev, colCurr, colPrev, invCountCurr, invCountPrev } = args;
  const out: string[] = [];

  if (invCountPrev >= 1 && invCountCurr < invCountPrev && revCurr > revPrev * 1.02) {
    out.push(
      '**Mix:** Fewer invoices issued but **higher revenue** — larger average ticket or fewer, bigger deals (not necessarily a problem).'
    );
  }
  if (invCountPrev >= 1 && invCountCurr > invCountPrev && revCurr < revPrev * 0.98) {
    out.push(
      '**Mix:** More invoices but **lower total revenue** — smaller jobs or partial periods; worth a quick sanity check.'
    );
  }

  if (revPrev >= CHANGE_BASELINE_SMALL) {
    const revPct = ((revCurr - revPrev) / revPrev) * 100;
    if (Number.isFinite(revPct) && Math.abs(revPct) > 150) {
      out.push(
        '**Swing:** Unusually large revenue move vs the prior window — confirm **one-off invoices**, **timing**, or **FX** if multi-currency.'
      );
    }
  }

  if (colPrev >= CHANGE_BASELINE_SMALL) {
    const colPct = ((colCurr - colPrev) / colPrev) * 100;
    if (Number.isFinite(colPct) && Math.abs(colPct) > 150) {
      out.push(
        '**Swing:** Large change in **collected** cash — payment timing can cluster; compare to **open/overdue** below.'
      );
    }
  }

  return out.slice(0, 2);
}

function sumOverdueInReportingCurrency(
  rows: { currency: string; amount: number }[],
  base: string
): number {
  const b = base.trim().toUpperCase();
  let s = 0;
  for (const r of rows) {
    if (String(r.currency ?? '').trim().toUpperCase() === b) s += Number(r.amount) || 0;
  }
  return s;
}

type PeriodComparisonInsightInput = {
  revCurr: number;
  revPrev: number;
  colCurr: number;
  colPrev: number;
  invCountCurr: number;
  invCountPrev: number;
  overdueCount: number;
  overdueInBase: number;
  baseCur: string;
};

function buildPeriodComparisonInsight(inp: PeriodComparisonInsightInput): string[] {
  const { revCurr, revPrev, colCurr, colPrev, overdueCount, overdueInBase, baseCur } = inp;
  const lines: string[] = [];

  lines.push(
    '**Accrual vs cash:** Revenue is **issued** totals in each window; collected is **payments received** — they intentionally diverge when billing leads payment.'
  );

  const revUp = revPrev > 0.0001 && revCurr > revPrev * 1.05;
  const revDown = revPrev > 0.0001 && revCurr < revPrev * 0.95;
  const colUp = colPrev > 0.0001 && colCurr > colPrev * 1.05;
  const colDown = colPrev > 0.0001 && colCurr < colPrev * 0.95;

  if (revUp && colDown) {
    lines.push(
      '**Cash lag risk:** Issuance is stronger than **cash in** — watch **DSO** and overdue; collections may land next period.'
    );
  } else if (revDown && colUp) {
    lines.push(
      '**Collections strength:** Cash outpaced new issuance — often prior-period invoices paying through.'
    );
  } else if (revUp && colUp) {
    lines.push('**Momentum:** Both **billing** and **cash** improved — growth with payment keeping pace (watch for timing).');
  } else if (revDown && colDown) {
    lines.push('**Soft patch:** Both metrics eased — seasonality, fewer days in window, or pipeline timing.');
  }

  if (overdueCount >= 1 && overdueInBase >= CHANGE_BASELINE_SMALL) {
    const odStr = formatFinancialMoney(overdueInBase, baseCur);
    lines.push(
      `**Overdue exposure:** **${overdueCount}** invoice${overdueCount === 1 ? '' : 's'} (**${odStr}** in ${baseCur}) — ${colDown ? 'collections cooled while ' : ''}past-due balances tie up working capital.`
    );
  } else if (overdueCount >= 3) {
    lines.push(`**Overdue load:** **${overdueCount}** open overdue items — prioritize follow-up before balances grow.`);
  }

  lines.push(...detectPeriodComparisonAnomalies(inp));

  if (lines.length > 4) lines.length = 4;
  return lines;
}

function buildPeriodComparisonActions(inp: PeriodComparisonInsightInput): string[] {
  const { overdueCount, colCurr, colPrev, revCurr, revPrev, overdueInBase, baseCur } = inp;
  const actions: string[] = [];

  if (overdueCount >= 1) {
    if (overdueInBase > 0.02) {
      actions.push(
        `Follow up **${overdueCount}** overdue invoice${overdueCount === 1 ? '' : 's'} (**${formatFinancialMoney(overdueInBase, baseCur)}** in ${baseCur}) — reminders or payment links.`
      );
    } else {
      actions.push('Follow up **overdue** invoices — start with oldest or largest balances.');
    }
  }
  if (actions.length < 3 && colCurr < colPrev * 0.9 && revCurr >= revPrev * 0.95) {
    actions.push('Monitor **payment progress** on recent issuances; cash may still be in flight.');
  }
  if (actions.length < 3 && overdueCount === 0 && revCurr > revPrev) {
    actions.push('Review **largest unpaid** invoices before due dates slip.');
  }
  if (actions.length < 2) {
    actions.push('Ask **show unpaid** or **top customers this month** for the next view.');
  }
  if (actions.length > 3) actions.length = 3;
  return actions;
}

async function loadPeriodKpis(
  ctx: AssistantRouterContext,
  window: ResolvedPaymentsTimeRange,
  spec: PaymentsNaturalRangeSpec,
  baseCur: string
): Promise<
  | { ok: true; invoiced: Awaited<ReturnType<typeof sumInvoicedRevenueInIssueDateRange>>; collectedBase: number }
  | { ok: false }
> {
  const { fromYmd, toYmd } = issueDateYmdBoundsFromPaymentsWindow(window);
  const fetchStartIso = collectedMetricFetchStartIso(spec, ctx.workspaceTimezone ?? null, new Date());
  const [invoiced, collectedMetric] = await Promise.all([
    sumInvoicedRevenueInIssueDateRange(ctx.supabase, ctx.businessId, fromYmd, toYmd, baseCur),
    loadCollectedRevenueMetricForBusiness(ctx.supabase, ctx.businessId, ctx.reportingCurrency, {
      fetchStartIso,
      paymentsWindow: window,
      surface: 'assistant',
      timezone: ctx.workspaceTimezone ?? null,
      dashboardPreset: dashboardPresetForRevenueSpec(spec),
    }),
  ]);
  if ('error' in collectedMetric) return { ok: false };
  return { ok: true, invoiced, collectedBase: collectedMetric.totalBase };
}

async function fetchTwoPeriodSnapshot(
  ctx: AssistantRouterContext,
  pair: { current: PaymentsNaturalRangeSpec; baseline: PaymentsNaturalRangeSpec }
): Promise<
  | {
      ok: true;
      wCur: ResolvedPaymentsTimeRange;
      wBase: ResolvedPaymentsTimeRange;
      pair: { current: PaymentsNaturalRangeSpec; baseline: PaymentsNaturalRangeSpec };
      curKpi: Extract<Awaited<ReturnType<typeof loadPeriodKpis>>, { ok: true }>;
      baseKpi: Extract<Awaited<ReturnType<typeof loadPeriodKpis>>, { ok: true }>;
      overdueAgg: Awaited<ReturnType<typeof aggregateOverdueInvoices>>;
      baseCur: string;
    }
  | { ok: false; reason: 'resolve' | 'load' }
> {
  const tz = ctx.workspaceTimezone ?? null;
  const now = new Date();
  const rc = resolvePaymentsReceivedTimeRange(pair.current, now, tz);
  const rb = resolvePaymentsReceivedTimeRange(pair.baseline, now, tz);
  if (!rc.ok || !rb.ok) return { ok: false, reason: 'resolve' };
  const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const wCur = rc.value;
  const wBase = rb.value;
  const [curKpi, baseKpi] = await Promise.all([
    loadPeriodKpis(ctx, wCur, pair.current, baseCur),
    loadPeriodKpis(ctx, wBase, pair.baseline, baseCur),
  ]);
  if (!curKpi.ok || !baseKpi.ok) return { ok: false, reason: 'load' };
  const overdueAgg = await aggregateOverdueInvoices(ctx.supabase, ctx.businessId, {
    workspaceTimezone: tz,
    baseCurrencyCode: baseCur,
  });
  return {
    ok: true,
    wCur,
    wBase,
    pair,
    curKpi,
    baseKpi,
    overdueAgg,
    baseCur,
  };
}

function growthDirectionSummary(
  revCurr: number,
  revPrev: number,
  colCurr: number,
  colPrev: number
): string {
  const revUp = revPrev > 0.0001 && revCurr > revPrev * 1.02;
  const revDown = revPrev > 0.0001 && revCurr < revPrev * 0.98;
  const colUp = colPrev > 0.0001 && colCurr > colPrev * 1.02;
  const colDown = colPrev > 0.0001 && colCurr < colPrev * 0.98;
  if (revUp && colUp) return '**Growing** on both issued revenue and cash collected vs last month.';
  if (revDown && colDown) return '**Softening** vs last month on both issuance and cash.';
  if (revUp && colDown) {
    return '**Mixed:** issuance up, cash down — collections may lag new billing; watch overdue.';
  }
  if (revDown && colUp) {
    return '**Mixed:** lighter issuance, stronger cash — often payments on prior work landing now.';
  }
  return '**Flat to mixed** — moves are within typical month-to-month variance.';
}

/** Executive growth question — defaults to this month vs last month. */
async function handleGrowthCheckTurn(ctx: AssistantRouterContext) {
  const pair =
    ctx.structuredQuery?.filters?.periodComparison ?? ({
      current: { kind: 'this_month' },
      baseline: { kind: 'last_month' },
    } as { current: PaymentsNaturalRangeSpec; baseline: PaymentsNaturalRangeSpec });

  const snap = await fetchTwoPeriodSnapshot(ctx, pair);
  if (!snap.ok) {
    const lines =
      snap.reason === 'resolve'
        ? ['Could not resolve **this month** vs **last month**. Try again.']
        : ["Couldn't load metrics. Try again shortly."];
    if (snap.reason === 'load') console.error('[growth-check] collected metric load failed');
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Growth'),
        lines,
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const { wCur, wBase, curKpi, baseKpi, overdueAgg, baseCur } = snap;
  const revChangeLine = formatPeriodChangeLine(
    curKpi.invoiced.totalBase,
    baseKpi.invoiced.totalBase,
    baseCur
  );
  const colChangeLine = formatPeriodChangeLine(
    curKpi.collectedBase,
    baseKpi.collectedBase,
    baseCur
  );
  const overdueInBase = sumOverdueInReportingCurrency(overdueAgg.byCurrency, baseCur);

  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, { baseCurrencyCode: ctx.reportingCurrency })
      : undefined;
  const pseudo = paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wCur));
  const metricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_collected_total',
      currentResultType: 'currency_summary',
    },
    aq,
    'collected_revenue'
  );

  const glance: string[] = [
    'Issued revenue uses **invoice issue dates**; collected uses **payment dates** — both can diverge.',
  ];
  if (overdueAgg.invoiceCount >= 4) {
    glance.push(
      `**Risk:** **${overdueAgg.invoiceCount}** overdue — growth reads worse if cash is stuck in AR.`
    );
  }

  const lines: string[] = [
    'Comparing **this month** to **last month** (say a different range if you need it).',
    '',
    assistantBoldLine('Revenue (issued)'),
    `${assistantBoldLine('Change vs last month')}: ${revChangeLine}`,
    '',
    assistantBoldLine('Collected (payments)'),
    `${assistantBoldLine('Change vs last month')}: ${colChangeLine}`,
    '',
    assistantBoldLine('Direction'),
    growthDirectionSummary(
      curKpi.invoiced.totalBase,
      baseKpi.invoiced.totalBase,
      curKpi.collectedBase,
      baseKpi.collectedBase
    ),
    '',
    assistantBoldLine('Overdue (now)'),
    `${overdueAgg.invoiceCount} invoice${overdueAgg.invoiceCount === 1 ? '' : 's'} past due` +
      (overdueInBase > 0.02 ? ` · **${formatFinancialMoney(overdueInBase, baseCur)}** in ${baseCur}` : ''),
    '',
    assistantBoldLine('At a glance'),
    ...glance,
    '',
    assistantBoldLine('Suggested next steps'),
    '• Ask **compare this month vs last month** for the full breakdown.',
    '• Say **show unpaid** or **top customers this month** to go deeper.',
  ];

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine('Growth check'),
      lines,
    },
    chat_cards: null,
    quick_replies: revenueProgressiveQuickReplies(wCur),
    metric_session_context: metricCtx,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

type RevenueWhyDriverInput = {
  revCurr: number;
  revPrev: number;
  invCurr: number;
  invPrev: number;
  maxCurr: number;
  maxPrev: number;
  topCurr: InvoicedCustomerShareRow[];
  topPrev: InvoicedCustomerShareRow[];
  colCurr: number;
  colPrev: number;
  labelBase: string;
  baseCur: string;
};

function buildRevenueWhyDiagnosticSections(inp: RevenueWhyDriverInput): {
  assumption: string | null;
  why: string[];
  actions: string[];
} {
  const {
    revCurr,
    revPrev,
    invCurr,
    invPrev,
    maxCurr,
    maxPrev,
    topCurr,
    topPrev,
    colCurr,
    colPrev,
    labelBase,
    baseCur,
  } = inp;

  const materiallyDown = revPrev > 0.02 && revCurr < revPrev * 0.995;
  const materiallyUp = revPrev > 0.02 && revCurr > revPrev * 1.005;
  const roughlyFlat =
    revPrev > 0.02 && revCurr >= revPrev * 0.995 && revCurr <= revPrev * 1.005;

  let assumption: string | null = null;
  if (!materiallyDown) {
    if (materiallyUp) {
      assumption = `**Revenue is not down** — it is **up** compared to **${labelBase}**.`;
    } else if (roughlyFlat) {
      assumption = `**Revenue is not down** — issued revenue is **about the same** as **${labelBase}**.`;
    } else if (revPrev < 0.02) {
      assumption = `**Revenue is not down** — the prior window was very small, so treat **$ change** as the main signal.`;
    } else {
      assumption = `**Revenue is not down** vs **${labelBase}** on issued invoices.`;
    }
  }

  const why: string[] = [];
  if (materiallyDown) {
    const avgCurr = invCurr > 0 ? revCurr / invCurr : 0;
    const avgPrev = invPrev > 0 ? revPrev / invPrev : 0;
    const fewerInv = invPrev >= 1 && invCurr < invPrev * 0.95;
    const lowerAvg = avgPrev > 0.02 && avgCurr < avgPrev * 0.95;

    if (fewerInv && lowerAvg) {
      why.push(
        '**Explanation:** **Fewer invoices** and a lower **average invoice size** vs the prior window likely explain most of the decline.'
      );
    } else if (fewerInv && !lowerAvg) {
      why.push(
        '**Explanation:** **Volume** dropped (fewer invoices issued); average ticket did not offset the gap.'
      );
    } else if (!fewerInv && lowerAvg) {
      why.push(
        '**Explanation:** **Average deal size** fell while invoice **count** held — check discounts, smaller scopes, or customer mix.'
      );
    } else {
      why.push('**Explanation:** The gap is a **mix** of invoice count and average size — see the figures above.');
    }

    if (maxPrev > 0.02 && maxCurr < maxPrev * 0.65) {
      why.push(
        `**Large invoices:** This period’s **largest single invoice** (**${formatFinancialMoney(maxCurr, baseCur)}**) is much smaller than last period’s peak (**${formatFinancialMoney(maxPrev, baseCur)}**) — **timing** of big deals often swings totals.`
      );
    }

    const t1c = topCurr[0];
    const t1p = topPrev[0];
    if (t1c && t1p) {
      const same =
        t1c.displayLabel.trim().toLowerCase() === t1p.displayLabel.trim().toLowerCase();
      if (same && t1p.totalBase > revPrev * 0.15 && t1c.totalBase < t1p.totalBase * 0.75) {
        why.push(
          `**Customer concentration:** **${t1c.displayLabel}** billed materially less this period than last — your top account moved.`
        );
      } else if (!same && t1p.totalBase > revPrev * 0.3) {
        why.push(
          '**Customer mix:** The **top customer by issuance** differs vs last period — revenue shifted across accounts.'
        );
      }
    }

    if (revCurr < revPrev * 0.95 && colPrev > 0.02 && colCurr > colPrev * 1.05) {
      why.push(
        '**Cash vs issuance:** **Collected** cash rose while **issued** revenue fell — accrual (issue dates) can diverge from bank deposits.'
      );
    }
  } else {
    why.push(
      `If results still **feel** weak, compare **collected cash** or check **pipeline** — issuance is only one lens vs **${labelBase}**.`
    );
  }

  const actions: string[] = [];
  if (materiallyDown) {
    actions.push('Review **invoices issued** in each window — confirm any **large** bill missing or dated next month.');
    actions.push('Ask **top customers this month** and compare concentration to the prior window.');
    if (colCurr < colPrev * 0.9) {
      actions.push('Say **show unpaid** or **compare periods** on **collected** if cash is the concern.');
    }
  } else {
    actions.push('Ask **compare this month vs last month** for **issued vs collected** side by side.');
    actions.push('Use **top customers** to see whether **mix** shifted even when totals are flat or up.');
  }
  if (actions.length > 3) actions.length = 3;

  return { assumption, why, actions };
}

/** “Why is revenue down?” — deterministic diagnosis vs a prior window (defaults to this month vs last month). */
async function handleRevenueWhyDiagnosticTurn(ctx: AssistantRouterContext) {
  const lower = ctx.userText.trim().toLowerCase();
  const pair =
    ctx.structuredQuery?.filters?.periodComparison ??
    tryParsePeriodComparisonPair(lower) ?? {
      current: { kind: 'this_month' as const },
      baseline: { kind: 'last_month' as const },
    };

  const snap = await fetchTwoPeriodSnapshot(ctx, pair);
  if (!snap.ok) {
    const lines =
      snap.reason === 'resolve'
        ? ['Could not resolve the comparison windows. Try **this month vs last month** or name both periods clearly.']
        : ["Couldn't load metrics. Try again shortly."];
    if (snap.reason === 'load') console.error('[revenue-why-diagnostic] collected metric load failed');
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Revenue diagnostic'),
        lines,
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const { wCur, wBase, curKpi, baseKpi, baseCur } = snap;
  const labelCur = assistantAnalyticsPeriodTitleSuffix(
    paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wCur))
  );
  const labelBase = assistantAnalyticsPeriodTitleSuffix(
    paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wBase))
  );

  const yCur = issueDateYmdBoundsFromPaymentsWindow(wCur);
  const yBase = issueDateYmdBoundsFromPaymentsWindow(wBase);

  const [topCurr, topPrev, maxCurr, maxPrev] = await Promise.all([
    aggregateInvoicedRevenueByCustomerInIssueDateRange(
      ctx.supabase,
      ctx.businessId,
      yCur.fromYmd,
      yCur.toYmd,
      baseCur
    ),
    aggregateInvoicedRevenueByCustomerInIssueDateRange(
      ctx.supabase,
      ctx.businessId,
      yBase.fromYmd,
      yBase.toYmd,
      baseCur
    ),
    maxInvoiceBaseInIssueDateRange(ctx.supabase, ctx.businessId, yCur.fromYmd, yCur.toYmd, baseCur),
    maxInvoiceBaseInIssueDateRange(ctx.supabase, ctx.businessId, yBase.fromYmd, yBase.toYmd, baseCur),
  ]);

  const revCurr = curKpi.invoiced.totalBase;
  const revPrev = baseKpi.invoiced.totalBase;
  const invCurr = curKpi.invoiced.invoiceCount;
  const invPrev = baseKpi.invoiced.invoiceCount;
  const colCurr = curKpi.collectedBase;
  const colPrev = baseKpi.collectedBase;

  const revLine = formatPeriodChangeLine(revCurr, revPrev, baseCur);
  const avgCurr = invCurr > 0 ? revCurr / invCurr : 0;
  const avgPrev = invPrev > 0 ? revPrev / invPrev : 0;
  const avgLine = formatPeriodChangeLine(avgCurr, avgPrev, baseCur);
  const invDelta = invCurr - invPrev;
  const invDeltaWord = invDelta === 0 ? 'flat' : `${invDelta > 0 ? '+' : '−'}${Math.abs(invDelta)} vs prior`;

  const narrative = buildRevenueWhyDiagnosticSections({
    revCurr,
    revPrev,
    invCurr,
    invPrev,
    maxCurr,
    maxPrev,
    topCurr,
    topPrev,
    colCurr,
    colPrev,
    labelBase,
    baseCur,
  });

  const lines: string[] = [
    assistantBoldLine('A. Comparison summary'),
    `**${labelCur}** vs **${labelBase}** — issued revenue is summed on **invoice issue dates** (accrual-style).`,
    '',
    assistantBoldLine('B. What changed'),
    `${assistantBoldLine('Issued revenue')}: ${revLine}`,
    `${assistantBoldLine('Invoices issued')}: **${invCurr}** vs **${invPrev}** (${invDeltaWord})`,
    `${assistantBoldLine('Avg invoice size')}: **${formatFinancialMoney(avgCurr, baseCur)}** vs **${formatFinancialMoney(avgPrev, baseCur)}** (${avgLine})`,
    `${assistantBoldLine('Collected cash')}: ${formatPeriodChangeLine(colCurr, colPrev, baseCur)} (payments by **date received**)`,
  ];

  if (maxPrev > 0.02 || maxCurr > 0.02) {
    lines.push(
      `${assistantBoldLine('Largest single invoice')}: **${formatFinancialMoney(maxCurr, baseCur)}** vs **${formatFinancialMoney(maxPrev, baseCur)}**`
    );
  }

  const tc = topCurr.slice(0, 3);
  const tp = topPrev.slice(0, 3);
  lines.push('');
  lines.push(assistantBoldLine('Customer contribution (issued, top 3)'));
  lines.push(
    `**${labelCur}:** ` +
      (tc.length
        ? tc.map((r) => `**${r.displayLabel}** ${formatFinancialMoney(r.totalBase, baseCur)}`).join(' · ')
        : '—')
  );
  lines.push(
    `**${labelBase}:** ` +
      (tp.length
        ? tp.map((r) => `**${r.displayLabel}** ${formatFinancialMoney(r.totalBase, baseCur)}`).join(' · ')
        : '—')
  );

  lines.push('');
  lines.push(assistantBoldLine('C. Why'));
  if (narrative.assumption) {
    lines.push(narrative.assumption);
    lines.push('');
  }
  for (const w of narrative.why) lines.push(w);

  lines.push('');
  lines.push(assistantBoldLine('D. Suggested actions'));
  for (const a of narrative.actions) lines.push(`• ${a}`);

  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, { baseCurrencyCode: ctx.reportingCurrency })
      : undefined;
  const pseudo = paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wCur));
  const metricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_collected_total',
      currentResultType: 'currency_summary',
    },
    aq,
    'collected_revenue'
  );

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine('Why revenue moved'),
      lines,
    },
    chat_cards: null,
    quick_replies: revenueProgressiveQuickReplies(wCur),
    metric_session_context: metricCtx,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Compare two resolved periods: revenue + collected with % change; optional overdue snapshot. */
async function handlePeriodComparisonTurn(ctx: AssistantRouterContext) {
  const lower = ctx.userText.trim().toLowerCase();
  const pair = ctx.structuredQuery?.filters?.periodComparison ?? tryParsePeriodComparisonPair(lower);
  if (!pair) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Compare periods'),
        lines: [
          'Try **compare this month vs last month**, **this week vs last week**, or **today vs yesterday**.',
        ],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const snap = await fetchTwoPeriodSnapshot(ctx, pair);
  if (!snap.ok) {
    if (snap.reason === 'resolve') {
      return buildWizardShellResponse({
        ...shell(ctx),
        assistant_lines: [],
        assistant_structured: {
          title: assistantBoldLine('Compare periods'),
          lines: ['Could not resolve those periods. Try again with a clearer range.'],
        },
        chat_cards: null,
        pending_customer_context: null,
        customer_edit_session: null,
      });
    }
    console.error('[period-comparison] collected metric load failed');
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Compare periods'),
        lines: ["Couldn't load metrics for one or both periods. Try again shortly."],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const { wCur, wBase, curKpi, baseKpi, overdueAgg, baseCur } = snap;

  const labelCur = assistantAnalyticsPeriodTitleSuffix(
    paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wCur))
  );
  const labelBase = assistantAnalyticsPeriodTitleSuffix(
    paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wBase))
  );

  const revChangeLine = formatPeriodChangeLine(
    curKpi.invoiced.totalBase,
    baseKpi.invoiced.totalBase,
    baseCur
  );
  const colChangeLine = formatPeriodChangeLine(
    curKpi.collectedBase,
    baseKpi.collectedBase,
    baseCur
  );

  const overdueInBase = sumOverdueInReportingCurrency(overdueAgg.byCurrency, baseCur);

  const insightInput: PeriodComparisonInsightInput = {
    revCurr: curKpi.invoiced.totalBase,
    revPrev: baseKpi.invoiced.totalBase,
    colCurr: curKpi.collectedBase,
    colPrev: baseKpi.collectedBase,
    invCountCurr: curKpi.invoiced.invoiceCount,
    invCountPrev: baseKpi.invoiced.invoiceCount,
    overdueCount: overdueAgg.invoiceCount,
    overdueInBase,
    baseCur,
  };

  const insightLines = buildPeriodComparisonInsight(insightInput);
  const actionLines = buildPeriodComparisonActions(insightInput);

  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, { baseCurrencyCode: ctx.reportingCurrency })
      : undefined;
  const pseudo = paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wCur));
  const metricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_collected_total',
      currentResultType: 'currency_summary',
    },
    aq,
    'collected_revenue'
  );

  const lines: string[] = [
    assistantBoldLine('Revenue (issued)'),
    `${assistantBoldLine(labelBase)}: ${formatFinancialMoney(baseKpi.invoiced.totalBase, baseCur)} · ${baseKpi.invoiced.invoiceCount} issued`,
    `${assistantBoldLine(labelCur)}: ${formatFinancialMoney(curKpi.invoiced.totalBase, baseCur)} · ${curKpi.invoiced.invoiceCount} issued`,
    `${assistantBoldLine('Change vs prior')}: ${revChangeLine}`,
    '',
    assistantBoldLine('Collected (payments received)'),
    `${assistantBoldLine(labelBase)}: ${formatFinancialMoney(baseKpi.collectedBase, baseCur)}`,
    `${assistantBoldLine(labelCur)}: ${formatFinancialMoney(curKpi.collectedBase, baseCur)}`,
    `${assistantBoldLine('Change vs prior')}: ${colChangeLine}`,
    '',
    assistantBoldLine('Overdue (now)'),
    `${overdueAgg.invoiceCount} invoice${overdueAgg.invoiceCount === 1 ? '' : 's'} past due` +
      (overdueInBase > 0.02 ? ` · **${formatFinancialMoney(overdueInBase, baseCur)}** in ${baseCur}` : ''),
    ...(overdueAgg.byCurrency.length > 0
      ? overdueAgg.byCurrency.map(
          (r) => `${assistantBoldLine(r.currency)} — ${formatFinancialMoney(r.amount, r.currency)}`
        )
      : overdueAgg.invoiceCount === 0
        ? ['None']
        : []),
    '',
    assistantBoldLine('At a glance'),
    ...insightLines,
    '',
    assistantBoldLine('Suggested next steps'),
    ...actionLines.map((a) => `• ${a}`),
  ];

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Period comparison — ${labelCur} vs ${labelBase}`),
      lines,
    },
    chat_cards: null,
    quick_replies: revenueProgressiveQuickReplies(wCur),
    metric_session_context: metricCtx,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** “What changed?” — defaults to **this week vs last week**; same engine as period comparison + insight layer. */
async function handleWhatChangedSummaryTurn(ctx: AssistantRouterContext) {
  const lower = ctx.userText.trim().toLowerCase();
  const pair =
    ctx.structuredQuery?.filters?.periodComparison ??
    tryParsePeriodComparisonPair(lower) ??
    tryInferDefaultPeriodComparisonForChangeQuery(lower) ?? {
      current: { kind: 'this_week' as const },
      baseline: { kind: 'last_week' as const },
    };

  const snap = await fetchTwoPeriodSnapshot(ctx, pair);
  if (!snap.ok) {
    const lines =
      snap.reason === 'resolve'
        ? [
            'Could not resolve the comparison windows. Try **this week vs last week** or **this month vs last month**.',
          ]
        : ["Couldn't load metrics. Try again shortly."];
    if (snap.reason === 'load') console.error('[what-changed-summary] collected metric load failed');
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('What changed'),
        lines,
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const { wCur, wBase, curKpi, baseKpi, overdueAgg, baseCur } = snap;
  const labelCur = assistantAnalyticsPeriodTitleSuffix(
    paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wCur))
  );
  const labelBase = assistantAnalyticsPeriodTitleSuffix(
    paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wBase))
  );

  const revChangeLine = formatPeriodChangeLine(
    curKpi.invoiced.totalBase,
    baseKpi.invoiced.totalBase,
    baseCur
  );
  const colChangeLine = formatPeriodChangeLine(
    curKpi.collectedBase,
    baseKpi.collectedBase,
    baseCur
  );
  const invDeltaLine = formatInvoiceCountDeltaLine(
    curKpi.invoiced.invoiceCount,
    baseKpi.invoiced.invoiceCount
  );

  const overdueInBase = sumOverdueInReportingCurrency(overdueAgg.byCurrency, baseCur);

  const insightInput: PeriodComparisonInsightInput = {
    revCurr: curKpi.invoiced.totalBase,
    revPrev: baseKpi.invoiced.totalBase,
    colCurr: curKpi.collectedBase,
    colPrev: baseKpi.collectedBase,
    invCountCurr: curKpi.invoiced.invoiceCount,
    invCountPrev: baseKpi.invoiced.invoiceCount,
    overdueCount: overdueAgg.invoiceCount,
    overdueInBase,
    baseCur,
  };

  const insightLines = buildPeriodComparisonInsight(insightInput);
  const actionLines = buildPeriodComparisonActions(insightInput);

  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, { baseCurrencyCode: ctx.reportingCurrency })
      : undefined;
  const pseudo = paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(wCur));
  const metricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_collected_total',
      currentResultType: 'currency_summary',
    },
    aq,
    'collected_revenue'
  );

  const lines: string[] = [
    `Comparing **${labelCur}** to **${labelBase}** — issued revenue uses **issue dates**; collected uses **payment dates**.`,
    '',
    assistantBoldLine('Comparison metrics'),
    `${assistantBoldLine('Revenue (issued)')}: ${formatFinancialMoney(baseKpi.invoiced.totalBase, baseCur)} → **${formatFinancialMoney(curKpi.invoiced.totalBase, baseCur)}** · ${revChangeLine}`,
    `${assistantBoldLine('Collected (cash)')}: ${formatFinancialMoney(baseKpi.collectedBase, baseCur)} → **${formatFinancialMoney(curKpi.collectedBase, baseCur)}** · ${colChangeLine}`,
    `${assistantBoldLine('Invoices issued')}: ${invDeltaLine}`,
    `${assistantBoldLine('Overdue (now)')}: **${overdueAgg.invoiceCount}** past due` +
      (overdueInBase > 0.02 ? ` · **${formatFinancialMoney(overdueInBase, baseCur)}** in ${baseCur}` : '') +
      ' — **point-in-time** snapshot (not tied to the week window).',
    '',
    assistantBoldLine('Summary of changes'),
    `• **Revenue:** ${revChangeLine}`,
    `• **Collected:** ${colChangeLine}`,
    `• **Invoice volume:** ${invDeltaLine}`,
    '',
    assistantBoldLine('Insight'),
    ...insightLines,
    '',
    assistantBoldLine('Recommended actions'),
    ...actionLines.map((a) => `• ${a}`),
  ];

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine('What changed'),
      lines,
    },
    chat_cards: null,
    quick_replies: revenueProgressiveQuickReplies(wCur),
    metric_session_context: metricCtx,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/**
 * Rank customers by collected amount in reporting currency; fallback to largest single-currency row per customer.
 */
function rankTopCustomersByCollected(
  rows: CollectedRevenueByCustomerRow[],
  reportingCurrency: string,
  limit: number
): { groupKey: string; label: string; total: number; currency: string }[] {
  const base = (reportingCurrency || 'USD').trim().toUpperCase() || 'USD';
  const byKey = new Map<string, { label: string; total: number }>();
  for (const r of rows) {
    if (r.currency.trim().toUpperCase() !== base) continue;
    const prev = byKey.get(r.groupKey) ?? { label: r.customerLabel, total: 0 };
    prev.total += r.totalCollected;
    byKey.set(r.groupKey, prev);
  }
  const inBase = Array.from(byKey.entries())
    .filter(([, x]) => x.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, limit)
    .map(([groupKey, x]) => ({
      groupKey,
      label: x.label,
      total: x.total,
      currency: base,
    }));

  if (inBase.length > 0) return inBase;

  const best = new Map<string, CollectedRevenueByCustomerRow>();
  for (const r of rows) {
    const cur = best.get(r.groupKey);
    if (!cur || r.totalCollected > cur.totalCollected) best.set(r.groupKey, r);
  }
  return Array.from(best.values())
    .sort((a, b) => b.totalCollected - a.totalCollected)
    .slice(0, limit)
    .map((r) => ({
      groupKey: r.groupKey,
      label: r.customerLabel,
      total: r.totalCollected,
      currency: r.currency.trim().toUpperCase() || 'USD',
    }));
}

function shell(ctx: AssistantRouterContext) {
  return {
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    pending_invoice_lookup: null,
  };
}

function inferCustomerSpendingComparisonDirection(lower: string): 'up' | 'down' {
  const up =
    /\b(increased|increase|increasing|more|growing|grew|growth|gainers?|higher|larger)\b/i.test(lower);
  const down =
    /\b(decreased|decrease|decreasing|less|shrinking|shrank|declined|declining|losers?|lower|smaller)\b/i.test(
      lower
    );
  if (down && !up) return 'down';
  return 'up';
}

function totalsByCustomerGroupInReportingBase(
  rows: CollectedRevenueByCustomerRow[],
  reportingCurrency: string
): Map<string, { label: string; total: number }> {
  const base = (reportingCurrency || 'USD').trim().toUpperCase() || 'USD';
  const map = new Map<string, { label: string; total: number }>();
  for (const r of rows) {
    if (r.currency.trim().toUpperCase() !== base) continue;
    const prev = map.get(r.groupKey) ?? { label: r.customerLabel, total: 0 };
    prev.total += r.totalCollected;
    if (r.customerLabel && r.customerLabel !== 'Unknown customer') prev.label = r.customerLabel;
    map.set(r.groupKey, prev);
  }
  return map;
}

/** Collected cash by customer: this period vs baseline (default this month vs last month). */
async function handleCustomerSpendingComparisonTurn(ctx: AssistantRouterContext) {
  const lower = ctx.userText.trim().toLowerCase();
  const pair =
    ctx.structuredQuery?.filters?.periodComparison ??
    tryParsePeriodComparisonPair(lower) ??
    tryInferDefaultPeriodComparisonForChangeQuery(lower) ?? {
      current: { kind: 'this_month' as const },
      baseline: { kind: 'last_month' as const },
    };

  const tz = ctx.workspaceTimezone ?? null;
  const now = new Date();
  const rc = resolvePaymentsReceivedTimeRange(pair.current, now, tz);
  const rb = resolvePaymentsReceivedTimeRange(pair.baseline, now, tz);
  if (!rc.ok || !rb.ok) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Customer spending'),
        lines: [
          'Could not resolve the comparison periods. Try **this month vs last month** or name both windows.',
        ],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const utcCur = resolvedPaymentsWindowToPaidUtc(rc.value);
  const utcBase = resolvedPaymentsWindowToPaidUtc(rb.value);
  const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';

  const [rowsCur, rowsBase] = await Promise.all([
    aggregateCollectedRevenueByCustomerInUtcWindow(ctx.supabase, ctx.businessId, utcCur, baseCur),
    aggregateCollectedRevenueByCustomerInUtcWindow(ctx.supabase, ctx.businessId, utcBase, baseCur),
  ]);

  const totalsCurr = totalsByCustomerGroupInReportingBase(rowsCur, baseCur);
  const totalsPrev = totalsByCustomerGroupInReportingBase(rowsBase, baseCur);

  const direction = inferCustomerSpendingComparisonDirection(lower);
  const keys = new Set<string>([...totalsCurr.keys(), ...totalsPrev.keys()]);
  const deltas: { label: string; prev: number; curr: number; delta: number }[] = [];
  for (const k of keys) {
    const p = totalsPrev.get(k) ?? { label: 'Unknown customer', total: 0 };
    const c = totalsCurr.get(k) ?? { label: p.label, total: 0 };
    const label = c.label !== 'Unknown customer' ? c.label : p.label;
    deltas.push({ label, prev: p.total, curr: c.total, delta: c.total - p.total });
  }

  const minDelta = 0.02;
  const filtered =
    direction === 'up'
      ? deltas.filter((d) => d.delta > minDelta)
      : deltas.filter((d) => d.delta < -minDelta);
  filtered.sort((a, b) => (direction === 'up' ? b.delta - a.delta : a.delta - b.delta));
  const ranked = filtered.slice(0, CUSTOMER_SPENDING_COMPARISON_LIMIT);

  const labelCur = assistantAnalyticsPeriodTitleSuffix(paidUtcToResolvedPaymentsShape(utcCur));
  const labelBase = assistantAnalyticsPeriodTitleSuffix(paidUtcToResolvedPaymentsShape(utcBase));

  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, { baseCurrencyCode: ctx.reportingCurrency })
      : undefined;
  const pseudo = paidUtcToResolvedPaymentsShape(utcCur);
  const metricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_breakdown_by_customer',
      currentResultType: 'customer_breakdown',
    },
    aq,
    'collected_revenue'
  );
  const metricCtxWithPending: typeof metricCtx = {
    ...metricCtx,
    pending_followup_choice: {
      kind: 'drilldown_dimension',
      prompt: 'would you like it by invoice or by day?',
      options: ['invoice', 'day'],
    },
  };

  const periodLine = formatFinancialPeriodLine(utcCur.startIso, utcCur.endIso, utcCur.timezone);

  if (ranked.length === 0) {
    const dirWord = direction === 'up' ? 'increased' : 'decreased';
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Customers — ${dirWord} spending`),
        lines: [
          `No customers with **${dirWord}** collected cash in **${baseCur}** between **${labelBase}** and **${labelCur}** (by payment date).`,
          '',
          `**Metric:** collected amount · **${labelCur}** vs **${labelBase}**`,
          '',
          'Try **top customers this month** for absolute totals, or **compare this month vs last month** workspace-wide.',
          '',
          assistantBoldLine(periodLine),
        ],
      },
      chat_cards: null,
      quick_replies: revenueProgressiveQuickReplies(utcCur),
      metric_session_context: metricCtx,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const arrow = direction === 'up' ? '↑' : '↓';
  const lines: string[] = [
    `**Collected cash** (payment date) in **${baseCur}**: **${labelCur}** vs **${labelBase}**.`,
    '',
    assistantBoldLine('Ranked by change'),
  ];
  ranked.forEach((r, i) => {
    const sign = r.delta >= 0 ? '+' : '−';
    lines.push(
      `${i + 1}. ${assistantBoldLine(r.label)} — ${arrow} **${sign}${formatFinancialMoney(Math.abs(r.delta), baseCur)}** (${formatFinancialMoney(r.prev, baseCur)} → ${formatFinancialMoney(r.curr, baseCur)})`
    );
  });

  const top = ranked[0];
  const insightTop =
    top && ranked.length > 1
      ? `**${top.label}** led the move — **${formatFinancialMoney(Math.abs(top.delta), baseCur)}** ${direction === 'up' ? 'added' : 'removed'} vs prior period.`
      : top
        ? `**${top.label}** drives the largest move in this list.`
        : '';

  lines.push('');
  lines.push(assistantBoldLine('Insight'));
  lines.push(
    insightTop ||
      'Compare **payment timing**: swings often reflect **when invoices were paid**, not only new billing.',
    '**Pattern:** A few large deltas usually mean **concentration** or **one-off payments**; many small lifts suggest broader activity.'
  );
  lines.push('', assistantBoldLine('Suggested actions'));
  lines.push(
    '• Ask **show unpaid** if cash feels tight despite strong issuance.',
    '• Use **top customers this month** for absolute collected totals.',
    REVENUE_BY_CUSTOMER_FOLLOW_UP,
    '',
    assistantBoldLine(periodLine)
  );

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(
        direction === 'up' ? 'Customers — increased spending' : 'Customers — decreased spending'
      ),
      lines,
    },
    chat_cards: null,
    quick_replies: revenueByCustomerProgressiveQuickReplies(utcCur),
    metric_session_context: metricCtxWithPending,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Collected revenue by payment date — same ledger as dashboard collected metrics. */
async function handleTopCustomersTurn(ctx: AssistantRouterContext) {
  const tz = ctx.workspaceTimezone ?? null;
  const now = new Date();
  const resolved = resolveFinancialDateRangeFromUserText(ctx.userText, tz, now);
  if (!resolved) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Top customers'),
        lines: ['Could not resolve a time period. Try adding a phrase like “this month” or “last 30 days”.'],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const utc = resolvedPaymentsWindowToPaidUtc(resolved);
  const rows = await aggregateCollectedRevenueByCustomerInUtcWindow(
    ctx.supabase,
    ctx.businessId,
    utc,
    ctx.reportingCurrency
  );
  const pseudo = paidUtcToResolvedPaymentsShape(utc);
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(utc.startIso, utc.endIso, utc.timezone);
  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, {
          baseCurrencyCode: ctx.reportingCurrency,
        })
      : undefined;
  const ranked = rankTopCustomersByCollected(rows, ctx.reportingCurrency, TOP_CUSTOMERS_LIMIT);

  const scopedKeys = ranked.map((r) => r.groupKey);
  const baseMetricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_breakdown_by_customer',
      currentResultType: 'customer_breakdown',
    },
    aq,
    'collected_revenue'
  );
  const metricCtx =
    scopedKeys.length > 0
      ? {
          ...baseMetricCtx,
          report_parent_kind: 'top_customers' as const,
          scoped_customer_group_keys: scopedKeys,
        }
      : baseMetricCtx;

  if (ranked.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine(`Top customers — ${titleSuffix}`),
        lines: [
          'No collected revenue in this period (by payment date).',
          assistantBoldLine(periodLine),
          REVENUE_BY_CUSTOMER_FOLLOW_UP,
        ],
      },
      chat_cards: null,
      metric_session_context: metricCtx,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const lines: string[] = [
    `Ranked by **collected amount** in **${ctx.reportingCurrency}** (payments in this period).`,
    '',
  ];
  ranked.forEach((r, i) => {
    lines.push(
      `${i + 1}. ${assistantBoldLine(r.label)} — ${assistantBoldLine(formatFinancialMoney(r.total, r.currency))}`
    );
  });
  lines.push('', assistantBoldLine(periodLine), REVENUE_BY_CUSTOMER_FOLLOW_UP);

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Top customers — ${titleSuffix}`),
      lines,
    },
    chat_cards: null,
    metric_session_context: metricCtx,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

async function handleCustomerHistoryTurn(ctx: AssistantRouterContext) {
  const hint = ctx.structuredQuery?.filters?.customerNameHint?.trim() ?? '';
  if (!hint) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Customer history'),
        lines: ['Say which customer, e.g. **Customer history for Acme LLC**.'],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const { rows: matches } = await findCustomerRecordsByName(ctx.supabase, ctx.businessId, hint);
  if (matches.length === 0) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Customer not found'),
        lines: [
          `No customer matched **${hint}**.`,
          '',
          'Try the exact company name, or say **view customer …** to open a profile.',
        ],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  if (matches.length > 1) {
    const body = matches.slice(0, 8).map((o, i) => {
      const em = o.email?.trim() ? ` — ${o.email.trim()}` : '';
      return `${i + 1}. ${o.display_name}${em}`;
    });
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Which customer?'),
        lines: [
          'I found a few matches:',
          '',
          ...body,
          '',
          'Reply with the number or the full name to see history.',
        ],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const customerId = matches[0]!.id;
  const displayName = matches[0]!.display_name.trim() || 'Customer';

  const { count: totalCount, error: countErr } = await ctx.supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', ctx.businessId)
    .eq('customer_id', customerId);

  if (countErr) {
    console.error('[customer-history] count', countErr.message);
  }

  const { count: draftHeadCount, error: draftCountErr } = await ctx.supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', ctx.businessId)
    .eq('customer_id', customerId)
    .eq('status', 'draft');

  if (draftCountErr) {
    console.error('[customer-history] draft count', draftCountErr.message);
  }

  const { data: invsRaw, error: invErr } = await ctx.supabase
    .from('invoices')
    .select('id, invoice_number, total, currency, status, amount_paid, balance_due, issue_date, paid_at')
    .eq('business_id', ctx.businessId)
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false, nullsFirst: false })
    .limit(5);

  if (invErr) {
    console.error('[customer-history] invoices', invErr.message);
  }

  const invs = (invsRaw ?? []) as Record<string, unknown>[];
  const totalInvoices = totalCount ?? invs.length;
  const draftInvoiceCount = draftHeadCount ?? 0;

  const { data: openAggRaw } = await ctx.supabase
    .from('invoices')
    .select('balance_due, currency, status, total, amount_paid')
    .eq('business_id', ctx.businessId)
    .eq('customer_id', customerId)
    .limit(500);

  const openByCur = new Map<string, number>();
  let openInvoiceCount = 0;
  const terminalStatuses = new Set(['voided', 'void', 'cancelled', 'paid', 'draft']);
  for (const inv of (openAggRaw ?? []) as Record<string, unknown>[]) {
    const total = Number(inv.total ?? 0);
    const amountPaid = Number(inv.amount_paid ?? 0);
    const balanceRaw = inv.balance_due;
    const balanceDue =
      balanceRaw != null && balanceRaw !== '' ? Number(balanceRaw) : Math.max(0, total - amountPaid);
    const st = String(inv.status ?? '').toLowerCase();
    if (terminalStatuses.has(st)) continue;
    if (balanceDue > 0.0001) {
      openInvoiceCount++;
      const cur = String(inv.currency ?? 'USD').trim().toUpperCase() || 'USD';
      openByCur.set(cur, (openByCur.get(cur) ?? 0) + balanceDue);
    }
  }

  const openBalanceLines =
    openByCur.size > 0
      ? Array.from(openByCur.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(
            ([cur, amt]) =>
              `${assistantBoldLine(cur)} — ${formatFinancialMoney(amt, cur)}`
          )
      : [];

  const lines: string[] = [];
  if (totalInvoices === 0) {
    lines.push('No invoices yet for this customer.');
  } else {
    lines.push(assistantBoldLine(`${totalInvoices} invoice${totalInvoices === 1 ? '' : 's'} on file`));
    if (draftInvoiceCount > 0) {
      lines.push(assistantBoldLine(`Draft invoices: ${draftInvoiceCount}`));
    }
    if (openInvoiceCount > 0 && openBalanceLines.length) {
      lines.push(
        `${assistantBoldLine(String(openInvoiceCount))} invoice${openInvoiceCount === 1 ? '' : 's'} with balance due`,
        '',
        assistantBoldLine('Open receivables by currency'),
        ...openBalanceLines
      );
    } else {
      lines.push('No outstanding balance on issued invoices.');
    }
  }

  const cardItems: Extract<InvoiceAssistantChatCard, { card_type: 'invoice_list' }>['items'] = [];
  for (const inv of invs) {
    const id = String(inv.id ?? '');
    const num = inv.invoice_number != null ? String(inv.invoice_number) : null;
    const total = inv.total != null ? Number(inv.total) : null;
    const cur = inv.currency != null ? String(inv.currency).trim().toUpperCase() : null;
    const amountPaid = Number(inv.amount_paid ?? 0);
    const balanceRaw = inv.balance_due;
    const balanceDue =
      balanceRaw != null && balanceRaw !== ''
        ? Number(balanceRaw)
        : total != null
          ? Math.max(0, total - amountPaid)
          : null;
    const derived = deriveInvoiceStatus({
      status: String(inv.status ?? ''),
      total: total ?? 0,
      amount_paid: amountPaid,
      balance_due: balanceDue,
    });
    cardItems.push({
      invoice_id: id,
      invoice_number: num,
      customer_name: displayName,
      total,
      currency: cur,
      status: String(derived),
      paid_at: inv.paid_at != null ? String(inv.paid_at) : null,
      amount_in_base: null,
      received_by_currency: [],
      amount_paid: amountPaid,
      balance_due: balanceDue,
    });
  }

  const card: InvoiceAssistantChatCard | null =
    cardItems.length > 0
      ? {
          card_type: 'invoice_list',
          title: 'Recent invoices',
          list_variant: 'general',
          base_currency_code: ctx.reportingCurrency.trim().toUpperCase() || 'USD',
          items: cardItems,
        }
      : null;

  const invoicesHref = `/dashboard/invoices?customer=${encodeURIComponent(customerId)}`;

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Customer history — ${displayName}`),
      lines,
    },
    chat_cards: card ? [card] : null,
    assistant_post_card_lines:
      cardItems.length > 0 && (totalInvoices > cardItems.length || totalInvoices > 5)
        ? ['More invoices are on file — use **View all invoices** to see the full list.']
        : null,
    quick_replies: [
      { label: 'View customer', message: `view customer ${displayName}` },
      { label: 'Create invoice', message: `create invoice for ${displayName}` },
      {
        label: 'View all invoices',
        message: `open invoices for ${displayName}`,
        href: invoicesHref,
      },
    ],
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Average issued invoice size: total issued (issue-date window) ÷ invoice count — same basis as issued revenue KPIs. */
async function handleInvoiceKpiAverageTurn(ctx: AssistantRouterContext) {
  const tz = ctx.workspaceTimezone ?? null;
  const window = resolveFinancialDateRangeFromUserText(ctx.userText, tz, new Date());
  if (!window) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Average invoice'),
        lines: ['Could not resolve a time period. Try “this month”, “this week”, or “last 7 days”.'],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const { fromYmd, toYmd } = issueDateYmdBoundsFromPaymentsWindow(window);
  const invoiced = await sumInvoicedRevenueInIssueDateRange(
    ctx.supabase,
    ctx.businessId,
    fromYmd,
    toYmd,
    baseCur
  );

  const pseudo = paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(window));
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(window.startIso, window.endIso, window.timezone);

  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, { baseCurrencyCode: ctx.reportingCurrency })
      : undefined;
  const metricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_collected_total',
      currentResultType: 'currency_summary',
    },
    aq,
    'collected_revenue'
  );

  const n = invoiced.invoiceCount;
  const avg = n > 0 ? invoiced.totalBase / n : 0;
  const avgStr = formatFinancialMoney(avg, baseCur);
  const totalStr = formatFinancialMoney(invoiced.totalBase, baseCur);

  let insight: string | null = null;
  if (n === 0) {
    insight = 'No issued invoices in this window yet — the average will reflect new bills as you issue them.';
  } else if (n < 3) {
    insight = '**Note:** Few invoices in this window — the average can move a lot with the next few bills.';
  } else if (invoiced.totalBase >= SNAPSHOT_MIN_BASE) {
    insight =
      '**Tip:** Averages smooth one-off large or small invoices — ask for **top customers** if you want concentration.';
  }

  const lines: string[] = [
    assistantBoldLine(periodLine),
    '',
    assistantBoldLine('Average issued invoice'),
    n === 0
      ? `**${avgStr}** — no invoices issued in this period`
      : `**${avgStr}** in ${baseCur}`,
    '',
    assistantBoldLine('Basis'),
  ];
  if (n === 0) {
    lines.push('Issued totals by **issue date** (draft / void / cancelled excluded).');
  } else {
    lines.push(`${assistantBoldLine(totalStr)} issued · **${n}** invoice${n === 1 ? '' : 's'}`);
  }

  if (insight) {
    lines.push('', assistantBoldLine('Insight'), insight);
  }

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Average invoice — ${titleSuffix}`),
      lines,
    },
    chat_cards: null,
    quick_replies: revenueProgressiveQuickReplies(window),
    metric_session_context: metricCtx,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Executive snapshot: issued revenue + collected cash + current AR + overdue (same sources as financial KPIs). */
async function handleBusinessHealthSummaryTurn(ctx: AssistantRouterContext) {
  const tz = ctx.workspaceTimezone ?? null;
  const now = new Date();
  const lower = ctx.userText.trim().toLowerCase();
  const spec = ctx.structuredQuery?.rangeSpec ?? parseFinancialMetricRangeSpec(lower);
  const window = resolveFinancialDateRangeFromUserText(ctx.userText, tz, now);
  if (!window) {
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Business snapshot'),
        lines: ['Could not resolve a time period. Try “this month”, “this week”, or “last 7 days”.'],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const baseCur = ctx.reportingCurrency.trim().toUpperCase() || 'USD';
  const { fromYmd, toYmd } = issueDateYmdBoundsFromPaymentsWindow(window);
  const fetchStartIso = collectedMetricFetchStartIso(spec, tz, now);

  const [invoiced, collectedMetric, unpaidRows, overdueAgg] = await Promise.all([
    sumInvoicedRevenueInIssueDateRange(ctx.supabase, ctx.businessId, fromYmd, toYmd, baseCur),
    loadCollectedRevenueMetricForBusiness(ctx.supabase, ctx.businessId, ctx.reportingCurrency, {
      fetchStartIso,
      paymentsWindow: window,
      surface: 'assistant',
      timezone: tz,
      dashboardPreset: dashboardPresetForRevenueSpec(spec),
    }),
    aggregateUnpaidBalancesByCurrency(ctx.supabase, ctx.businessId),
    aggregateOverdueInvoices(ctx.supabase, ctx.businessId, {
      workspaceTimezone: tz,
      baseCurrencyCode: baseCur,
    }),
  ]);

  if ('error' in collectedMetric) {
    console.error('[business-health] collected metric', collectedMetric.error);
    return buildWizardShellResponse({
      ...shell(ctx),
      assistant_lines: [],
      assistant_structured: {
        title: assistantBoldLine('Business snapshot'),
        lines: ["Couldn't load payments for this period. Try again shortly."],
      },
      chat_cards: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const pseudo = paidUtcToResolvedPaymentsShape(resolvedPaymentsWindowToPaidUtc(window));
  const titleSuffix = assistantAnalyticsPeriodTitleSuffix(pseudo);
  const periodLine = formatFinancialPeriodLine(window.startIso, window.endIso, window.timezone);

  const aq =
    ctx.structuredQuery != null
      ? snapshotActiveQueryFromStructured(ctx.structuredQuery, { baseCurrencyCode: ctx.reportingCurrency })
      : undefined;
  const metricCtx = metricContextForRevenueWindow(
    pseudo,
    {
      currentIntent: 'revenue_collected_total',
      currentResultType: 'currency_summary',
    },
    aq,
    'collected_revenue'
  );

  const invStr = formatFinancialMoney(invoiced.totalBase, baseCur);
  const colStr = formatFinancialMoney(collectedMetric.totalBase, baseCur);

  const outstandingInBase = sumOutstandingInReportingCurrency(unpaidRows, baseCur);
  const { glanceLines, actionLines } = buildBusinessSnapshotNarrative({
    invoicedBase: invoiced.totalBase,
    collectedBase: collectedMetric.totalBase,
    overdueInvoiceCount: overdueAgg.invoiceCount,
    outstandingInBase,
  });

  const unpaidLines =
    unpaidRows.length === 0
      ? ['None due']
      : unpaidRows.map(
          (r) => `${assistantBoldLine(r.currency)} — ${formatFinancialMoney(r.amount, r.currency)}`
        );

  const overdueByCur = overdueAgg.byCurrency;
  const overdueLines =
    overdueByCur.length === 0
      ? ['None']
      : overdueByCur.map(
          (r) => `${assistantBoldLine(r.currency)} — ${formatFinancialMoney(r.amount, r.currency)}`
        );

  const lines: string[] = [
    assistantBoldLine(periodLine),
    '',
    assistantBoldLine('Revenue'),
    `${assistantBoldLine(invStr)} · ${invoiced.invoiceCount} invoice${invoiced.invoiceCount === 1 ? '' : 's'} issued`,
    '',
    assistantBoldLine('Collected'),
    assistantBoldLine(colStr),
    collectedMetric.totalBase <= 0.0001 ? 'No payments in this period' : 'Payments in this window',
    '',
    assistantBoldLine('Outstanding'),
    'Open balances as of now (workspace snapshot).',
    ...unpaidLines,
    '',
    assistantBoldLine('Overdue'),
    `${overdueAgg.invoiceCount} invoice${overdueAgg.invoiceCount === 1 ? '' : 's'} past due`,
    ...overdueLines,
    '',
    assistantBoldLine('At a glance'),
    ...glanceLines,
    '',
    assistantBoldLine('Suggested next steps'),
    ...actionLines.map((a) => `• ${a}`),
  ];

  return buildWizardShellResponse({
    ...shell(ctx),
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine(`Business snapshot — ${titleSuffix}`),
      lines,
    },
    chat_cards: null,
    quick_replies: revenueProgressiveQuickReplies(window),
    metric_session_context: metricCtx,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Placeholder for generic insights; top-customers is fully deterministic. */
export async function handleAnalyticsAssistantTurn(ctx: AssistantRouterContext) {
  if (ctx.structuredQuery?.handlerHint === 'revenue_why_diagnostic') {
    return handleRevenueWhyDiagnosticTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'what_changed_summary') {
    return handleWhatChangedSummaryTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'collections_intelligence') {
    return handleCollectionsIntelligenceTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'risk_advisory') {
    return handleRiskAdvisoryTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'attention_summary') {
    return handleAttentionSummaryTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'inactive_customers') {
    return handleCustomerLifecycleAnalyticsTurn(ctx, 'inactive');
  }
  if (ctx.structuredQuery?.handlerHint === 'churned_customers') {
    return handleCustomerLifecycleAnalyticsTurn(ctx, 'churned');
  }
  if (ctx.structuredQuery?.handlerHint === 'invoice_kpi_average') {
    return handleInvoiceKpiAverageTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'customer_spending_comparison') {
    return handleCustomerSpendingComparisonTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'top_customers') {
    return handleTopCustomersTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'customer_history') {
    return handleCustomerHistoryTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'growth_check') {
    return handleGrowthCheckTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'business_health_summary') {
    return handleBusinessHealthSummaryTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'period_comparison') {
    return handlePeriodComparisonTurn(ctx);
  }

  return buildWizardShellResponse({
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine('Insights'),
      lines: [
        'Insights and trends in chat aren’t available yet. Open Dashboard for key metrics.',
        'Invoice lookup and creation work here — tell me an invoice number or say you want to create one.',
      ],
    },
    chat_cards: null,
    pending_invoice_lookup: null,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}
