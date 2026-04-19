import type {
  AssistantIntentFamily,
  AssistantQueryShape,
  AssistantStructuredQuery,
} from '@/lib/business-assistant/assistant-structured-intent';
import {
  looksLikeCustomerLifecycleAnalyticsIntent,
} from '@/lib/business-assistant/customer-lifecycle-intent';
import { parseInvoiceReferenceFromText } from '@/lib/invoices/invoice-reference';

const EMAIL_RE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;

const CUSTOMER_HISTORY_SIGNAL =
  /\b(history|histories|activity|activities|timeline|summaries|summary|performance|details?|insights?)\b/i;

function stripCustomerHistoryNameHint(raw: string): string {
  return raw
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Customer analytics: history / activity / summary — not invoice draft or generic customer record open.
 * Runs before `parseCustomerRecordStructuredQuery` in strong-explicit tier.
 */
export function parseCustomerHistoryStructuredQuery(text: string): AssistantStructuredQuery | null {
  const t = text.trim();
  if (!t) return null;
  if (/\b(create|draft|new|make|start|build)\s+(?:an\s+)?invoice\b/i.test(t)) return null;
  if (!CUSTOMER_HISTORY_SIGNAL.test(t)) return null;

  const patterns: RegExp[] = [
    /\b(?:customer|client)\s+history\s+for\s+(.+)/i,
    /\b(?:customer|client)\s+activity\s+(?:for\s+)?(.+)/i,
    /\b(?:customer|client)\s+(?:summary|performance|insights?)\s+for\s+(.+)/i,
    /\bshow\s+history\s+for\s+(.+)/i,
    /\bshow\s+(?:customer|client)\s+details?\s+(?:for\s+)?(.+)/i,
    /\bhistory\s+for\s+(.+)/i,
    /\bactivity\s+for\s+(.+)/i,
    /\bsummary\s+for\s+(.+)/i,
    /\bperformance\s+for\s+(.+)/i,
    /^(.+?)\s+history\s*$/i,
    /^(.+?)\s+activity\s*$/i,
  ];

  let name = '';
  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const candidate = stripCustomerHistoryNameHint(m[1]);
    if (candidate.length < 2) continue;
    if (/^(the|a|an|my|our|this|that)\s+/i.test(candidate)) continue;
    if (/^(history|activity|summary|performance|details?|customer|client)s?$/i.test(candidate)) continue;
    name = candidate;
    break;
  }
  if (!name) return null;

  const hasCustomerWord = /\b(?:customers?|clients?)\b/i.test(t);
  const trailingEntityHistory = /^(.+?)\s+(?:history|activity)\s*$/i.test(t);
  const scopedForPhrase =
    /\b(?:history|activity|summary|performance)\s+for\s+/i.test(t) ||
    /\bshow\s+history\s+for\b/i.test(t);
  if (!hasCustomerWord && !trailingEntityHistory && !scopedForPhrase) return null;

  return {
    intentFamily: 'metric_query',
    businessObject: 'customer',
    queryShape: 'list',
    scope: 'customer',
    filters: { customerNameHint: name },
    routeCategory: 'analytics_queries',
    handlerHint: 'customer_history',
  };
}

/**
 * Guided slot intent for "update customer email" requests.
 * Collects missing customer/email before any search/update side effects.
 */
