/**
 * Refinements of a revenue / collected-cash answer (chips or short follow-ups).
 * Kept separate from create-invoice and invoice-ref lookup intents.
 */
export type RevenueMetricFollowUpIntent =
  | { kind: 'revenue_breakdown_by_invoice'; bareChip: boolean }
  | { kind: 'revenue_breakdown_by_customer'; bareChip: boolean }
  | { kind: 'revenue_breakdown_by_day'; bareChip: boolean }
  | { kind: 'revenue_breakdown_by_currency'; bareChip: boolean }
  | { kind: 'revenue_breakdown_by_month'; bareChip: boolean };

export function tryParseRevenueMetricFollowUpIntent(userText: string): RevenueMetricFollowUpIntent | null {
  const raw = userText.trim();
  const lower = raw.toLowerCase();

  if (/^\s*by\s+invoice\.?\s*$/i.test(raw)) {
    return { kind: 'revenue_breakdown_by_invoice', bareChip: true };
  }
  if (/^\s*by\s+customer\.?\s*$/i.test(raw)) {
    return { kind: 'revenue_breakdown_by_customer', bareChip: true };
  }
  if (/^\s*by\s+day\.?\s*$/i.test(raw)) {
    return { kind: 'revenue_breakdown_by_day', bareChip: true };
  }
  if (/^\s*by\s+currency\.?\s*$/i.test(raw)) {
    return { kind: 'revenue_breakdown_by_currency', bareChip: true };
  }
  if (/^\s*by\s+month\.?\s*$/i.test(raw)) {
    return { kind: 'revenue_breakdown_by_month', bareChip: true };
  }

  if (/\blist\s+invoices\s+paid\b/i.test(lower)) {
    return { kind: 'revenue_breakdown_by_invoice', bareChip: false };
  }
  if (
    /\bbreak\s+down\s+revenue\s+by\s+invoice\b/i.test(lower) ||
    /\brevenue\s+breakdown\s*:?\s*by\s+invoice\b/i.test(lower)
  ) {
    return { kind: 'revenue_breakdown_by_invoice', bareChip: false };
  }
  // Natural follow-ups after a revenue total (same window as metric_session_context when present).
  if (
    /\bbreak\s+(it\s+)?down\b/i.test(lower) ||
    /\bbreak\s+this\s+down\b/i.test(lower) ||
    /\b(itemize|drill\s+down)\b/i.test(lower)
  ) {
    if (/\b(invoice|invoices|invoice\s+numbers?)\b/i.test(lower)) {
      return { kind: 'revenue_breakdown_by_invoice', bareChip: false };
    }
  }
  if (/\binvoice\s+numbers?\b/i.test(lower) && /\b(with|show|include|give|add|list)\b/i.test(lower)) {
    return { kind: 'revenue_breakdown_by_invoice', bareChip: false };
  }
  if (/\bby\s+invoice\b/i.test(lower) && /\b(break|show|list|split|detail)\b/i.test(lower)) {
    return { kind: 'revenue_breakdown_by_invoice', bareChip: false };
  }
  if (/\bbreak\s+down\s+revenue\s+by\s+customer\b/i.test(lower)) {
    return { kind: 'revenue_breakdown_by_customer', bareChip: false };
  }
  if (
    /\brevenue\b/.test(lower) &&
    (/\bby\s+customer\b/.test(lower) || /\bper\s+customer\b/.test(lower))
  ) {
    return { kind: 'revenue_breakdown_by_customer', bareChip: false };
  }
  if (/\bbreak\s+down\s+revenue\s+by\s+day\b/i.test(lower)) {
    return { kind: 'revenue_breakdown_by_day', bareChip: false };
  }
  if (/\brevenue\b/.test(lower) && /\bby\s+day\b/.test(lower)) {
    return { kind: 'revenue_breakdown_by_day', bareChip: false };
  }

  // Grouped collections (payment events); must match "payments received by currency …" without "show collected amounts".
  if (
    /\bby\s+currency\b/i.test(lower) &&
    /\b(collected|payments?\s+received|payment\s+received|money\s+received|collections?)\b/i.test(lower)
  ) {
    return { kind: 'revenue_breakdown_by_currency', bareChip: false };
  }

  if (/\bshow\s+collected\s+amounts?\s+by\s+currency\b/i.test(lower)) {
    return { kind: 'revenue_breakdown_by_currency', bareChip: false };
  }
  if (
    /\bby\s+currency\b/i.test(lower) &&
    /\b(revenue|show|break|amounts?)\b/i.test(lower)
  ) {
    return { kind: 'revenue_breakdown_by_currency', bareChip: false };
  }
  if (
    /\bbreak\s+down\s+collected\s+revenue\s+by\s+(calendar\s+)?month\b/i.test(lower) ||
    /\bcollected\s+revenue\s+by\s+(calendar\s+)?month\b/i.test(lower)
  ) {
    return { kind: 'revenue_breakdown_by_month', bareChip: false };
  }
  if (/\bby\s+calendar\s+month\b/i.test(lower) && /\b(break|collected|revenue)\b/i.test(lower)) {
    return { kind: 'revenue_breakdown_by_month', bareChip: false };
  }

  return null;
}
