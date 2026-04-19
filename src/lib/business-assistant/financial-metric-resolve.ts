import type { PaymentsNaturalRangeSpec } from '@/lib/analytics/payments-received-time-range';
import {
  parseFinancialMetricRangeSpec,
  userTextContainsExplicitPaymentsPeriod,
} from '@/lib/business-assistant/financial-date-range-resolver';

export type ResolvedFinancialMetricIntent =
  | { kind: 'unpaid_balance' }
  | { kind: 'overdue_balance' }
  | { kind: 'overdue_invoice_count' }
  | { kind: 'partially_paid_invoice_count' }
  | { kind: 'partially_paid_invoice_detail' }
  | {
      kind: 'revenue_detail_unavailable';
      detail: 'customer' | 'day';
      rangeSpec: PaymentsNaturalRangeSpec;
    }
  /** Cash / payments received in period (payment timestamps). */
  | { kind: 'revenue_collected'; rangeSpec: PaymentsNaturalRangeSpec }
  /** Invoice-booked totals by issue_date in period (not cash). */
  | { kind: 'revenue_invoiced'; rangeSpec: PaymentsNaturalRangeSpec }
  | { kind: 'invoices_issued_count'; rangeSpec: PaymentsNaturalRangeSpec };

/**
 * Invoice-booked “revenue” (sales, turnover): value of invoices issued in the period — not cash collected.
 */
