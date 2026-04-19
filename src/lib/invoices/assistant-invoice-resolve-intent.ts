import type { PaymentsNaturalRangeSpec } from '@/lib/analytics/payments-received-time-range';
import {
  detectInvoiceLookupIntent,
  extractInvoiceRefForLookup,
  textLooksLikeCreateInvoiceFlow,
  textLooksLikeInvoicePaymentRecordingIntent,
} from '@/lib/invoices/invoice-chat-intent';
import { parseInvoiceReferenceFromText } from '@/lib/invoices/invoice-reference';
import type { ParsedInvoiceReference } from '@/lib/invoices/invoice-reference';
import {
  looksLikeAssistantTimeRangeCapture,
  parseAssistantPaidPeriodSpec,
} from '@/lib/invoices/assistant-invoice-period-spec';
import { normalizeAssistantInput } from '@/lib/assistant/normalize-user-text';

export type InvoiceAssistantResolvedIntent =
  | { type: 'view_edit'; intent: 'edit_invoice' | 'view_invoice'; ref: ParsedInvoiceReference | null }
  | { type: 'list'; filter: 'overdue' | 'due_today' | 'draft' }
  /** Open-balance invoice rows (drill-down from snapshot; not the receivables summary). */
  | { type: 'unpaid_list' }
  | { type: 'daily_business_summary' }
  | { type: 'find_customer'; query: string }
  | {
      type: 'date_range';
      period: PaymentsNaturalRangeSpec;
      field: 'issue' | 'created' | 'paid';
    }
  | {
      type: 'paid_in_period';
      period: PaymentsNaturalRangeSpec;
      presentation: 'list' | 'total' | 'count';
    }
  | {
      type: 'balance_in_period';
      filter: 'unpaid' | 'overdue';
      period: PaymentsNaturalRangeSpec;
      presentation: 'list' | 'total' | 'count';
    }
  | {
      type: 'insight';
      metric:
        | 'invoiced_today'
        | 'invoiced_this_week'
        | 'invoiced_this_month'
        | 'total_unpaid'
        | 'total_overdue';
    }
  /** Current open receivables snapshot (not issue-date filtered). */
  | { type: 'unpaid_snapshot' }
  | {
      type: 'action';
      action: 'mark_paid' | 'send' | 'resend' | 'duplicate' | 'void';
      ref: ParsedInvoiceReference | null;
    }
  | {
      type: 'status_aggregate';
      mode: 'count' | 'list' | 'total';
      filter: 'partially_paid' | 'unpaid' | 'overdue' | 'paid';
    };

function stripActionPhrases(t: string): string {
  return t
    .replace(/\b(mark|set)\s+(?:the\s+|this\s+|that\s+)?invoice\s+as\s+paid\b/gi, '')
    .replace(/\b(mark|set)\s+(it\s+)?as\s+paid\b/gi, '')
    .replace(/\bmark\s+as\s+paid\b/gi, '')
    .replace(/\bmark\s+paid\b/gi, '')
    .replace(/\brecord\s+(?:a\s+)?payment\b/gi, '')
    .replace(/\badd\s+(?:a\s+)?payment\b/gi, '')
    .replace(/\blog\s+(?:a\s+)?payment\b/gi, '')
    .replace(/\bregister\s+(?:a\s+)?payment\b/gi, '')
    .replace(/\binvoice\s+paid\b/gi, '')
    .replace(/\bpaid\s+invoice\b/gi, '')
    .replace(/\bpaid\s+in\s+full\b/gi, '')
    .replace(/\bpaid\b/gi, '')
    .replace(/\b(send|email|fire)\s+(the\s+)?(invoice|inv)\b/gi, '')
    .replace(/\bresend\b/gi, '')
    .replace(/\bduplicate\b/gi, '')
    .replace(/\b(void|cancel)\b/gi, '')
    .trim();
}

