import type { ResolvedPaymentsTimeRange } from '@/lib/analytics/payments-received-time-range';
import {
  assistantAnalyticsPeriodTitleSuffix,
  assistantRevenueScopePhraseForMessage,
} from '@/lib/business-assistant/financial-date-range-resolver';
import { formatDateRangeForDisplay } from '@/lib/dashboard/date-range';
import type { PartiallyPaidInvoiceDetailRow } from '@/lib/business-assistant/financial-metric-queries';
import type {
  AssistantStructuredBody,
  InvoiceAssistantChatCard,
} from '@/lib/invoices/conversational-invoice-wizard/types';
import { assistantBoldLine } from '@/lib/assistant/assistant-bold-line';

export { assistantBoldLine };

/** Generic follow-up where collected-invoices copy does not apply (open balance, overdue, etc.). */
export const FINANCIAL_ASSISTANT_FOLLOW_UP =
  'Want me to break this down by customer or by day?';

/** After the primary “collected from invoices” summary (assistant KPI). */
export const COLLECTED_FROM_INVOICES_DRILL_DOWN =
  'Want me to break this down by customer, day, or invoice?';

export const COLLECTED_FROM_INVOICES_DISCLAIMER = 'Includes full and partial payments only.';

/** Shown above partially-paid invoice lines — contrasts invoice open balances vs. revenue in a period. */
export const PARTIALLY_PAID_VS_PERIOD_REVENUE_NOTE =
  'Amounts are from each invoice’s stored total, amount paid, and remaining balance (current workspace snapshot). Collected revenue for a date range only sums payments received in that window — so you can see $0 collected in a period while invoices stay partially paid from earlier payments.';

/** Date-only range; civil dates use workspace TZ internally — no zone name shown. */
export function formatDateRangeDateOnly(startIso: string, endIso: string, tz: string): string {
  return formatDateRangeForDisplay(startIso, endIso, tz);
}

/** e.g. `10 April 2026 – 16 April 2026` (timezone used only for date math). */
export function formatFinancialPeriodLine(
  startIso: string,
  endIso: string,
  timezone: string
): string {
  return formatDateRangeForDisplay(startIso, endIso, timezone, 'detailed');
}

export function revenueSummaryTitle(w: ResolvedPaymentsTimeRange): string {
  return `Revenue (${assistantAnalyticsPeriodTitleSuffix(w)})`;
}

/** Primary heading for payment-based invoice collections in the assistant. */
export function collectedFromInvoicesSummaryTitle(w: ResolvedPaymentsTimeRange): string {
  return `Collected from invoices (${assistantAnalyticsPeriodTitleSuffix(w)})`;
}

/** Phrase used after “for …” in synthetic follow-up messages (same source as range resolver). */
export function revenuePeriodScopePhraseForMessage(w: ResolvedPaymentsTimeRange): string {
  return assistantRevenueScopePhraseForMessage(w);
}

/** Routes to invoice assistant (paid-in-period list). */
export function revenuePeriodInvoiceListPrompt(w: ResolvedPaymentsTimeRange): string {
  const scope = revenuePeriodScopePhraseForMessage(w);
  if (scope.startsWith('the ')) {
    return `List invoices paid in ${scope}`;
  }
  return `List invoices paid ${scope}`;
}

/** After a revenue-by-customer answer (invoice + day still available). */
export const REVENUE_BY_CUSTOMER_FOLLOW_UP =
  'Want to break this down by invoice or by day?';

/** After a revenue-by-day answer. */
export const REVENUE_BY_DAY_FOLLOW_UP =
  'Want me to break this down by customer or by invoice?';

/** After a collected-by-invoice list in chat. */
export const REVENUE_BY_INVOICE_FOLLOW_UP =
  'Want the same period by customer, by calendar month, or by currency?';

/** Shown after the paid-in-period invoice card, before breakdown chips. */
export const COLLECTED_INVOICE_LIST_FOLLOW_UP_QUESTION =
  'Want to see this by customer or by month?';

/** After invoice-level collected breakdown: same window, no reset. */
export function revenueAfterInvoiceBreakdownQuickReplies(
  w: ResolvedPaymentsTimeRange
): { label: string; message: string }[] {
  const scope = revenuePeriodScopePhraseForMessage(w);
  return [
    {
      label: 'By customer',
      message: `Break down revenue by customer for ${scope}`,
    },
    {
      label: 'By month',
      message: `Break down collected revenue by calendar month for ${scope}`,
    },
    {
      label: 'By currency',
      message: `Show collected amounts by currency for ${scope}`,
    },
  ];
}

export function revenueByDayProgressiveQuickReplies(
  w: ResolvedPaymentsTimeRange
): { label: string; message: string }[] {
  const scope = revenuePeriodScopePhraseForMessage(w);
  return [
    {
      label: 'By customer',
      message: `Break down revenue by customer for ${scope}`,
    },
    {
      label: 'By invoice',
      message: revenuePeriodInvoiceListPrompt(w),
    },
  ];
}

