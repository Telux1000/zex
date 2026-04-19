import type { AssistantStructuredQuery } from '@/lib/business-assistant/assistant-structured-intent';

/**
 * Workspace analytics: dormant / churn lists — not invoice wizard or single-customer record lookup.
 */

export function looksLikeChurnedCustomersIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+(an?\s+)?invoice\b/i.test(lower)) return false;

  return (
    /\bchurn(?:ed)?\s+(customers?|clients?|accounts?)\b/i.test(lower) ||
    /\b(customers?|clients?|accounts?)\s+(we\s+)?(lost|churned)\b/i.test(lower) ||
    /\b(lost|churned)\s+(customers?|clients?|accounts?)\b/i.test(lower) ||
    /\b(customers?|clients?)\s+we\s+lost\b/i.test(lower)
  );
}

export function looksLikeInactiveCustomersIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+(an?\s+)?invoice\b/i.test(lower)) return false;
  if (looksLikeChurnedCustomersIntent(lower, raw)) return false;

  return (
    /\b(inactive|dormant|idle)\s+(customers?|clients?|accounts?)\b/i.test(lower) ||
    /\b(customers?|clients?|accounts?)\s+(who\s+are\s+)?not\s+active\b/i.test(lower) ||
    /\b(customers?|clients?|accounts?)\s+with\s+no\s+activity\b/i.test(lower) ||
    /\b(no\s+activity|without\s+activity)\s+(customers?|clients?)\b/i.test(lower) ||
    /\bwho\s+(hasn'?t|has\s+not)\s+(bought|purchased|ordered)\b/i.test(lower)
  );
}

export function looksLikeCustomerLifecycleAnalyticsIntent(lower: string, raw: string): boolean {
  return looksLikeChurnedCustomersIntent(lower, raw) || looksLikeInactiveCustomersIntent(lower, raw);
}

export function parseCustomerLifecycleStructuredQuery(text: string): AssistantStructuredQuery | null {
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  if (looksLikeChurnedCustomersIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'customer',
      queryShape: 'list',
      scope: 'workspace',
      filters: { includePartialPayments: true },
      routeCategory: 'analytics_queries',
      handlerHint: 'churned_customers',
    };
  }
  if (looksLikeInactiveCustomersIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'customer',
      queryShape: 'list',
      scope: 'workspace',
      filters: { includePartialPayments: true },
      routeCategory: 'analytics_queries',
      handlerHint: 'inactive_customers',
    };
  }
  return null;
}
