import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';

/**
 * Receivables / unpaid reporting phrasing — must break out of invoice-draft workflow
 * and route to deterministic invoice assistant (lists, snapshots, totals), even without the word "invoice".
 */

/** Core alternation (no leading ^ / trailing $); word boundaries applied in each pattern. */
const UNPAID_AR_TERMS = '(?:unpaid|outstanding|receivables?|accounts\\s+receivable|\\bar\\b|a\\/r)';

export function textLooksLikeUnpaidReceivablesReportingIntent(
  lower: string,
  metricSession?: AssistantMetricSessionContext | null
): boolean {
  const t = lower.trim();
  if (!t) return false;
  if (/\b(create|draft|new)\s+invoice\b/i.test(t)) return false;
  if (/\b(invoice|inv)\s+(#|no\.?|number)\s*[\w-]+/i.test(t)) return false;

  // Short commands — no "invoices" required (e.g. "show unpaid", "unpaid", "what are unpaid").
  if (
    new RegExp(
      `^(?:show|list|get|give|see|tell\\s+me)(?:\\s+me)?\\s+(?:the\\s+)?(?:my\\s+)?${UNPAID_AR_TERMS}(?:\\s+please)?\\.?$`,
      'i'
    ).test(t)
  ) {
    return true;
  }
  if (new RegExp(`^${UNPAID_AR_TERMS}(?:\\s+please)?\\.?$`, 'i').test(t)) {
    return true;
  }
  if (
    /^(what|tell\s+me)\s+(are|is)\s+(the\s+)?(unpaid|outstanding|receivables?)\b/i.test(t) ||
    /^what(?:'s|s| is)\s+(unpaid|outstanding|receivables?)\b/i.test(t)
  ) {
    return true;
  }
  // Past-due keyword alone or with light verbs → invoice list path (not generic fallback).
  if (/^(?:show|list|get|give)?(?:\s+me)?\s*overdue(?:\s+please)?\.?$/i.test(t)) {
    return true;
  }
  if (/^overdue\.?$/i.test(t)) {
    return true;
  }
  if (
    /^what(?:'s|s| is)\s+overdue(?:\s+right\s+now|\s+now)?\??$/i.test(t) ||
    /^what(?:'s|s| is)\s+late(?:\s+right\s+now|\s+now)?\??$/i.test(t) ||
    /^what\s+invoices?\s+are\s+overdue\??$/i.test(t) ||
    /^late\s+invoices?\.?$/i.test(t) ||
    /^who\s+is\s+overdue\??$/i.test(t)
  ) {
    return true;
  }

  if (
    /\b(unpaid|outstanding|receivables?|accounts\s+receivable|\bar\b|a\/r)\b/i.test(t) &&
    /\b(invoices?|balances?|customers?|owe|owed|collections?|position)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\bwho\s+(hasn'?t|haven'?t|didn'?t)\s+paid\b/i.test(t) ||
    /\bwho\s+owes\s+(us|me)\b/i.test(t) ||
    /\bwhich\s+customers?\s+owe\b/i.test(t) ||
    /\b(which|what)\s+invoices?\s+are\s+open\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(ar|a\/r)\s+balance\b/i.test(t) ||
    /\bwhat'?s\s+the\s+(ar|a\/r)\b/i.test(t) ||
    /\bhow\s+much\s+.*\b(unpaid|outstanding|owed|owe\s+us)\b/i.test(t) ||
    /\bhow\s+much\s+.*\b(customers?\s+)?owe\b/i.test(t) ||
    /\bwhat\s+are\s+(the\s+)?unpaid\b/i.test(t)
  ) {
    return true;
  }
  if (/\baging\b/.test(t) && /\b(unpaid|outstanding|receivables?|overdue)\b/.test(t)) {
    return true;
  }
  if (
    /\b(money\s+owed|still\s+waiting\s+to\s+collect|invoice\s+backlog|not\s+paid\s+yet)\b/i.test(t) &&
    /\b(we|us|customers?|invoice|invoices?|money)\b/i.test(t)
  ) {
    return true;
  }
  if (/\bcash\s+stuck\s+in\s+invoices?\b/i.test(t)) return true;
  if (/\bpending\s+invoices?\b/i.test(t) && /\b(list|show|what|which|get)\b/i.test(t)) return true;

  const aq = metricSession?.active_query;
  const inInvoiceContext =
    aq?.businessObject === 'invoice' ||
    aq?.invoiceStatusFilter != null ||
    metricSession?.currentResultType === 'invoice_list';
  if (inInvoiceContext && new RegExp(`^${UNPAID_AR_TERMS}\\.?$`, 'i').test(t)) {
    return true;
  }

  return false;
}