export function revenueByCustomerProgressiveQuickReplies(
  w: ResolvedPaymentsTimeRange
): { label: string; message: string }[] {
  const scope = revenuePeriodScopePhraseForMessage(w);
  return [
    {
      label: 'By invoice',
      message: revenuePeriodInvoiceListPrompt(w),
    },
    {
      label: 'By day',
      message: `Break down revenue by day for ${scope}`,
    },
  ];
}

/**
 * Progressive actions after a revenue total: customer, day, and invoice breakdowns (all in chat).
 * Limit 3 chips — primary answer stays text-only to avoid duplicate Summary cards.
 */
export function revenueProgressiveQuickReplies(
  w: ResolvedPaymentsTimeRange
): { label: string; message: string }[] {
  const scope = revenuePeriodScopePhraseForMessage(w);
  return [
    {
      label: 'By customer',
      message: `Break down revenue by customer for ${scope}`,
    },
    {
      label: 'By day',
      message: `Break down revenue by day for ${scope}`,
    },
    {
      label: 'By invoice',
      message: revenuePeriodInvoiceListPrompt(w),
    },
  ];
}

export const COLLECTED_REVENUE_BREAKDOWN_BY_CURRENCY_LABEL = 'Breakdown by currency:';

/** Row from collected metric or legacy tool shapes (amount / amount_in_base). */
export type AssistantCollectedByCurrencyRow = {
  currency: string;
  original_amount?: number;
  base_currency_equivalent?: number;
  amount?: number;
  amount_in_base?: number;
};

function normalizeAssistantCurrencyCode(code: string): string {
  return String(code ?? '').trim().toUpperCase();
}