export function parseCustomerEmailUpdateStructuredQuery(text: string): AssistantStructuredQuery | null {
  const t = text.trim();
  if (!t) return null;
  if (/\binvoices?\b/i.test(t)) return null;
  if (!/\b(customer|client)\b/i.test(t)) return null;
  if (!/\b(update|change|edit|modify)\b/i.test(t)) return null;
  if (!/\b(e-?mail|email)\b/i.test(t)) return null;

  const emailMatch = t.match(EMAIL_RE);
  const emailHint = emailMatch?.[0] ?? undefined;

  let name = '';
  const pats: RegExp[] = [
    /(?:update|change|edit|modify)\s+(?:customer|client)\s+(.+?)\s+(?:e-?mail|email)\b/i,
    /(?:update|change|edit|modify)\s+(.+?)\s+(?:customer|client)\s+(?:e-?mail|email)\b/i,
    /(?:e-?mail|email)\s+(?:for|of)\s+(.+?)$/i,
    /(?:for)\s+(.+?)\s+(?:set|to)\s+[^\s@]+@[^\s@]+\.[^\s@]+/i,
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const candidate = m[1]
      .replace(EMAIL_RE, '')
      .replace(/\b(to|as|into|set)\b.*$/i, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.!?]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!candidate) continue;
    if (/^(email|e-?mail|customer|client)$/i.test(candidate)) continue;
    if (/^(the|a|an|my|our)\s+(customer|client)$/i.test(candidate)) continue;
    name = candidate;
    break;
  }

  return {
    intentFamily: 'record_action',
    businessObject: 'customer',
    queryShape: 'edit_record',
    scope: 'customer',
    filters: {
      ...(name ? { customerNameHint: name } : {}),
      ...(emailHint ? { customerEmailHint: emailHint } : {}),
    },
    routeCategory: 'customer_actions',
    handlerHint: 'customer_email_update',
  };
}

/** Cross-workflow / invoice-draft breakout: short-circuit wizard continuation. */
export function looksLikeCustomerHistoryQuery(text: string): boolean {
  return parseCustomerHistoryStructuredQuery(text) != null;
}

/**
 * Extract a likely customer name from "edit … customer", "view customer …", etc.
 */