export function looksLikeInvoicedRevenueQuery(lower: string): boolean {
  if (/\b(create|draft|new)\s+invoice\b/.test(lower)) return false;
  if (/\b(show|open|view|edit|find|look\s+up)\s+(the\s+)?(invoice|inv)\b/.test(lower)) return false;
  if (/\binvoice\s+(#|number|no\.?)\s*\d/i.test(lower)) return false;

  // Payment / cash phrasing → handled as payments collected, not invoice revenue
  if (
    /\b(collected|came\s+in|payments?\s+received|payment\s+received|money\s+in|cash\s+in)\b/.test(lower) ||
    /\bwhat\s+(came\s+in|got\s+paid|was\s+paid)\b/.test(lower) ||
    /\bhow\s+much\s+(was|were)\s+paid\b/.test(lower)
  ) {
    return false;
  }

  if (
    /\b(revenue|sales|top\s*line|gross\s+sales|turnover)\b/.test(lower) ||
    (/\b(earnings|income)\b/.test(lower) && !/\bnet\b/.test(lower))
  ) {
    return true;
  }

  if (/\binvoice\s+revenue\b/.test(lower) || /\brevenue\s+from\s+invoices\b/.test(lower)) return true;
  if (/\b(total\s+)?invoiced\b/.test(lower) && /\b(how\s+much|total|what|revenue)\b/.test(lower)) return true;

  return false;
}

/**
 * Payments received / cash in — actual money collected; not the same as invoice-booked revenue.
 */
export function looksLikePaymentsCollectedQuery(lower: string): boolean {
  if (/\b(create|draft|new)\s+invoice\b/.test(lower)) return false;
  if (/\b(show|open|view|edit|find|look\s+up)\s+(the\s+)?(invoice|inv)\b/.test(lower)) return false;
  if (/\binvoice\s+(#|number|no\.?)\s*\d/i.test(lower)) return false;

  if (
    /\b(invoice|invoices)\b/.test(lower) &&
    /\bpaid\b/.test(lower) &&
    /\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|(?:last|past|previous)\s+\d{1,3}\s+days?)\b/i.test(
      lower
    ) &&
    !/\b(unpaid|overdue)\b/.test(lower)
  ) {
    return true;
  }

  if (
    /\b(cash|money)\b.*\b(collected|received|in|came\s+in)\b/.test(lower) ||
    /\b(collected|received)\b.*\b(cash|money|payments?)\b/.test(lower) ||
    /\bpayments?\s+received\b/.test(lower) ||
    /\bpayment\s+received\b/.test(lower)
  ) {
    return true;
  }

  // Phrases like "collected amounts …" / "collected by currency" (plural "amounts" must match, not just \bamount\b).
  if (
    /\bcollected\s+amounts?\b/.test(lower) ||
    /\bcollected\s+by\s+currency\b/.test(lower) ||
    /\bmoney\s+received\b/.test(lower) ||
    (/\bcollections?\s+by\s+currency\b/i.test(lower) && /\b(show|list|give)\b/i.test(lower))
  ) {
    return true;
  }

  if (!/\bhow\s+much\b/.test(lower)) {
    if (
      /\b(amounts?|totals?)\b/.test(lower) &&
      /\b(paid|collected|received)\b/.test(lower) &&
      !/\b(unpaid|overdue|invoice\s+for|for\s+invoice)\b/.test(lower)
    ) {
      return true;
    }
    if (
      /\bwhat\s+(came\s+in|comes\s+in|got\s+paid|gets\s+paid|was\s+paid)\b/.test(lower) ||
      (/\b(money\s+in|cash\s+in)\b/.test(lower) &&
        /\b(today|yesterday|tonight|week|month|year|day|mtd|quarter|last|this|past|next)\b/.test(
          lower
        ))
    ) {
      return true;
    }
    return false;
  }

  if (/\bhow\s+much\s+(is|was|does)\s+(this|that|the)\s+(invoice|cost|price|fee)\b/.test(lower)) {
    return false;
  }
  if (/\bhow\s+much\s+do\s+i\s+owe\b/.test(lower)) return false;

  return (
    /\bhow\s+much\b.*\b(did\s+)?(we\s+|you\s+|i\s+)?(make|made|making|earn|earned|collect|collected|receive|received|take\s+in|took\s+in|bring\s+in|brought\s+in|get|got)\b/.test(
      lower
    ) ||
    /\bhow\s+much\b.*\b(came\s+in|come\s+in)\b/.test(lower) ||
    /\bhow\s+much\b.*\b(was|were)\s+paid\b/.test(lower) ||
    /\bhow\s+much\b.*\b(was|were)\s+paid\s+to\s+(me|us)\b/.test(lower) ||
    /\bhow\s+much\b.*\bhave\s+(i|we)\s+received\b/.test(lower) ||
    /\bhow\s+much\b.*\b(was|were)\s+made\b/.test(lower) ||
    /\bhow\s+much\b.*\bwe\s+(made|earn|earned|collect|collected)\b/.test(lower)
  );
}

/**
 * Any workspace financial period KPI (invoiced revenue or payments collected) — for routing / cross-workflow.
 */
export function looksLikeBusinessCollectedRevenueQuery(lower: string): boolean {
  return looksLikeInvoicedRevenueQuery(lower) || looksLikePaymentsCollectedQuery(lower);
}

function looksLikeRevenueCollectedQuestion(lower: string): boolean {
  return looksLikePaymentsCollectedQuery(lower);
}

/**
 * Deterministic financial metric intent for in-chat KPI answers (no LLM).
 */
export function resolveFinancialMetricIntent(userText: string): ResolvedFinancialMetricIntent | null {
  const lower = userText.trim().toLowerCase();
  if (!lower) return null;

  // Avoid stealing pure navigation / settings.
  if (/\b(open|go\s+to|navigate)\s+(the\s+)?(dashboard|reports?)\b/i.test(userText) && lower.length < 80) {
    return null;
  }

  // Unpaid / outstanding balance (not “list unpaid invoices” — that stays on invoice flow via “invoices”).
  if (
    (/\b(unpaid|outstanding)\b/.test(lower) && /\b(total|amount|balance|sum|how\s+much)\b/.test(lower)) ||
    /\btotal\s+(unpaid|outstanding)\b/.test(lower) ||
    /\bhow\s+much\s+(is\s+)?(unpaid|outstanding)\b/.test(lower) ||
    /\b(ar|a\/r)\s+balance\b/i.test(lower) ||
    /\baccounts\s+receivable\b/i.test(lower)
  ) {
    return { kind: 'unpaid_balance' };
  }

  // Overdue amount
  if (
    /\boverdue\b/.test(lower) &&
    /\b(total|amount|balance|sum|how\s+much|money)\b/.test(lower) &&
    !/\bhow\s+many\b/.test(lower)
  ) {
    return { kind: 'overdue_balance' };
  }

  // Overdue count
  if (
    /\bhow\s+many\b.*\boverdue\b|\boverdue\b.*\b(how\s+many|count|number)\b|\bcount\b.*\boverdue\b/i.test(
      lower
    )
  ) {
    return { kind: 'overdue_invoice_count' };
  }

  // Partially paid invoices: count-only vs. detail (total / paid / balance per invoice).
  // Do not use /\bpaid\b/ alone — it matches inside "partially paid".
  const partialPaidInvoicePhrase =
    /\b(invoice|invoices)\b/.test(lower) && /\b(partially\s+paid|partial(?:ly)?\s+payments?)\b/.test(lower);
  if (partialPaidInvoicePhrase) {
    const countOnly =
      (/\bhow\s+many\b/.test(lower) ||
        /\b(number|count)\s+of\b/.test(lower) ||
        /\bhow\s+many\s+do\s+i\s+have\b/.test(lower)) &&
      !/\b(balance|remaining|amount\s*paid|invoice\s+total|show|list|give|tell|display|break\s*down|details?|each|every|lines?|total\s*[,]?\s*paid|paid\s*[,]?\s*balance|paid\s+and\s+balance|what\s+(is|are)\s+the)\b/.test(
        lower
      );
    if (countOnly) {
      return { kind: 'partially_paid_invoice_count' };
    }
    return { kind: 'partially_paid_invoice_detail' };
  }

  // Revenue breakdown by customer / by day (handled in chat).
  if (
    /\b(revenue|collected|payments?|cash)\b/.test(lower) &&
    (/\b(break\s+down|breakdown)\b/.test(lower) ||
      /\bby\s+(customer|day)\b/.test(lower) ||
      /\bper\s+customer\b/.test(lower) ||
      (/\bdaily\b/.test(lower) && /\b(revenue|collected)\b/.test(lower)))
  ) {
    const detail: 'customer' | 'day' | null = /\bby\s+customer\b/.test(lower) ||
      /\bper\s+customer\b/.test(lower)
      ? 'customer'
      : /\bby\s+day\b/.test(lower) ||
          (/\bdaily\b/.test(lower) && /\b(revenue|collected)\b/.test(lower))
        ? 'day'
        : null;
    if (detail) {
      return {
        kind: 'revenue_detail_unavailable',
        detail,
        rangeSpec: parseFinancialMetricRangeSpec(lower),
      };
    }
  }

  // Invoices issued in a period (not “paid” flows — those stay with invoice assistant when phrased with paid).
  if (
    (/\b(how\s+many|number\s+of|count\s+of)\s+invoices?\b/i.test(lower) ||
      /\binvoices?\s+count\b/i.test(lower)) &&
    !/\bpaid\b/.test(lower)
  ) {
    return {
      kind: 'invoices_issued_count',
      rangeSpec: parseFinancialMetricRangeSpec(lower),
    };
  }

  // Invoice-booked revenue (issue_date) before cash / payments
  if (looksLikeInvoicedRevenueQuery(lower)) {
    return {
      kind: 'revenue_invoiced',
      rangeSpec: parseFinancialMetricRangeSpec(lower),
    };
  }

  // Payments received in a period
  if (looksLikeRevenueCollectedQuestion(lower)) {
    return {
      kind: 'revenue_collected',
      rangeSpec: parseFinancialMetricRangeSpec(lower),
    };
  }

  // “Paid this week” / “collected last 7 days” — treat as cash collected.
  if (
    /\b(paid|collected|received)\b/.test(lower) &&
    /\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|(?:last|past|previous)\s+\d{1,3}\s+days?)\b/i.test(
      lower
    )
  ) {
    return {
      kind: 'revenue_collected',
      rangeSpec: parseFinancialMetricRangeSpec(lower),
    };
  }

  // Paid-invoice collected totals with an explicit window (aligns with invoice paid_in_period total + metric_session_context).
  if (
    /\b(invoice|invoices)\b/.test(lower) &&
    /\bpaid\b/.test(lower) &&
    !/\b(unpaid|overdue)\b/.test(lower) &&
    userTextContainsExplicitPaymentsPeriod(lower) &&
    !/\bhow\s+many\b/.test(lower) &&
    (/\b(how\s+much|total\s+amount|amount\s+of|what\s+(is|was)|what's)\b/.test(lower) ||
      (/\b(total|sum)\b/.test(lower) && /\b(paid|collected)\b/.test(lower)))
  ) {
    return {
      kind: 'revenue_collected',
      rangeSpec: parseFinancialMetricRangeSpec(lower),
    };
  }

  return null;
}

export { parseFinancialMetricRangeSpec };