function collectedByCurrencyLeg(r: AssistantCollectedByCurrencyRow): number {
  const v = r.original_amount ?? r.amount;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function collectedByCurrencyBaseEq(r: AssistantCollectedByCurrencyRow): number {
  const v = r.base_currency_equivalent ?? r.amount_in_base;
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
}

/**
 * Collected revenue summary: bold title + bold base total, plain period, disclaimer, optional per-currency leg → base FX lines, drill-down.
 */
export function revenueCollectedSummaryStructured(
  w: ResolvedPaymentsTimeRange,
  opts: {
    formatMoney: (amount: number, currency: string) => string;
    totalAmount: number;
    displayCurrency: string;
    /** Business reporting / base currency (for FX arrow target). */
    baseCurrency: string;
    /** From `loadCollectedRevenueMetricForBusiness` (or compatible rows). */
    byCurrency?: AssistantCollectedByCurrencyRow[];
  }
): AssistantStructuredBody {
  const base = normalizeAssistantCurrencyCode(opts.baseCurrency) || 'USD';
  const amount = opts.formatMoney(opts.totalAmount, opts.displayCurrency);
  const lines: string[] = [
    assistantBoldLine(amount),
    formatFinancialPeriodLine(w.startIso, w.endIso, w.timezone),
    COLLECTED_FROM_INVOICES_DISCLAIMER,
  ];

  const rows =
    opts.byCurrency?.filter((r) => {
      const leg = collectedByCurrencyLeg(r);
      const eq = collectedByCurrencyBaseEq(r);
      return leg > 0.0000001 || (Number.isFinite(eq) && eq > 0.0000001);
    }) ?? [];
  if (rows.length > 0) {
    lines.push(COLLECTED_REVENUE_BREAKDOWN_BY_CURRENCY_LABEL);
    const sorted = [...rows].sort((a, b) => a.currency.localeCompare(b.currency));
    for (const r of sorted) {
      const cur = normalizeAssistantCurrencyCode(r.currency);
      const legVal = collectedByCurrencyLeg(r);
      const baseEq = collectedByCurrencyBaseEq(r);
      const leg = opts.formatMoney(legVal, cur);
      if (cur === base) {
        lines.push(`${cur}: ${leg}`);
      } else if (!Number.isFinite(baseEq)) {
        lines.push(`${cur}: ${leg}`);
      } else {
        lines.push(`${cur}: ${leg} → ${opts.formatMoney(baseEq, base)}`);
      }
    }
  }

  lines.push(COLLECTED_FROM_INVOICES_DRILL_DOWN);

  return {
    title: assistantBoldLine(collectedFromInvoicesSummaryTitle(w)),
    lines,
  };
}

/** Compact KPI card: base total first, then civil period (matches modern assistant layout). */
export function collectedFromInvoicesSummaryCard(
  w: ResolvedPaymentsTimeRange,
  formatMoney: (amount: number, currency: string) => string,
  baseCurrency: string,
  totalBase: number
): InvoiceAssistantChatCard {
  const base = baseCurrency.trim().toUpperCase() || 'USD';
  return {
    card_type: 'insight_summary',
    presentation: 'compact',
    title: '',
    rows: [
      { label: `Base currency total (${base})`, value: formatMoney(totalBase, base) },
      { label: 'Period', value: formatFinancialPeriodLine(w.startIso, w.endIso, w.timezone) },
    ],
  };
}

/** @deprecated Prefer `revenueCollectedSummaryStructured` (bold hierarchy in chat text). */
export function revenueCollectedPrimaryBody(
  w: ResolvedPaymentsTimeRange,
  formatMoney: (amount: number, currency: string) => string,
  byCur: { currency: string; amount: number; amount_in_base?: number }[]
): AssistantStructuredBody {
  return {
    title: revenueSummaryTitle(w),
    lines: [
      ...byCur.map((r) => formatMoney(r.amount, r.currency)),
      formatFinancialPeriodLine(w.startIso, w.endIso, w.timezone),
      FINANCIAL_ASSISTANT_FOLLOW_UP,
    ],
  };
}

export function revenueCollectedZeroBody(
  w: ResolvedPaymentsTimeRange,
  formatMoney: (amount: number, currency: string) => string,
  baseCurrency: string
): AssistantStructuredBody {
  const base = baseCurrency.trim().toUpperCase() || 'USD';
  return {
    title: assistantBoldLine(collectedFromInvoicesSummaryTitle(w)),
    lines: [
      assistantBoldLine(formatMoney(0, base)),
      formatFinancialPeriodLine(w.startIso, w.endIso, w.timezone),
      COLLECTED_FROM_INVOICES_DISCLAIMER,
      'No collections in this period.',
      'If you still have partially paid invoices, balances may be from payments outside this window — ask to show partially paid invoice totals to see paid and remaining per invoice.',
      COLLECTED_FROM_INVOICES_DRILL_DOWN,
    ],
  };
}

export function invoicesIssuedSummaryTitle(w: ResolvedPaymentsTimeRange): string {
  return `Invoices issued (${assistantAnalyticsPeriodTitleSuffix(w)})`;
}

export function invoicesIssuedBody(
  w: ResolvedPaymentsTimeRange,
  count: number
): AssistantStructuredBody {
  const period = assistantBoldLine(formatFinancialPeriodLine(w.startIso, w.endIso, w.timezone));
  if (count === 0) {
    return {
      title: assistantBoldLine(invoicesIssuedSummaryTitle(w)),
      lines: [
        assistantBoldLine('0'),
        period,
        'None in this period.',
        FINANCIAL_ASSISTANT_FOLLOW_UP,
      ],
    };
  }
  return {
    title: assistantBoldLine(invoicesIssuedSummaryTitle(w)),
    lines: [
      assistantBoldLine(String(count)),
      period,
      FINANCIAL_ASSISTANT_FOLLOW_UP,
    ],
  };
}

/** Title line e.g. `Revenue this week` (issued-invoice total; period in the label). */
function revenueInvoicedHeading(w: ResolvedPaymentsTimeRange): string {
  return `Revenue ${assistantAnalyticsPeriodTitleSuffix(w)}`;
}

/** Compact period label for the all-zero state, e.g. `This week`. */
function periodLabelSentenceCase(w: ResolvedPaymentsTimeRange): string {
  const s = assistantAnalyticsPeriodTitleSuffix(w);
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Invoiced revenue (issue date) + collected cash (payment time) in one reply.
 * Scannable hierarchy: bold amounts, short supporting lines; no accounting essays.
 */
export function invoicedRevenueWithCollectedContextStructured(
  w: ResolvedPaymentsTimeRange,
  opts: {
    formatMoney: (amount: number, currency: string) => string;
    invoicedBase: number;
    invoicedInvoiceCount: number;
    collectedBase: number;
    baseCurrency: string;
  }
): AssistantStructuredBody {
  const base = opts.baseCurrency.trim().toUpperCase() || 'USD';
  const invStr = opts.formatMoney(opts.invoicedBase, base);
  const colStr = opts.formatMoney(opts.collectedBase, base);
  const bothZero = opts.invoicedBase <= 0.0001 && opts.collectedBase <= 0.0001;

  if (bothZero) {
    return {
      title: assistantBoldLine(periodLabelSentenceCase(w)),
      lines: [
        `Revenue: ${assistantBoldLine(invStr)}`,
        `Collected: ${assistantBoldLine(colStr)}`,
        'No activity yet',
      ],
    };
  }

  const revenueSupport =
    opts.invoicedInvoiceCount === 0
      ? 'No invoices issued'
      : `${opts.invoicedInvoiceCount} invoice${opts.invoicedInvoiceCount === 1 ? '' : 's'} issued`;

  const collectedSupport =
    opts.collectedBase <= 0.0001 ? 'No payments received' : 'Payments received';

  return {
    title: assistantBoldLine(revenueInvoicedHeading(w)),
    lines: [
      assistantBoldLine(invStr),
      revenueSupport,
      formatFinancialPeriodLine(w.startIso, w.endIso, w.timezone),
      '',
      assistantBoldLine('Collected'),
      assistantBoldLine(colStr),
      collectedSupport,
    ],
  };
}

export function financialDefaultPromptBody(): AssistantStructuredBody {
  return {
    lines: [
      'Try revenue (e.g. last 7 days), unpaid total, overdue, or invoices issued.',
    ],
  };
}

export function financialRangeUnresolvedBody(): AssistantStructuredBody {
  return {
    lines: ['Try something like last 7 days or this month.'],
  };
}

/** Bare chip (“By invoice”) with no period in the message. */
export function revenueFollowUpNeedsPeriodBody(): AssistantStructuredBody {
  return {
    lines: [
      'Add a time range first (e.g. last 14 days or this month), then use By invoice, By customer, or By day.',
    ],
  };
}

export function financialLoadErrorBody(): AssistantStructuredBody {
  return {
    lines: ["Couldn't load that. Try again in a moment."],
  };
}

export function openBalanceWithCardBody(): AssistantStructuredBody {
  return {
    title: assistantBoldLine('Open balance'),
    lines: [FINANCIAL_ASSISTANT_FOLLOW_UP],
  };
}

export function openBalanceEmptyBody(): AssistantStructuredBody {
  return {
    title: assistantBoldLine('Open balance'),
    lines: [assistantBoldLine('Nothing outstanding'), FINANCIAL_ASSISTANT_FOLLOW_UP],
  };
}

export function overdueWithCardBody(): AssistantStructuredBody {
  return {
    title: assistantBoldLine('Overdue'),
    lines: [FINANCIAL_ASSISTANT_FOLLOW_UP],
  };
}

export function overdueEmptyBody(): AssistantStructuredBody {
  return {
    title: assistantBoldLine('Overdue'),
    lines: [assistantBoldLine("You're all caught up"), FINANCIAL_ASSISTANT_FOLLOW_UP],
  };
}

export function overdueCountBody(count: number): AssistantStructuredBody {
  if (count === 0) {
    return {
      title: assistantBoldLine('Overdue'),
      lines: [assistantBoldLine('None right now'), FINANCIAL_ASSISTANT_FOLLOW_UP],
    };
  }
  return {
    title: assistantBoldLine('Overdue'),
    lines: [assistantBoldLine(String(count)), FINANCIAL_ASSISTANT_FOLLOW_UP],
  };
}

export function partiallyPaidInvoiceCountBody(count: number): AssistantStructuredBody {
  if (count === 0) {
    return {
      title: assistantBoldLine('Partially paid invoices'),
      lines: [assistantBoldLine('None right now'), FINANCIAL_ASSISTANT_FOLLOW_UP],
    };
  }
  return {
    title: assistantBoldLine('Partially paid invoices'),
    lines: [
      assistantBoldLine(
        `${count} partially paid invoice${count === 1 ? '' : 's'} (workspace-wide)`
      ),
      'Say “show partially paid invoice totals” (or list them) to see total, paid, and balance for each — no need to open invoices one by one.',
      FINANCIAL_ASSISTANT_FOLLOW_UP,
    ],
  };
}

/** Chat lines for each partially paid invoice (backend-computed amounts). */
export function partiallyPaidInvoicesDetailStructured(
  rows: PartiallyPaidInvoiceDetailRow[],
  formatMoney: (amount: number, currency: string) => string
): AssistantStructuredBody {
  const lines: string[] = [PARTIALLY_PAID_VS_PERIOD_REVENUE_NOTE, ''];
  if (rows.length === 0) {
    return {
      title: assistantBoldLine('Partially paid invoices'),
      lines: [...lines, assistantBoldLine('None right now'), FINANCIAL_ASSISTANT_FOLLOW_UP],
    };
  }
  for (const r of rows) {
    lines.push(assistantBoldLine(`${r.invoice_number} — ${r.customer_name}`));
    lines.push(`Total: ${formatMoney(r.invoice_total, r.currency)}`);
    lines.push(`Paid: ${formatMoney(r.amount_paid, r.currency)}`);
    lines.push(`Balance: ${formatMoney(r.balance_remaining, r.currency)}`);
    lines.push(`Status: ${r.status.replace(/_/g, ' ')}`);
    lines.push('');
  }
  lines.push(FINANCIAL_ASSISTANT_FOLLOW_UP);
  return {
    title: assistantBoldLine('Partially paid invoices'),
    lines,
  };
}