export function extractCustomerNameForRecordIntent(text: string): string {
  const t = text.trim();
  if (!t) return '';

  const beforeCustomer = t.match(
    /^(?:i\s+want\s+to\s+|i'd\s+like\s+to\s+|i\s+need\s+to\s+|please\s+|can\s+i\s+|can\s+you\s+|help\s+me\s+)?(?:edit|update|change|modify|view|open|show|see|display|find|look\s+up|lookup|get|pull\s+up)\s+(?:the|a|an|my|our)?\s*(.+?)\s+(?:customers?|clients?)(?:\s+profile|\s+record)?\s*\.?$/i
  );
  if (beforeCustomer?.[1]) {
    return beforeCustomer[1].replace(/^["']|["']$/g, '').trim();
  }

  const customerThenName = t.match(/\b(?:customers?|clients?)\s+(.+?)\s*$/i);
  if (customerThenName?.[1]) {
    const name = customerThenName[1].trim();
    if (!/^(profile|record|details?|info)$/i.test(name)) {
      return name.replace(/^["']|["']$/g, '').trim();
    }
  }

  const forTail = t.match(/\bfor\s+(.+?)\s*$/i);
  if (forTail?.[1] && /\b(?:customers?|clients?)\b/i.test(t)) {
    return forTail[1].replace(/^["']|["']$/g, '').replace(/^(?:the|a|an)\s+/i, '').trim();
  }

  return '';
}

const BROAD_CUSTOMER_LIST_RE =
  /\b(list|show\s+all|all\s+(?:my\s+)?(?:customers?|clients?)|my\s+(?:customers?|clients?)|search\s+(?:customers?|clients?)|find\s+(?:customers?|clients?))\b/i;

/** Ranking / aggregate queries about customers — not single-record lookup (must run before customer_record). */
const TOP_CUSTOMER_AGG_SIGNAL =
  /\b(top|best|biggest|highest|largest|leading|greatest|most)\b/i;
const REV_OR_RANK_TAIL = /\b(by\s+revenue|by\s+sales|per\s+revenue|ranked|ranking)\b/i;

/**
 * True when the user wants analytics (e.g. top/best customers by period), not "show customer X".
 */
export function looksLikeTopCustomersAggregateQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!/\b(?:customers?|clients?)\b/i.test(t)) return false;
  if (/\binvoices?\b/i.test(t)) return false;

  if (TOP_CUSTOMER_AGG_SIGNAL.test(t)) return true;
  if (/\bwho\s+are\s+(?:our|my|the)\s+(top|best|biggest|largest)\b/i.test(t)) return true;
  if (/\b(how\s+much|total)\b/i.test(t) && REV_OR_RANK_TAIL.test(t)) return true;
  if (/\b(most\s+revenue|highest\s+revenue|most\s+sales)\b/i.test(t)) return true;
  if (/\bby\s+revenue\b/i.test(t) && /\b(customers|clients)\b/i.test(t)) return true;

  return false;
}

/**
 * Period-over-period customer spending (collected) comparison — not customer list CRUD.
 * Must run before `parseCustomerRecordStructuredQuery` and before generic `customer_list` routing.
 */
export function looksLikeComparativeCustomerSpendingQuery(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+invoice\b/i.test(lower)) return false;
  if (parseInvoiceReferenceFromText(raw)) return false;

  const hasEntity =
    /\b(customers?|clients?)\b/i.test(lower) ||
    (/\bwho\b/i.test(lower) &&
      /\b(spending|spent|revenue|collected|paid|sales|payments?)\b/i.test(lower));

  if (!hasEntity) return false;

  const comparative =
    /\b(increased|decreased|increase|decrease|increasing|decreasing)\b/.test(lower) ||
    (/\b(more|less)\b/.test(lower) &&
      /\b(spending|spent|revenue|collected|paid|sales|buying|purchases?)\b/.test(lower)) ||
    /\b(growing|grew|growth|shrinking|shrank|declined|declining)\b/.test(lower) ||
    /\b(top\s+growing|fastest\s+growing|biggest\s+gainers?|biggest\s+losers?)\b/.test(lower) ||
    (/\b(higher|lower)\b/.test(lower) && /\b(spending|revenue|collected)\b/.test(lower));

  if (!comparative) return false;

  const moneyOrWh =
    /\b(spending|spent|spend|revenue|collected|payments?|paid|sales|buying|purchases?|amount)\b/i.test(lower) ||
    /\b(which|who|whose)\b/i.test(lower) ||
    /\b(top\s+growing|growing\s+customers?|customers?\s+growing)\b/i.test(lower);

  return moneyOrWh;
}

/** Tails that belong to invoice drafting, not customer name search. */
const DIRECT_EDIT_INVOICE_TAIL_RE =
  /^(due\s+date|line\s+items?|item|items|quantity|quantities|pricing|unit\s+price|payment|payments|payment\s+schedule|draft|memo|notes?|tax|discount|total|balance|amount|invoice|invoices|inv(?:oice)?\s*[#:]?\s*\d+)$/i;

function stripDirectEditNameHint(raw: string): string {
  return raw
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlausibleCustomerNameForDirectEdit(name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  const lower = n.toLowerCase();
  if (/^customers?$|^clients?$/.test(lower)) return false;
  if (DIRECT_EDIT_INVOICE_TAIL_RE.test(lower)) return false;
  return true;
}

/**
 * Bare "edit/update/modify &lt;name&gt;" — name only (DB routing in `assistant-intent-hierarchy`).
 */
export function tryParseBareEditCustomerNameIntent(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/\b(invoice|invoices)\b/i.test(t)) return null;
  if (parseInvoiceReferenceFromText(t)) return null;

  const m = t.match(
    /^(?:i\s+(?:want\s+to|need\s+to)\s+)?(?:please\s+|can\s+you\s+)?(?:edit|update|modify)\s+(.+)$/i
  );
  if (!m?.[1]) return null;

  let name = stripDirectEditNameHint(m[1]);
  name = name.replace(/^customers?\s+/i, '').replace(/^clients?\s+/i, '').trim();
  if (!isPlausibleCustomerNameForDirectEdit(name)) return null;

  return name;
}

/** @deprecated Prefer `tryParseBareEditCustomerNameIntent` + hierarchy resolver. */
export function parseCustomerDirectEditStructuredQuery(text: string): AssistantStructuredQuery | null {
  const name = tryParseBareEditCustomerNameIntent(text);
  if (!name) return null;
  return {
    intentFamily: 'record_action',
    businessObject: 'customer',
    queryShape: 'edit_record',
    scope: 'customer',
    filters: { customerNameHint: name },
    routeCategory: 'customer_actions',
    handlerHint: 'customer_record',
  };
}

/**
 * Single-customer edit / view / find — must run before generic `invoice` keyword routing.
 */
export function parseCustomerRecordStructuredQuery(text: string): AssistantStructuredQuery | null {
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (looksLikeCustomerLifecycleAnalyticsIntent(lower, t)) return null;

  if (looksLikeTopCustomersAggregateQuery(t)) return null;
  if (looksLikeComparativeCustomerSpendingQuery(lower, t)) return null;
  if (parseCustomerEmailUpdateStructuredQuery(t)) return null;
  if (parseCustomerHistoryStructuredQuery(t)) return null;

  if (/\binvoices?\b/i.test(t)) return null;
  if (!/\b(?:customers?|clients?)\b/i.test(t)) return null;

  const wantsEdit = /\b(edit|update|change|modify|manage)\b/i.test(t);
  const wantsViewFind = /\b(view|open|show|see|display|pull\s*up|look\s*up|lookup|find|get)\b/i.test(t);
  if (!wantsEdit && !wantsViewFind) return null;

  const name = extractCustomerNameForRecordIntent(t);
  if (!name && BROAD_CUSTOMER_LIST_RE.test(t)) return null;

  const isEdit = wantsEdit;

  const intentFamily: AssistantIntentFamily = isEdit ? 'record_action' : 'record_lookup';
  const queryShape: AssistantQueryShape = isEdit ? 'edit_record' : 'open_record';

  return {
    intentFamily,
    businessObject: 'customer',
    queryShape,
    scope: 'customer',
    filters: { customerNameHint: name || undefined },
    routeCategory: 'customer_actions',
    handlerHint: 'customer_record',
  };
}

function stripSuggestedCustomerCreateName(raw: string): string {
  return raw
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Inline “create / add / new customer &lt;name&gt;” — must run before the broad customer_list classifier.
 */
export function parseCustomerCreateStructuredQuery(text: string): AssistantStructuredQuery | null {
  const t = text.trim();
  if (!t) return null;
  if (/\binvoices?\b/i.test(t)) return null;

  const barePatterns = [
    /^create\s+(?:a\s+)?new\s+customer\s*$/i,
    /^create\s+customer\s*$/i,
    /^new\s+customer\s*$/i,
    /^add\s+(?:a\s+)?new\s+customer\s*$/i,
    /^add\s+customer\s*$/i,
  ];
  for (const re of barePatterns) {
    if (re.test(t)) {
      return {
        intentFamily: 'workflow_create',
        businessObject: 'customer',
        queryShape: 'create',
        scope: 'workspace',
        filters: {},
        routeCategory: 'customer_actions',
        handlerHint: 'customer_create',
      };
    }
  }

  const namedPatterns = [
    /^create\s+(?:a\s+)?new\s+customer\s+(.+)$/i,
    /^create\s+customer\s+(.+)$/i,
    /^new\s+customer\s+(.+)$/i,
    /^add\s+(?:a\s+)?new\s+customer\s+(.+)$/i,
    /^add\s+customer\s+(.+)$/i,
  ];
  for (const re of namedPatterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const name = stripSuggestedCustomerCreateName(m[1]);
      if (!name) return null;
      return {
        intentFamily: 'workflow_create',
        businessObject: 'customer',
        queryShape: 'create',
        scope: 'workspace',
        filters: { customerNameHint: name },
        routeCategory: 'customer_actions',
        handlerHint: 'customer_create',
      };
    }
  }

  return null;
}