/** Utterances that should yield invoice priority counts (routes via structured intent `daily_business_summary`). */
export function textLooksLikeDailyBusinessSummary(lower: string, raw: string): boolean {
  if (
    /\b(what\s+is|what\s+are|what'?s)\s+my\s+tasks?\s+today\b/.test(lower) ||
    /\b(what\s+is|what'?s)\s+my\s+task\s+today\b/.test(lower) ||
    /\btoday'?s?\s+tasks?\b/.test(lower) ||
    /\btasks?\s+for\s+today\b/.test(lower) ||
    /\bwhat\s+should\s+i\s+do\s+today\b/.test(lower) ||
    /\bwhat\s+needs\s+attention\s+today\b/.test(lower) ||
    /\b(my\s+)?priorities?\s+(for\s+)?today\b/.test(lower) ||
    /\btoday'?s?\s+priorities?\b/.test(lower) ||
    /\bdaily\s+(business\s+)?summary\b/.test(lower) ||
    /\bwhat\s+to\s+focus\s+on\s+today\b/.test(lower) ||
    /\bwhat\s+should\s+i\s+focus\s+on\s+today\b/.test(lower)
  ) {
    return true;
  }
  if (/\b(task|tasks|priority|priorities)\b/.test(lower) && /\btoday\b/.test(lower)) {
    if (/\b(create|new|draft|invoice\s+for)\b/.test(lower)) return false;
    return true;
  }
  return false;
}

function extractCustomerQuery(text: string): string | null {
  const t = text.trim();
  const m =
    t.match(/\b(?:for|from|customer|client)\s+["']([^"']+)["']/i) ||
    t.match(/\b(?:invoice|invoices)\s+for\s+(.+)$/i) ||
    t.match(/\bfind\s+(?:invoice|invoices)\s+for\s+(.+)$/i) ||
    t.match(/\b(?:customer|client)\s+(.+)$/i);
  if (!m) return null;
  const q = String(m[1] ?? '').trim();
  if (q.length < 2) return null;
  if (/\b(all|unpaid|overdue|list)\b/i.test(q)) return null;
  if (looksLikeAssistantTimeRangeCapture(q)) return null;
  return q;
}

/** Paid in a time window — not “mark this invoice as paid”. */
function isPaidPeriodSemantic(lower: string): boolean {
  if (!/\bpaid\b/.test(lower) || /\bunpaid\b/.test(lower)) return false;
  if (/\bmark\s+(?:the\s+)?(?:invoice|inv)\b/i.test(lower) && /\bas\s+paid\b/.test(lower)) return false;
  if (/\bmark\s+as\s+paid\b/.test(lower)) return false;
  if (/\brecord\s+payment\b/.test(lower)) return false;
  if (/\bpaid\s+in\s+full\b/.test(lower)) return false;
  return true;
}

function paidPeriodTouchesInvoicesOrTotals(lower: string): boolean {
  return (
    /\binvoice?s?\b/.test(lower) ||
    /\bpayment?s?\b/.test(lower) ||
    /\bhow\s+much\b/.test(lower) ||
    /\bhow\s+many\b/.test(lower) ||
    /\bwhich\b/.test(lower) ||
    /\bwhat\s+invoice/.test(lower) ||
    /\bwhat\s+is\b/.test(lower) ||
    /\btotal\s+amount\b/.test(lower) ||
    /\bfrom\s+invoices?\b/.test(lower) ||
    /\b(collected|received)\s+from\s+invoices?\b/.test(lower) ||
    /\bmoney\s+received\b.*\binvoices?\b|\binvoices?\b.*\bmoney\s+received\b/.test(lower)
  );
}

function detectPaidPeriodIntent(lower: string): InvoiceAssistantResolvedIntent | null {
  if (!isPaidPeriodSemantic(lower)) return null;
  const period = parseAssistantPaidPeriodSpec(lower);
  if (!period) return null;
  if (!paidPeriodTouchesInvoicesOrTotals(lower)) return null;

  let presentation: 'list' | 'total' | 'count' = 'list';
  if (/\bhow\s+many\b|\bnumber\s+of\b|\bcount\s+of\b/.test(lower)) presentation = 'count';
  else if (/\bhow\s+much\b/.test(lower)) presentation = 'total';
  else if (
    /\b(total|sum)\s+(?:of\s+)?(?:all\s+)?(?:the\s+)?(?:amount\s+)?(?:paid|collected|payments?)\b/.test(
      lower
    ) ||
    /\b(paid|collected)\s+(?:amount|total|sum)\b/.test(lower) ||
    /\bwhat\s+is\s+(?:the\s+)?(?:total\s+)?(?:amount|value)\b/.test(lower) ||
    (/\btotal\s+amount\b/.test(lower) && /\bpaid\b/.test(lower))
  ) {
    presentation = 'total';
  }

  return { type: 'paid_in_period', period, presentation };
}

function detectBalanceInPeriodIntent(lower: string): InvoiceAssistantResolvedIntent | null {
  let filter: 'unpaid' | 'overdue' | null = null;
  if (/\boverdue\b/.test(lower)) filter = 'overdue';
  else if (/\bunpaid\b/.test(lower) || /\boutstanding\b/.test(lower)) filter = 'unpaid';
  else return null;

  if (/\binvoices?\s+paid\b|\bpaid\s+invoices?\b/.test(lower)) return null;

  const period = parseAssistantPaidPeriodSpec(lower);
  if (!period) return null;
  if (!/\binvoices?\b/.test(lower)) return null;

  // "As of today" / "as at today" on receivables = current snapshot, not invoices issued (or balanced) by issue date today.
  if (/\b(as\s+of|as\s+at|as\s+on)\s+today\b/i.test(lower)) {
    return null;
  }
  if (
    /\b(currently|right\s+now|at\s+present)\b/i.test(lower) &&
    /\b(unpaid|outstanding|receivables?|\bar\b|owe|owed)\b/i.test(lower)
  ) {
    return null;
  }

  let presentation: 'list' | 'total' | 'count' = 'list';
  if (/\bhow\s+many\b|\bnumber\s+of\b|\bcount\s+of\b/.test(lower)) presentation = 'count';
  else if (
    /\bhow\s+much\b/.test(lower) ||
    /\btotal\s+amount\b/.test(lower) ||
    (/\btotal\b/.test(lower) && /\bamount\b/.test(lower))
  ) {
    presentation = 'total';
  }

  return { type: 'balance_in_period', filter, period, presentation };
}

/**
 * Business-wide counts / lists / totals by derived invoice status (not customer-scoped).
 */
function detectInvoiceStatusAggregateIntent(raw: string): InvoiceAssistantResolvedIntent | null {
  const lower = raw.toLowerCase().trim();
  if (!/\binvoices?\b/.test(lower)) return null;
  if (extractCustomerQuery(raw)) return null;

  let mode: 'count' | 'list' | 'total' | null = null;
  if (/\b(how\s+many|number\s+of|count\s+of)\b/.test(lower)) mode = 'count';
  else if (/\bhow\s+much\b/.test(lower)) mode = 'total';
  else if (
    /\b(list|show|get)\b/.test(lower) ||
    (/\b(which|what)\b/.test(lower) && /\binvoices?\b/.test(lower))
  ) {
    mode = 'list';
  }

  if (!mode) return null;

  let filter: 'partially_paid' | 'unpaid' | 'overdue' | 'paid' | null = null;
  if (/\bpartially\s+paid\b/.test(lower) || /\bpartial(?:ly)?\s+payments?\b/.test(lower)) {
    filter = 'partially_paid';
  } else if (/\boverdue\b/.test(lower)) {
    filter = 'overdue';
  } else if (
    /\bunpaid\b/.test(lower) ||
    /\boutstanding\b/.test(lower) ||
    /\bpending\s+invoices?\b/.test(lower) ||
    /\bopen\s+invoices?\b/.test(lower) ||
    /\binvoices?\s+still\s+open\b/.test(lower)
  ) {
    filter = 'unpaid';
  } else if (/\bpaid\b/.test(lower) && !/\bunpaid\b/.test(lower) && !/\bpartially\b/.test(lower)) {
    if (parseAssistantPaidPeriodSpec(lower)) return null;
    if (
      /\binvoices?\s+paid\b/.test(lower) ||
      /\bpaid\s+invoices?\b/.test(lower) ||
      /\binvoices?\s+(?:that\s+are\s+)?(?:are|were|is)\s+paid\b/.test(lower) ||
      mode === 'count'
    ) {
      filter = 'paid';
    }
  }

  if (!filter) return null;

  return { type: 'status_aggregate', mode, filter };
}

function detectDateListIntent(text: string): InvoiceAssistantResolvedIntent | null {
  const t = text.toLowerCase();
  // Outstanding / unpaid + "today" is usually “as of today” snapshot language, not “issued today”.
  if (
    /\b(unpaid|outstanding|receivables?|accounts\s+receivable|\bar\b)\b/i.test(t) &&
    /\btoday\b/i.test(t) &&
    !/\b(issued|created|sent)\s+today\b/i.test(t) &&
    !/\btoday'?s?\s+invoice/i.test(t) &&
    !/\binvoice[sd]?\s+today\b/i.test(t)
  ) {
    return null;
  }

  const hasList =
    /\b(list|show|what\s+are|get)\b/.test(t) ||
    (/\b(which|what)\b/.test(t) && /\b(invoice|invoices)\b/.test(t));
  if (!hasList || !/\b(invoice|invoices)\b/.test(t)) return null;

  const period = parseAssistantPaidPeriodSpec(t);
  if (!period) return null;

  let field: 'issue' | 'created' | 'paid';
  if (/\bpaid\b/.test(t) && !/\bunpaid\b/.test(t)) field = 'paid';
  else if (/\b(created|creation)\b/.test(t)) field = 'created';
  else field = 'issue';
  return { type: 'date_range', period, field };
}

function detectUnpaidSnapshotIntent(lower: string): boolean {
  const t = lower.trim();
  // Explicit "all" → full list (handled later), not snapshot.
  if (/\b(all|every)\s+(unpaid|outstanding)\b/i.test(t)) return false;

  if (
    /\b(as\s+of|as\s+at|as\s+on)\s+today\b/i.test(t) &&
    /\b(unpaid|outstanding)\b/i.test(t) &&
    /\binvoices?\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\bunpaid\s+invoices?\s+(as\s+of|as\s+at|as\s+on)\s+today\b/i.test(t) ||
    /\boutstanding\s+invoices?\s+(as\s+of|as\s+at|as\s+on)\s+today\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\bwhat'?s\s+currently\s+unpaid\b/i.test(t) ||
    /\bcurrent(ly)?\s+unpaid\s+(position|balance|invoices?)\b/i.test(t)
  ) {
    return true;
  }
  if (/^what\s+are\s+(the\s+)?unpaid\b/i.test(t)) return true;
  if (
    /\bwhat'?s\s+left\s+to\s+be\s+paid\b/i.test(t) &&
    !/\bthis\s+invoice\b/i.test(t)
  ) {
    return true;
  }
  // Summary-style questions only — drill-downs like "show unpaid" use `unpaid_list`, not snapshot.
  if (
    /^(what|tell\s+me)\s+(are|is)\s+(the\s+)?(unpaid|outstanding|receivables?)\b/i.test(t) ||
    /^what(?:'s|s| is)\s+(unpaid|outstanding|receivables?)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Deterministic resolution of invoice assistant intents from user text.
 * Returns null to fall through to create-invoice wizard extraction only.
 */
export function resolveInvoiceAssistantIntent(userText: string): InvoiceAssistantResolvedIntent | null {
  const normalized = normalizeAssistantInput(userText);
  const raw = normalized.normalized;
  if (!raw) return null;
  if (textLooksLikeCreateInvoiceFlow(raw)) return null;

  const lower = normalized.normalizedLower;

  if (detectUnpaidSnapshotIntent(lower)) {
    return { type: 'unpaid_snapshot' };
  }

  if (
    /^what(?:'s|s| is)\s+overdue(?:\s+right\s+now|\s+now)?\??$/i.test(lower) ||
    /^what(?:'s|s| is)\s+late(?:\s+right\s+now|\s+now)?\??$/i.test(lower)
  ) {
    return { type: 'insight', metric: 'total_overdue' };
  }

  if (
    /^what\s+invoices?\s+are\s+overdue\??$/i.test(lower) ||
    /^late\s+invoices?\.?$/i.test(lower) ||
    /^who\s+is\s+overdue\??$/i.test(lower)
  ) {
    return { type: 'list', filter: 'overdue' };
  }

  if (
    /\bwho\s+(hasn'?t|haven'?t|didn'?t)\s+paid\b/i.test(lower) ||
    /\bwho\s+owes\s+(us|me)\b/i.test(lower) ||
    /\bwhich\s+customers?\s+owe\b/i.test(lower)
  ) {
    return { type: 'unpaid_list' };
  }

  if (/\baging\b/i.test(lower) && /\b(unpaid|outstanding|receivables?|overdue)\b/i.test(lower)) {
    return { type: 'list', filter: 'overdue' };
  }

  // Insights (no invoice ref required) — allow "as of today" on receivables (not an issue-date window).
  const hasParsedPeriod = !!parseAssistantPaidPeriodSpec(lower);
  const receivablesAsOfTodayLanguage =
    /\b(as\s+of|as\s+at|as\s+on)\s+today\b/i.test(lower) &&
    /\b(unpaid|outstanding|receivables?)\b/i.test(lower);

  if (
    (!hasParsedPeriod || receivablesAsOfTodayLanguage) &&
    (/\btotal\s+(unpaid|outstanding|open)\b/.test(lower) ||
      /\bhow\s+much\s+(is\s+)?(unpaid|outstanding)\b/.test(lower) ||
      /\b(ar|a\/r)\s+balance\b/i.test(lower) ||
      /\baccounts\s+receivable\b/i.test(lower) ||
      /\bhow\s+much\s+.*\b(still\s+)?(unpaid|outstanding)\b/i.test(lower) ||
      /\bhow\s+much\s+.*\bowe\s+us\b/i.test(lower) ||
      /\bhow\s+much\s+.*\b(customers?\s+)?owe\b/i.test(lower) ||
      /\bmoney\s+(we\s+)?(are\s+)?still\s+waiting\b/i.test(lower) ||
      /\bcash\s+stuck\s+in\s+invoices?\b/i.test(lower))
  ) {
    return { type: 'insight', metric: 'total_unpaid' };
  }
  if (
    !hasParsedPeriod &&
    (/\btotal\s+overdue\b/.test(lower) || /\boverdue\s+(amount|total|balance)\b/.test(lower))
  ) {
    return { type: 'insight', metric: 'total_overdue' };
  }

  const paidPeriod = detectPaidPeriodIntent(lower);
  if (paidPeriod) return paidPeriod;

  const balancePeriod = detectBalanceInPeriodIntent(lower);
  if (balancePeriod) return balancePeriod;

  if (textLooksLikeDailyBusinessSummary(lower, raw)) {
    return { type: 'daily_business_summary' };
  }

  // Invoiced (issued) amounts — never treat “paid this week” as “invoiced this week”
  const paidWord = /\bpaid\b/.test(lower) && !/\bunpaid\b/.test(lower);
  if (
    !paidWord &&
    (/\binvoice(d)?\s+today\b/.test(lower) || /\btoday'?s?\s+invoice/i.test(raw))
  ) {
    return { type: 'insight', metric: 'invoiced_today' };
  }
  if (!paidWord && /\bthis\s+week\b/.test(lower) && /\binvoice/i.test(raw)) {
    return { type: 'insight', metric: 'invoiced_this_week' };
  }
  if (!paidWord && /\bthis\s+month\b/.test(lower) && /\binvoice/i.test(raw)) {
    return { type: 'insight', metric: 'invoiced_this_month' };
  }

  // Unpaid drill-down list — before status_aggregate so "show unpaid invoices" is not a status_aggregate list.
  const drillTrim = raw.trim();
  if (/^(?:show|list|get|give|see)(?:\s+me)?\s+all\s+unpaid(?:\s+invoices?)?\.?$/i.test(drillTrim)) {
    return { type: 'unpaid_list' };
  }
  if (/^(?:show|list|get|give|see)(?:\s+me)?\s+(?:the\s+|my\s+)?unpaid(?:\s+invoices?)?\.?$/i.test(drillTrim)) {
    return { type: 'unpaid_list' };
  }
  if (
    /^(?:show|list|get|give|see)(?:\s+me)?\s+(?:the\s+|my\s+)?outstanding(?:\s+invoices?)?\.?$/i.test(
      drillTrim
    )
  ) {
    return { type: 'unpaid_list' };
  }
  if (/^(?:unpaid|outstanding|receivables?)(?:\s+please)?\.?$/i.test(drillTrim)) {
    return { type: 'unpaid_list' };
  }
  if (!extractCustomerQuery(raw)) {
    if (
      (/\b(list|show|get)\b/.test(lower) && /\bunpaid\b/.test(lower) && /\binvoices?\b/.test(lower)) ||
      /\bunpaid\s+invoices?\b/.test(lower)
    ) {
      if (
        !/\b(how\s+many|number\s+of|count\s+of|how\s+much)\b/.test(lower) &&
        !/\b(which|what)\s+invoices?\s+are\b/i.test(lower)
      ) {
        return { type: 'unpaid_list' };
      }
    }
  }

  const statusAgg = detectInvoiceStatusAggregateIntent(raw);
  if (statusAgg) return statusAgg;

  const trimmedForCompact = raw.trim();
  if (/^overdue\.?$/i.test(trimmedForCompact)) {
    return { type: 'list', filter: 'overdue' };
  }
  if (
    /^(?:show|list)(?:\s+me)?\s+all\s+overdue(?:\s+invoices?)?\.?$/i.test(trimmedForCompact)
  ) {
    return { type: 'list', filter: 'overdue' };
  }
  if (/^(?:show|list)(?:\s+me)?\s+(?:the\s+)?overdue(?:\s+invoices?)?\.?$/i.test(trimmedForCompact)) {
    return { type: 'list', filter: 'overdue' };
  }
  if (
    /^(?:show|list)(?:\s+me)?\s+(?:due\s+today|today'?s?\s+due)(?:\s+invoices?)?\.?$/i.test(
      trimmedForCompact
    ) ||
    /^(?:show|list)(?:\s+me)?\s+(?:the\s+)?invoices?\s+due\s+today\.?$/i.test(trimmedForCompact)
  ) {
    return { type: 'list', filter: 'due_today' };
  }
  if (
    /^(?:show|list)(?:\s+me)?\s+(?:the\s+)?drafts?(?:\s+invoices?)?\.?$/i.test(trimmedForCompact)
  ) {
    return { type: 'list', filter: 'draft' };
  }

  // List unpaid / overdue
  if (
    (/\b(list|show|get)\b/.test(lower) && /\boverdue\b/.test(lower) && /\binvoices?\b/.test(lower)) ||
    /\boverdue\s+invoices?\b/.test(lower)
  ) {
    return { type: 'list', filter: 'overdue' };
  }
  if (
    /\b(list|show|get)\b/.test(lower) &&
    /\b(due\s+today|today'?s?\s+due)\b/.test(lower) &&
    /\binvoices?\b/.test(lower)
  ) {
    return { type: 'list', filter: 'due_today' };
  }
  if (
    (/\b(list|show|get)\b/.test(lower) && /\bdraft\b/.test(lower) && /\binvoices?\b/.test(lower)) ||
    /\bdraft\s+invoices?\b/.test(lower)
  ) {
    return { type: 'list', filter: 'draft' };
  }

  const dateList = detectDateListIntent(raw);
  if (dateList) return dateList;

  const custQ = extractCustomerQuery(raw);
  if (
    custQ &&
    /\b(find|search|show|list|invoice|invoices)\b/i.test(raw) &&
    !detectInvoiceLookupIntent(raw)
  ) {
    return { type: 'find_customer', query: custQ };
  }

  // Actions + optional ref in same message
  const markPaidVerb =
    textLooksLikeInvoicePaymentRecordingIntent(raw) ||
    /\b(mark\s+(?:as\s+)?paid|record\s+payment|add\s+payment|log\s+payment|register\s+payment|paid\s+in\s+full|invoice\s+paid)\b/i.test(
      raw
    );
  const actionMatch = markPaidVerb ? 'mark_paid' : null;
  const sendMatch = /\b(send\s+(?:the\s+)?invoice|email\s+(?:the\s+)?invoice)\b/i.test(raw)
    ? 'send'
    : null;
  const resendMatch = /\bresend\b/i.test(raw) && /\binvoice\b/i.test(raw) ? 'resend' : null;
  const dupMatch = /\bduplicate\b/i.test(raw) && /\binvoice\b/i.test(raw) ? 'duplicate' : null;
  const voidMatch = /\b(void|cancel)\b/i.test(raw) && /\binvoice\b/i.test(raw) ? 'void' : null;

  const action = actionMatch || sendMatch || resendMatch || dupMatch || voidMatch;
  if (action) {
    const stripped = stripActionPhrases(raw);
    const ref =
      extractInvoiceRefForLookup(raw) ||
      extractInvoiceRefForLookup(stripped) ||
      parseInvoiceReferenceFromText(stripped);
    return { type: 'action', action, ref };
  }

  // View / edit (existing)
  const invIntent = detectInvoiceLookupIntent(raw);
  if (invIntent) {
    const ref =
      extractInvoiceRefForLookup(raw) ||
      parseInvoiceReferenceFromText(raw);
    return {
      type: 'view_edit',
      intent: invIntent === 'edit_invoice' ? 'edit_invoice' : 'view_invoice',
      ref,
    };
  }

  return null;
}
