/**
 * Semantic structured intent for the business assistant.
 * Composes deterministic phrase rules (no LLM); handlers stay source-of-truth for data.
 *
 * Layers:
 * - intent_family — why the user is writing
 * - business_object — what domain entity
 * - query_shape — answer type (total, count, list, breakdown, …)
 * - scope / filters — workspace vs customer, status, dimension, period hints
 */

import type { PaymentsNaturalRangeSpec } from '@/lib/analytics/payments-received-time-range';
import {
  parseFinancialMetricRangeSpec,
  userTextContainsExplicitPaymentsPeriod,
} from '@/lib/business-assistant/financial-date-range-resolver';
import { looksLikeBusinessCollectedRevenueQuery } from '@/lib/business-assistant/financial-metric-resolve';
import { tryParseRevenueMetricFollowUpIntent } from '@/lib/business-assistant/revenue-metric-follow-up';
import type {
  AssistantActiveQueryContext,
  AssistantMetricSessionContext,
} from '@/lib/business-assistant/metric-session-context';
import type { AssistantIntentCategory } from '@/lib/business-assistant/types';
import {
  parseCustomerLifecycleStructuredQuery,
} from '@/lib/business-assistant/customer-lifecycle-intent';
import {
  looksLikeComparativeCustomerSpendingQuery,
  parseCustomerEmailUpdateStructuredQuery,
  looksLikeTopCustomersAggregateQuery,
  parseCustomerCreateStructuredQuery,
  parseCustomerHistoryStructuredQuery,
  parseCustomerRecordStructuredQuery,
} from '@/lib/business-assistant/customer-record-intent';
import {
  detectInvoiceLookupIntent,
  textLooksLikeCreateInvoiceFlow,
  textLooksLikeInvoicePaymentRecordingIntent,
} from '@/lib/invoices/invoice-chat-intent';
import { textLooksLikeUnpaidReceivablesReportingIntent } from '@/lib/invoices/assistant-receivables-intent';
import { textLooksLikeDailyBusinessSummary } from '@/lib/invoices/assistant-invoice-resolve-intent';
import { parseInvoiceReferenceFromText } from '@/lib/invoices/invoice-reference';
import { normalizeAssistantInput } from '@/lib/assistant/normalize-user-text';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export type AssistantIntentFamily =
  | 'metric_query'
  | 'record_lookup'
  | 'record_breakdown'
  | 'record_action'
  | 'workflow_create'
  | 'workflow_edit'
  | 'navigation'
  | 'help_explanation';

export type AssistantBusinessObject =
  | 'revenue'
  | 'invoice'
  | 'customer'
  | 'payment'
  | 'analytics'
  | 'unknown';

export type AssistantQueryShape =
  | 'total_amount'
  | 'count'
  | 'list'
  | 'breakdown'
  | 'open_record'
  | 'edit_record'
  | 'navigate'
  | 'create'
  | 'edit'
  | 'explain'
  | 'unknown';

export type AssistantScope = 'workspace' | 'customer';

export type AssistantStructuredFilters = {
  /** Parsed invoice ref when present */
  invoiceRef?: ReturnType<typeof parseInvoiceReferenceFromText> | null;
  invoiceStatus?: 'partially_paid' | 'unpaid' | 'overdue' | 'paid';
  breakdownDimension?: 'customer' | 'day' | 'invoice' | 'month' | 'currency';
  /** Revenue / collected KPIs: payments + partials */
  includePartialPayments?: boolean;
  /** Free-text name from customer edit / view / find utterances */
  customerNameHint?: string;
  /** Slot capture for guided customer email updates. */
  customerEmailHint?: string;
  /** True when user used bare "edit/update/modify &lt;name&gt;" (resolved in hierarchy). */
  bareEditFromVerbOnly?: boolean;
  /** Bare edit with no exact or fuzzy customer match — narrow clarification only. */
  bareEditNoMatch?: boolean;
  /** Two calendar windows for period-over-period assistant answers. */
  periodComparison?: {
    current: PaymentsNaturalRangeSpec;
    baseline: PaymentsNaturalRangeSpec;
  };
};

export type AssistantStructuredQuery = {
  intentFamily: AssistantIntentFamily;
  businessObject: AssistantBusinessObject;
  queryShape: AssistantQueryShape;
  scope: AssistantScope;
  filters: AssistantStructuredFilters;
  /** Natural-language period when parseable (financial / breakdown windows) */
  rangeSpec?: PaymentsNaturalRangeSpec | null;
  routeCategory: AssistantIntentCategory;
  /**
   * Optional bridge to `resolveFinancialMetricIntent` / follow-up parsers.
   * Handlers remain authoritative for DB work.
   */
  handlerHint?:
    | 'financial_metric'
    | 'revenue_follow_up'
    | 'invoice_wizard'
    | 'customer_list'
    | 'customer_record'
    | 'customer_create'
    | 'customer_email_update'
    | 'bare_edit_clarify'
    | 'analytics'
    | 'none'
    | 'daily_business_summary'
    | 'top_customers'
    | 'customer_history'
    | 'business_health_summary'
    | 'growth_check'
    | 'invoice_kpi_average'
    | 'inactive_customers'
    | 'churned_customers'
    | 'attention_summary'
    | 'risk_advisory'
    | 'collections_intelligence'
    | 'period_comparison'
    | 'revenue_why_diagnostic'
    | 'what_changed_summary'
    | 'customer_spending_comparison'
    | 'revenue_follow_up_choice_clarify'
    | 'revenue_follow_up_choice_decline'
    | 'invoice_superlative'
    | 'fallback';
};

export type AssistantStructuredParseResult = {
  query: AssistantStructuredQuery;
};

export function snapshotActiveQueryFromStructured(
  q: AssistantStructuredQuery,
  patch: Partial<AssistantActiveQueryContext> = {}
): AssistantActiveQueryContext {
  return {
    intentFamily: q.intentFamily,
    businessObject: q.businessObject,
    queryShape: q.queryShape,
    scope: q.scope,
    breakdownDimension: q.filters.breakdownDimension,
    invoiceStatusFilter: q.filters.invoiceStatus,
    includePartialPayments: q.filters.includePartialPayments,
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// Clarification policy (deterministic)
// ---------------------------------------------------------------------------

export type AssistantClarificationReason =
  | 'missing_record_target'
  | 'ambiguous_time'
  | 'multiple_matches';

/**
 * When to ask a follow-up question. Global metrics never require a customer.
 */
export function clarificationReasonForQuery(q: AssistantStructuredQuery): AssistantClarificationReason | null {
  if (q.scope === 'workspace' && q.intentFamily === 'metric_query') {
    return null;
  }
  if (q.routeCategory === 'navigation' || q.routeCategory === 'analytics_queries') {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Response rules (documentation + helpers for handlers)
// ---------------------------------------------------------------------------

/** Maps question phrasing to expected answer shape. */
export const ASSISTANT_QUERY_SHAPE_RULES = {
  how_much: 'total_amount' as const,
  how_many: 'count' as const,
  which: 'list' as const,
};

// ---------------------------------------------------------------------------
// Source-of-truth mapping (revenue / collected)
// ---------------------------------------------------------------------------

export const REVENUE_COLLECTED_SOURCE_OF_TRUTH = {
  data: 'payment_and_collection_records',
  includesPartials: true,
  paidInPeriodUses: 'payment_date',
  primaryTotal: 'base_currency',
} as const;

// ---------------------------------------------------------------------------
// Internal: collected-revenue invoice breakdown (same idea as detect-intent)
// ---------------------------------------------------------------------------

function looksLikeCollectedRevenueInvoiceBreakdownRefinement(text: string): boolean {
  if (!/\b(invoice|invoices)\b/i.test(text)) return false;
  if (/\b(line\s+items?)\b/i.test(text)) return false;
  if (parseInvoiceReferenceFromText(text)) return false;

  const lower = text.toLowerCase();
  if (
    /\bbreak\s+down\s+revenue\s+by\s+invoice\b/.test(lower) ||
    /\blist\s+invoices\s+paid\b/.test(lower)
  ) {
    return true;
  }
  if (
    /\bbreak\s+(it\s+)?down\b/.test(lower) ||
    /\bbreak\s+this\s+down\b/.test(lower) ||
    /\b(itemize|drill\s+down)\b/.test(lower)
  ) {
    return true;
  }
  if (/\binvoice\s+numbers?\b/.test(lower)) return true;
  if (/\b(per|each)\s+invoice\b/.test(lower)) return true;
  if (
    /\bby\s+invoice\b/.test(lower) &&
    /\b(break|list|show|split|detail|breakdown|drill|itemize|total|revenue|collected|amount|numbers?)\b/.test(
      lower
    )
  ) {
    return true;
  }
  return false;
}

function emptyQuery(category: AssistantIntentCategory): AssistantStructuredQuery {
  return {
    intentFamily: 'help_explanation',
    businessObject: 'unknown',
    queryShape: 'unknown',
    scope: 'workspace',
    filters: {},
    routeCategory: category,
    handlerHint: 'none',
  };
}

function hasReportingPeriod(lower: string): boolean {
  return /\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|(?:last|past|previous)\s+\d{1,3}\s+days?)\b/i.test(
    lower
  );
}

/**
 * Month-over-month growth without naming periods — must beat invoice-draft continuation.
 */
export function looksLikeGrowthCheckIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+invoice\b/i.test(lower)) return false;
  return (
    /\bare\s+we\s+growing\b/.test(lower) ||
    /\bare\s+we\s+improving\b/.test(lower) ||
    /\bare\s+we\s+doing\s+better\b/.test(lower) ||
    /\bhow\s+are\s+we\s+trending\b/.test(lower)
  );
}

/**
 * Causal “why is revenue down?” style questions — diagnostic compare, not a bare KPI repeat.
 */
export function looksLikeRevenueWhyDiagnosticIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+invoice\b/i.test(lower)) return false;

  const revenueTopic =
    /\b(revenue|sales|invoiced?\s+revenue|top\s*line|billing)\b/i.test(lower);
  if (!revenueTopic) return false;

  const causal =
    /\bwhy\b/i.test(lower) ||
    /\bwhat\s+caused\b/i.test(lower) ||
    /\bwhat\s+is\s+driving\b/i.test(lower) ||
    /\bwhat\s+drove\b/i.test(lower);
  const negative =
    /\b(down|drop|dropped|decline|declining|lower|fall|fallen|decrease|decreasing|weak|slow|slowing|worse)\b/i.test(
      lower
    ) || /\brevenue\s+decline\b/i.test(lower);

  return causal && negative;
}

/**
 * “What changed?” / “What’s different?” — period-over-period snapshot (not invoice wizard).
 */
export function looksLikeWhatChangedTrendIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+invoice\b/i.test(lower)) return false;

  const changePhrase =
    /\bwhat\s+(has\s+)?changed\b/.test(lower) ||
    /\bwhat'?s\s+different\b/.test(lower) ||
    /\bwhat\s+is\s+different\b/.test(lower) ||
    /\bwhat\s+moved\b/.test(lower) ||
    /\bwhat'?s\s+new\b/.test(lower) ||
    /\bwhat\s+is\s+new\b/.test(lower);

  if (!changePhrase) return false;

  if (parseInvoiceReferenceFromText(raw)) return false;
  if (/\b(invoice|inv)\s*#?\d+/i.test(raw)) return false;

  const whatsNewBare =
    /^\s*what'?s\s+new\s*[?.!]*\s*$/i.test(raw.trim()) ||
    /^\s*what\s+is\s+new\s*[?.!]*\s*$/i.test(raw.trim());
  if (whatsNewBare) return false;

  const isWhatsNew =
    /\bwhat'?s\s+new\b/.test(lower) || /\bwhat\s+is\s+new\b/.test(lower);
  if (isWhatsNew) {
    const scope =
      /\b(this|last|past)\s+(week|month|day|quarter|year)\b/i.test(lower) ||
      /\b(today|yesterday)\b/.test(lower) ||
      /\b(business|revenue|sales|workspace|numbers|metrics|cash|billing|invoices?)\b/i.test(lower) ||
      /\bweek\b/.test(lower) ||
      /\bmonth\b/.test(lower);
    if (!scope) return false;
  }

  return true;
}

export function looksLikeGenericAffirmation(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 48) return false;
  return /^(yes|yeah|yep|yup|ok|okay|sure|proceed|go\s*ahead|do\s+it|please|sounds?\s+good)(\s*[!.?])?$/i.test(
    t
  );
}

export function looksLikeGenericDecline(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 48) return false;
  return /^(no|nope|nah|not\s+now|maybe\s+later|not\s+right\s+now)(\s*[!.?])?$/i.test(t);
}

export function looksLikeInvoiceSuperlativeIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+invoice\b/i.test(lower)) return false;
  if (parseInvoiceReferenceFromText(raw)) return false;

  const hasSuperlative = /\b(biggest|largest|highest|top)\b/i.test(lower);
  if (!hasSuperlative) return false;
  const hasTarget =
    /\b(invoice|invoices)\b/i.test(lower) || /\bdeal\b/i.test(lower) || /\bticket\b/i.test(lower);
  if (!hasTarget) return false;
  if (/\bcustomers?\b/i.test(lower) && !/\binvoice|deal|ticket\b/i.test(lower)) return false;
  return true;
}

/**
 * Workspace KPIs that mention “invoice” but are analytics, not create/view workflow.
 */
export function looksLikeInvoiceKpiAverageIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build|send|email)\s+(an?\s+)?invoice\b/i.test(lower)) return false;
  if (/\b(open|edit|find|show|view)\s+invoice\b/i.test(lower)) return false;

  const avgDealOrInvoice =
    /\b(average|avg|mean)\s+(invoice|deal|ticket)(\s+(size|value|amount))?\b/i.test(lower) ||
    /\b(invoice|deal|ticket)\s+(average|avg|mean)(\s+(size|value|amount))?\b/i.test(lower) ||
    /\bavg\s+invoice\b/i.test(lower) ||
    /\baverage\s+deal\s+size\b/i.test(lower) ||
    /\bwhat'?s\s+our\s+average\s+invoice\b/i.test(lower) ||
    /\bwhat\s+is\s+(our|the)\s+average\s+invoice\b/i.test(lower) ||
    /\bhow\s+big\s+(is|are)\s+(our\s+)?(average\s+)?invoices?\b/i.test(lower);

  if (avgDealOrInvoice) return true;

  const metricCue =
    /\b(average|avg|mean|total|sum|count|how\s+many|how\s+much)\b/i.test(lower) &&
    /\b(invoice|invoices|deal\s+size)\b/i.test(lower) &&
    /\b(our|workspace|company|business)\b/i.test(lower) &&
    !/\bpartially\s+paid\b/.test(lower);

  return Boolean(metricCue && /\b(what|how|show|tell|give)\b/i.test(lower));
}

/**
 * Daily priority / “what needs attention” — workspace-wide; must not route to invoice wizard.
 */
export function looksLikeAttentionSummaryIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+(an?\s+)?invoice\b/i.test(lower)) return false;
  const urgencyList =
    /\b(show\s+|list\s+)?urgent\s+(items?|tasks?)\b/i.test(lower) ||
    /\b(show|list)\s+urgent\b/i.test(lower);
  return (
    urgencyList ||
    /\bwhat\s+needs\s+(my\s+)?attention\b/i.test(lower) ||
    /\bwhat\s+should\s+i\s+focus\s+on\b/i.test(lower) ||
    /\bwhat\s*(?:'s|is)\s+urgent\b/i.test(lower) ||
    /\bwhat\s+needs\s+attention\s+today\b/i.test(lower) ||
    /\bwhat\s+should\s+i\s+do\s+today\b/i.test(lower) ||
    /\bwhat\s+to\s+focus\s+on\s+today\b/i.test(lower) ||
    /\bwhat\s+should\s+i\s+focus\s+on\s+today\b/i.test(lower) ||
    /\bwhat\s+are\s+my\s+priorities\b/i.test(lower) ||
    /\b(priority|priorities)\s+dashboard\b/i.test(lower)
  );
}

/**
 * Collections follow-up — who to chase / who owes — must break out of invoice-draft continuation.
 */
export function looksLikeCollectionsIntelligenceIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build|send)\s+(an?\s+)?invoice\b/i.test(lower)) return false;
  /** Receivables list phrasing — keep `invoice_wizard` / receivables path (e.g. “who hasn’t paid us yet?”). */
  if (/\bwho\s+hasn'?t\s+paid\s+(us|them|me|you)\b/i.test(lower)) return false;

  const whoChase =
    /\bwho\s+should\s+i\s+(follow\s+up|chase|contact)\b/i.test(lower) ||
    /\bwho\s+(owes\s+me|hasn'?t\s+paid|do\s+i\s+chase)\b/i.test(lower) ||
    /\bwho\s+to\s+(follow\s+up|chase)\s+with\b/i.test(lower) ||
    /\bwhat\s+customers?\s+should\s+i\s+(chase|follow\s+up)\b/i.test(lower) ||
    /\bpending\s+collections?\b/i.test(lower) ||
    /\b(collection|collections)\s+(follow\s*up|priority|list|queue)\b/i.test(lower) ||
    (/\b(who|which)\s+(customers?|clients?)\s+should\s+i\b/i.test(lower) &&
      /\b(follow\s+up|chase|contact|owe|pay)\b/i.test(lower)) ||
    (/\bfollow\s+up\b/i.test(lower) && /\b(who|which|customers?|clients?)\b/i.test(lower)) ||
    (/\bchase\b/i.test(lower) && /\b(who|which|payment|money|owe)\b/i.test(lower)) ||
    /\bowes\s+me\s+(money)?\b/i.test(lower);

  const unpaidWho =
    /\bwho\b/i.test(lower) &&
    /\bunpaid\b/i.test(lower) &&
    !/\b(how\s+much|total\s+amount|amount\s+of|sum|what\s+is|what's|break\s+down|by\s+day|by\s+invoice)\b/i.test(
      lower
    );

  return Boolean(whoChase || unpaidWho);
}

/**
 * Risk / advisory questions — workspace-wide; must break out of invoice-draft continuation.
 * Narrow: risk / exposure / worry (not “what needs attention” — that stays `attention_summary`).
 */
export function looksLikeRiskAdvisoryIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build|send)\s+(an?\s+)?invoice\b/i.test(lower)) return false;

  return (
    /\bany\s+risks?\b/i.test(lower) ||
    /\bwhat\s+risks?\b/i.test(lower) ||
    /\brisks?\s+(that\s+)?(i\s+)?should\s+(i\s+)?know/i.test(lower) ||
    /\brisks?\s+to\s+(know|watch|avoid)/i.test(lower) ||
    /\bwhat\s+should\s+i\s+worry\b/i.test(lower) ||
    /\bshould\s+i\s+worry\b/i.test(lower) ||
    /\bwhere\s+am\s+i\s+exposed\b/i.test(lower) ||
    /\b(am\s+i\s+)?at\s+risk\b/i.test(lower) ||
    /\bfinancial\s+(risk|risks|exposure)\b/i.test(lower) ||
    /\bcash\s*flow\s+(risk|pressure|stress)\b/i.test(lower) ||
    /\b(concentration|dependency)\s+risk\b/i.test(lower) ||
    /\b(red\s+flags?|warning\s+signs?)\b/i.test(lower) ||
    (/\bexposure\b/i.test(lower) &&
      /\b(cash|financial|revenue|credit|liquidity|ar|receivables?|collections?)\b/i.test(lower)) ||
    (/\b(problems?|concerns?)\b/i.test(lower) &&
      /\b(should\s+i\s+know|worry\s+about|with\s+(my\s+)?(cash|business|finances?))\b/i.test(lower)) ||
    (/\badvisory\b/i.test(lower) && /\b(business|financial|cash|revenue)\b/i.test(lower))
  );
}

/**
 * Executive “how’s the business?” style questions — must win over invoice-draft continuation
 * and generic fallback when the user asks for a performance snapshot.
 */
export function looksLikeBusinessHealthSummaryIntent(lower: string, raw: string): boolean {
  if (looksLikeGrowthCheckIntent(lower, raw)) return false;
  if (/\b(create|draft|new|make|build)\s+invoice\b/i.test(lower)) return false;
  if (/\binvoice\s+summary\b/i.test(lower)) return false;
  /** Document-style “summary of invoices” — not a workspace business snapshot. */
  if (/\bsummary\s+of\s+(?:my\s+|our\s+|the\s+)?invoices?\b/i.test(lower)) return false;

  const strong =
    /\bhow\s+is\s+(the\s+)?(business|company)\b/.test(lower) ||
    /\bhow\s+is\s+(the\s+)?business\s+doing\b/.test(lower) ||
    /\bhow\s+are\s+we\s+(doing|performing)\b/.test(lower) ||
    /\bhow\s+did\s+we\s+do\b/.test(lower) ||
    /\bbusiness\s+performance\b/.test(lower) ||
    /\bgive\s+me\s+a\s+summary\b/.test(lower) ||
    /\bexecutive\s+(summary|overview)\b/.test(lower) ||
    /\bare\s+we\s+doing\s+well\b/.test(lower) ||
    /\bhow\s+is\s+business\b/.test(lower) ||
    /\bweekly\s+summary\b/.test(lower) ||
    /\b(business|performance)\s+snapshot\b/.test(lower) ||
    /\b(business|performance)\s+this\s+(week|month)\b/.test(lower);

  const period = hasReportingPeriod(lower);

  const softHow =
    (/\bhow\s+is\b/.test(lower) || /\bhow\s+are\b/.test(lower)) &&
    period &&
    /\b(we|business|company|things)\b/.test(lower);

  /** “Summarize” did not match `\bsummary\b` — include summarize/snapshot explicitly (analytics-first). */
  const summaryOrPerformance =
    (/\b(summarize|summarise|summary)\b/.test(lower) ||
      /\bperformance\b/.test(lower) ||
      /\bsnapshot\b/.test(lower)) &&
    (period || /\b(business|company|financial|we|our)\b/.test(lower)) &&
    !/\b(customer|invoice)\s+history\b/i.test(lower);

  return Boolean(raw.trim()) && (strong || softHow || summaryOrPerformance);
}

/**
 * Maps supported phrases to { current, baseline } — current is always the more recent window
 * (e.g. this month vs last month → growth is vs prior month).
 */
/**
 * When the user names only the “current” window (e.g. “what changed this week”), infer the baseline.
 */
export function tryInferDefaultPeriodComparisonForChangeQuery(lower: string): {
  current: PaymentsNaturalRangeSpec;
  baseline: PaymentsNaturalRangeSpec;
} | null {
  if (/\bthis\s+month\b/.test(lower) && !/\blast\s+month\b/.test(lower)) {
    return { current: { kind: 'this_month' }, baseline: { kind: 'last_month' } };
  }
  if (/\bthis\s+week\b/.test(lower) && !/\blast\s+week\b/.test(lower)) {
    return { current: { kind: 'this_week' }, baseline: { kind: 'last_week' } };
  }
  if (/\btoday\b/.test(lower) && !/\byesterday\b/.test(lower)) {
    return { current: { kind: 'today' }, baseline: { kind: 'yesterday' } };
  }
  return null;
}

export function tryParsePeriodComparisonPair(lower: string): {
  current: PaymentsNaturalRangeSpec;
  baseline: PaymentsNaturalRangeSpec;
} | null {
  const hasThisMonth = /\bthis\s+month\b/.test(lower);
  const hasLastMonth = /\blast\s+month\b/.test(lower);
  const hasThisWeek = /\bthis\s+week\b/.test(lower);
  const hasLastWeek = /\blast\s+week\b/.test(lower);
  const hasToday = /\btoday\b/.test(lower);
  const hasYesterday = /\byesterday\b/.test(lower);

  if (hasThisMonth && hasLastMonth) {
    return { current: { kind: 'this_month' }, baseline: { kind: 'last_month' } };
  }
  if (hasThisWeek && hasLastWeek) {
    return { current: { kind: 'this_week' }, baseline: { kind: 'last_week' } };
  }
  if (hasToday && hasYesterday) {
    return { current: { kind: 'today' }, baseline: { kind: 'yesterday' } };
  }
  if (/\b(month\s+over\s+month|\bmom\b)\b/i.test(lower)) {
    return { current: { kind: 'this_month' }, baseline: { kind: 'last_month' } };
  }
  if (/\b(?:vs\.?|versus|compared?\s+to)\s+last\s+month\b/.test(lower)) {
    return { current: { kind: 'this_month' }, baseline: { kind: 'last_month' } };
  }
  if (/\b(?:vs\.?|versus|compared?\s+to)\s+last\s+week\b/.test(lower)) {
    return { current: { kind: 'this_week' }, baseline: { kind: 'last_week' } };
  }
  if (/\b(?:vs\.?|versus|compared?\s+to)\s+yesterday\b/.test(lower)) {
    return { current: { kind: 'today' }, baseline: { kind: 'yesterday' } };
  }
  return null;
}

/** Period-over-period analytics — must break out of invoice-draft continuation. */
export function looksLikePeriodComparisonIntent(lower: string, raw: string): boolean {
  if (!raw.trim()) return false;
  if (/\b(create|draft|new|make|build)\s+invoice\b/i.test(lower)) return false;
  const pair = tryParsePeriodComparisonPair(lower);
  if (!pair) return false;

  const compareCue =
    /\bcompare\b/i.test(lower) ||
    /\bvs\.?\b/i.test(lower) ||
    /\bversus\b/i.test(lower) ||
    /\bdifference\b/i.test(lower) ||
    /\bchange\b/i.test(lower) ||
    /\bmonth\s+over\s+month\b/i.test(lower) ||
    /\bmom\b/i.test(lower) ||
    /\bhow\s+did\s+we\s+do\b/i.test(lower);

  const bothNamed =
    (/\bthis\s+month\b/.test(lower) && /\blast\s+month\b/.test(lower)) ||
    (/\bthis\s+week\b/.test(lower) && /\blast\s+week\b/.test(lower)) ||
    (/\btoday\b/.test(lower) && /\byesterday\b/.test(lower));

  return compareCue || bothNamed || /\b(month\s+over\s+month|\bmom\b)\b/i.test(lower);
}

function isHighConfidenceReportingOverride(lower: string): boolean {
  if (
    /\b(break\s+down|breakdown|grouped\s+by|by\s+(customer|day|invoice|month|currency)|per\s+customer|per\s+invoice)\b/i.test(
      lower
    )
  ) {
    return false;
  }
  const hasReportingKeyword =
    /\b(paid|collected|received|payments?\s+received|unpaid|overdue|revenue|outstanding)\b/i.test(
      lower
    );
  if (!hasReportingKeyword || !hasReportingPeriod(lower)) return false;
  if (/\b(create|draft|new|make|build)\s+invoice\b/i.test(lower)) return false;
  const hasQueryStyle = /\b(what|how\s+much|show|list)\b/i.test(lower);
  return hasQueryStyle || /\b(invoice|invoices|payments?)\b/i.test(lower);
}

/**
 * Tier 1 — strong explicit: invoice create, keyworded customer record, customer create, invoice ref lookup.
 * Bare "edit <name>" is resolved in `assistant-intent-hierarchy` (DB-aware).
 */
export function parseAssistantStrongExplicitStructuredQuery(text: string): AssistantStructuredQuery | null {
  const t = normalizeAssistantInput(text).normalized;
  if (!t) return null;
  const lifecycle = parseCustomerLifecycleStructuredQuery(t);
  if (lifecycle) return lifecycle;
  const customerHistory = parseCustomerHistoryStructuredQuery(t);
  if (customerHistory) return customerHistory;
  if (textLooksLikeCreateInvoiceFlow(t)) {
    return {
      intentFamily: 'workflow_create',
      businessObject: 'invoice',
      queryShape: 'create',
      scope: 'workspace',
      filters: {},
      routeCategory: 'invoice_actions',
      handlerHint: 'invoice_wizard',
    };
  }
  const customerEmailUpdate = parseCustomerEmailUpdateStructuredQuery(t);
  if (customerEmailUpdate) return customerEmailUpdate;
  const customerRecord = parseCustomerRecordStructuredQuery(t);
  if (customerRecord) return customerRecord;
  const customerCreate = parseCustomerCreateStructuredQuery(t);
  if (customerCreate) return customerCreate;
  const lookupKind = detectInvoiceLookupIntent(t);
  if (lookupKind) {
    const ref = parseInvoiceReferenceFromText(t);
    return {
      intentFamily: 'record_lookup',
      businessObject: 'invoice',
      queryShape: 'open_record',
      scope: 'workspace',
      filters: { invoiceRef: ref },
      routeCategory: 'invoice_actions',
      handlerHint: 'invoice_wizard',
    };
  }
  return null;
}

/**
 * Tier 4–5 — metrics, breakdowns, invoice keywords, navigation, collected revenue; ends with non-invoice fallback.
 */
export function parseAssistantMetricAndFallbackStructuredQuery(
  text: string,
  metricSession?: AssistantMetricSessionContext | null
): AssistantStructuredQuery {
  const t = normalizeAssistantInput(text).normalized;
  const lower = t.toLowerCase();
  const ref = parseInvoiceReferenceFromText(t);
  const revenueFollowUp = tryParseRevenueMetricFollowUpIntent(t);

  if (metricSession?.pending_followup_choice && looksLikeGenericAffirmation(t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'revenue',
      queryShape: 'explain',
      scope: 'workspace',
      filters: {},
      routeCategory: 'financial_queries',
      handlerHint: 'revenue_follow_up_choice_clarify',
    };
  }
  if (metricSession?.pending_followup_choice && looksLikeGenericDecline(t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'revenue',
      queryShape: 'explain',
      scope: 'workspace',
      filters: {},
      routeCategory: 'financial_queries',
      handlerHint: 'revenue_follow_up_choice_decline',
    };
  }

  if (looksLikeInvoiceSuperlativeIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'invoice',
      queryShape: 'list',
      scope: 'workspace',
      filters: {},
      rangeSpec: parseFinancialMetricRangeSpec(lower),
      routeCategory: 'financial_queries',
      handlerHint: 'invoice_superlative',
    };
  }

  const invoiceDimFollowUp =
    /\bby\s+invoice\b/i.test(t) ||
    /\binvoice\s+numbers?\b/i.test(t) ||
    /\b(per|each)\s+invoice\b/i.test(t) ||
    (/\b(break|breakdown|drill|itemize|split|detail|list|show)\b/i.test(t) && /\b(invoice|invoices)\b/i.test(t));
  if (
    metricSession?.currentMetric === 'collected_revenue' &&
    metricSession.paymentsWindow?.startIso &&
    metricSession.paymentsWindow.endIso &&
    metricSession.paymentsWindow.timezone &&
    invoiceDimFollowUp &&
    !ref &&
    !/\b(line\s+items?)\b/i.test(t)
  ) {
    return {
        intentFamily: 'record_breakdown',
        businessObject: 'revenue',
        queryShape: 'breakdown',
        scope: 'workspace',
        filters: {
          breakdownDimension: 'invoice',
          includePartialPayments: true,
        },
        rangeSpec: null,
        routeCategory: 'financial_queries',
        handlerHint: 'revenue_follow_up',
    };
  }

  const periodPair = tryParsePeriodComparisonPair(lower);
  if (periodPair && looksLikePeriodComparisonIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'analytics',
      queryShape: 'explain',
      scope: 'workspace',
      filters: { periodComparison: periodPair },
      rangeSpec: periodPair.current,
      routeCategory: 'analytics_queries',
      handlerHint: 'period_comparison',
    };
  }

  const momPair = { current: { kind: 'this_month' as const }, baseline: { kind: 'last_month' as const } };
  if (looksLikeRevenueWhyDiagnosticIntent(lower, t)) {
    const pairForWhy = periodPair ?? momPair;
    return {
      intentFamily: 'metric_query',
      businessObject: 'revenue',
      queryShape: 'explain',
      scope: 'workspace',
      filters: { periodComparison: pairForWhy },
      rangeSpec: pairForWhy.current,
      routeCategory: 'analytics_queries',
      handlerHint: 'revenue_why_diagnostic',
    };
  }

  const weekPair = { current: { kind: 'this_week' as const }, baseline: { kind: 'last_week' as const } };
  if (looksLikeWhatChangedTrendIntent(lower, t)) {
    const changePair =
      periodPair ?? tryInferDefaultPeriodComparisonForChangeQuery(lower) ?? weekPair;
    return {
      intentFamily: 'metric_query',
      businessObject: 'analytics',
      queryShape: 'explain',
      scope: 'workspace',
      filters: { periodComparison: changePair },
      rangeSpec: changePair.current,
      routeCategory: 'analytics_queries',
      handlerHint: 'what_changed_summary',
    };
  }

  if (looksLikeGrowthCheckIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'analytics',
      queryShape: 'explain',
      scope: 'workspace',
      filters: { periodComparison: momPair },
      rangeSpec: momPair.current,
      routeCategory: 'analytics_queries',
      handlerHint: 'growth_check',
    };
  }

  if (looksLikeCollectionsIntelligenceIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'analytics',
      queryShape: 'list',
      scope: 'workspace',
      filters: {},
      routeCategory: 'analytics_queries',
      handlerHint: 'collections_intelligence',
    };
  }

  if (looksLikeRiskAdvisoryIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'analytics',
      queryShape: 'explain',
      scope: 'workspace',
      filters: {},
      rangeSpec: parseFinancialMetricRangeSpec(lower),
      routeCategory: 'analytics_queries',
      handlerHint: 'risk_advisory',
    };
  }

  if (looksLikeBusinessHealthSummaryIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'analytics',
      queryShape: 'explain',
      scope: 'workspace',
      filters: {},
      rangeSpec: parseFinancialMetricRangeSpec(lower),
      routeCategory: 'analytics_queries',
      handlerHint: 'business_health_summary',
    };
  }

  if (looksLikeAttentionSummaryIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'analytics',
      queryShape: 'explain',
      scope: 'workspace',
      filters: {},
      routeCategory: 'analytics_queries',
      handlerHint: 'attention_summary',
    };
  }

  if (textLooksLikeDailyBusinessSummary(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'invoice',
      queryShape: 'count',
      scope: 'workspace',
      filters: {},
      routeCategory: 'general',
      handlerHint: 'daily_business_summary',
    };
  }

  if (looksLikeComparativeCustomerSpendingQuery(lower, t)) {
    const momPair = { current: { kind: 'this_month' as const }, baseline: { kind: 'last_month' as const } };
    const spendingPair =
      periodPair ?? tryInferDefaultPeriodComparisonForChangeQuery(lower) ?? momPair;
    return {
      intentFamily: 'metric_query',
      businessObject: 'customer',
      queryShape: 'breakdown',
      scope: 'workspace',
      filters: { periodComparison: spendingPair, includePartialPayments: true },
      rangeSpec: spendingPair.current,
      routeCategory: 'analytics_queries',
      handlerHint: 'customer_spending_comparison',
    };
  }

  if (looksLikeTopCustomersAggregateQuery(t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'customer',
      queryShape: 'list',
      scope: 'workspace',
      filters: { includePartialPayments: true },
      rangeSpec: parseFinancialMetricRangeSpec(lower),
      routeCategory: 'analytics_queries',
      handlerHint: 'top_customers',
    };
  }

  if (looksLikeInvoiceKpiAverageIntent(lower, t)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'invoice',
      queryShape: 'total_amount',
      scope: 'workspace',
      filters: {},
      rangeSpec: parseFinancialMetricRangeSpec(lower),
      routeCategory: 'analytics_queries',
      handlerHint: 'invoice_kpi_average',
    };
  }

  if (
    /\b(invoice|invoices)\b/i.test(t) &&
    /\bpaid\b/.test(lower) &&
    !/\b(unpaid|overdue)\b/.test(lower) &&
    userTextContainsExplicitPaymentsPeriod(lower) &&
    !/\bhow\s+many\b/.test(lower) &&
    (/\b(how\s+much|total\s+amount|amount\s+of)\b/.test(lower) ||
      /\bwhat\s+(is|was)\b/.test(lower) ||
      /\bwhat's\b/.test(lower) ||
      (/\b(total|sum)\b/.test(lower) && /\b(paid|collected)\b/.test(lower)))
  ) {
    return {
        intentFamily: 'metric_query',
        businessObject: 'revenue',
        queryShape: 'total_amount',
        scope: 'workspace',
        filters: { includePartialPayments: true },
        rangeSpec: parseFinancialMetricRangeSpec(lower),
        routeCategory: 'financial_queries',
        handlerHint: 'financial_metric',
    };
  }

  if (isHighConfidenceReportingOverride(lower)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'revenue',
      queryShape: /\bhow\s+many\b/i.test(lower) ? 'count' : 'total_amount',
      scope: 'workspace',
      filters: { includePartialPayments: true },
      rangeSpec: parseFinancialMetricRangeSpec(lower),
      routeCategory: 'financial_queries',
      handlerHint: 'financial_metric',
    };
  }

  if (/\blist\s+invoices\s+paid\b/i.test(t)) {
    return {
        intentFamily: 'record_breakdown',
        businessObject: 'revenue',
        queryShape: 'breakdown',
        scope: 'workspace',
        filters: { breakdownDimension: 'invoice', includePartialPayments: true },
        rangeSpec: parseFinancialMetricRangeSpec(lower),
        routeCategory: 'financial_queries',
        handlerHint: 'revenue_follow_up',
    };
  }

  if (/^\s*by\s+(invoice|customer|day|currency|month)\.?\s*$/i.test(t)) {
    const dimMatch = lower.match(/by\s+(invoice|customer|day|currency|month)\b/);
    const dim = dimMatch?.[1] as AssistantStructuredFilters['breakdownDimension'];
    return {
        intentFamily: 'record_breakdown',
        businessObject: 'revenue',
        queryShape: 'breakdown',
        scope: 'workspace',
        filters: {
          breakdownDimension: dim ?? 'invoice',
          includePartialPayments: true,
        },
        rangeSpec: null,
        routeCategory: 'financial_queries',
        handlerHint: 'revenue_follow_up',
    };
  }

  if (/\bbreak\s+down\s+revenue\s+by\s+(invoice|customer|day|currency)\b/i.test(t)) {
    const m = lower.match(/\bbreak\s+down\s+revenue\s+by\s+(invoice|customer|day|currency)\b/);
    const dim = (m?.[1] ?? 'invoice') as 'invoice' | 'customer' | 'day' | 'currency';
    return {
        intentFamily: 'record_breakdown',
        businessObject: 'revenue',
        queryShape: 'breakdown',
        scope: 'workspace',
        filters: { breakdownDimension: dim, includePartialPayments: true },
        rangeSpec: parseFinancialMetricRangeSpec(lower),
        routeCategory: 'financial_queries',
        handlerHint: revenueFollowUp ? 'revenue_follow_up' : 'financial_metric',
    };
  }

  if (looksLikeCollectedRevenueInvoiceBreakdownRefinement(t)) {
    return {
        intentFamily: 'record_breakdown',
        businessObject: 'revenue',
        queryShape: 'breakdown',
        scope: 'workspace',
        filters: {
          breakdownDimension: 'invoice',
          includePartialPayments: true,
        },
        rangeSpec: parseFinancialMetricRangeSpec(lower),
        routeCategory: 'financial_queries',
        handlerHint: 'revenue_follow_up',
    };
  }

  // Payments received, grouped by original currency (payment time). Beats generic fallback when e.g. "amounts" plural bypassed broad collected heuristics.
  if (
    /\b(by\s+currency|per\s+currency|grouped\s+by\s+currency)\b/i.test(t) &&
    /\b(collected|collections?|payments?\s+received|payment\s+received|money\s+received)\b/i.test(lower)
  ) {
    return {
      intentFamily: 'record_breakdown',
      businessObject: 'revenue',
      queryShape: 'breakdown',
      scope: 'workspace',
      filters: { breakdownDimension: 'currency', includePartialPayments: true },
      rangeSpec: parseFinancialMetricRangeSpec(lower),
      routeCategory: 'financial_queries',
      handlerHint: 'revenue_follow_up',
    };
  }

  // Workspace metric: partially paid invoice count (must beat broad `invoices` → invoice_actions).
  if (
    /\b(invoice|invoices)\b/i.test(t) &&
    /\b(partially\s+paid|partial(?:ly)?\s+payments?)\b/.test(lower) &&
    (/\bhow\s+many\b/.test(lower) ||
      /\b(number|count)\s+of\b/.test(lower) ||
      /\bhow\s+many\s+do\s+i\s+have\b/.test(lower)) &&
    !/\b(balance|remaining|amount\s*paid|invoice\s+total|show|list|give|tell|display|break\s*down|details?|each|every|lines?|total\s*[,]?\s*paid|paid\s*[,]?\s*balance|paid\s+and\s+balance|what\s+(is|are)\s+the)\b/.test(
      lower
    )
  ) {
    return {
        intentFamily: 'metric_query',
        businessObject: 'invoice',
        queryShape: 'count',
        scope: 'workspace',
        filters: { invoiceStatus: 'partially_paid' },
        routeCategory: 'financial_queries',
        handlerHint: 'financial_metric',
    };
  }

  // Partially paid: total / paid / balance per invoice (workspace snapshot; routes before invoice wizard).
  if (
    /\b(invoice|invoices)\b/i.test(t) &&
    /\b(partially\s+paid|partial(?:ly)?\s+payments?)\b/.test(lower)
  ) {
    return {
        intentFamily: 'metric_query',
        businessObject: 'invoice',
        queryShape: 'list',
        scope: 'workspace',
        filters: { invoiceStatus: 'partially_paid' },
        routeCategory: 'financial_queries',
        handlerHint: 'financial_metric',
    };
  }

  // Unpaid / AR / receivables reporting — beats broad `invoice` → wizard when message has no explicit create flow.
  if (textLooksLikeUnpaidReceivablesReportingIntent(lower, metricSession ?? null)) {
    return {
      intentFamily: 'metric_query',
      businessObject: 'invoice',
      queryShape: 'count',
      scope: 'workspace',
      filters: {},
      routeCategory: 'invoice_actions',
      handlerHint: 'invoice_wizard',
    };
  }

  // Payment action synonyms should route into invoice action handling, not generic fallback.
  if (
    textLooksLikeInvoicePaymentRecordingIntent(t) ||
    (/\b(payment|paid)\b/i.test(t) &&
      /\b(record|add|log|register|mark)\b/i.test(t) &&
      !userTextContainsExplicitPaymentsPeriod(lower))
  ) {
    return {
      intentFamily: 'record_action',
      businessObject: 'invoice',
      queryShape: 'unknown',
      scope: 'workspace',
      filters: {},
      routeCategory: 'invoice_actions',
      handlerHint: 'invoice_wizard',
    };
  }

  if (/\b(invoice|invoices)\b/i.test(t)) {
    return {
        intentFamily: 'record_action',
        businessObject: 'invoice',
        queryShape: 'unknown',
        scope: 'workspace',
        filters: {},
        routeCategory: 'invoice_actions',
        handlerHint: 'invoice_wizard',
    };
  }
  if (/\binv[-\s#]/i.test(t)) {
    return {
        intentFamily: 'record_action',
        businessObject: 'invoice',
        queryShape: 'unknown',
        scope: 'workspace',
        filters: {},
        routeCategory: 'invoice_actions',
        handlerHint: 'invoice_wizard',
    };
  }
  if (/\b(line\s+items?|due\s+date|draft\s+invoice|payment\s+schedule)\b/i.test(t)) {
    return {
        intentFamily: 'record_action',
        businessObject: 'invoice',
        queryShape: 'unknown',
        scope: 'workspace',
        filters: {},
        routeCategory: 'invoice_actions',
        handlerHint: 'invoice_wizard',
    };
  }

  if (
    /\b(customers?|clients?|contacts?)\b/i.test(t) &&
    /\b(list|show|all|search|find|add|new|create|who\s+are|which)\b/i.test(t)
  ) {
    return {
        intentFamily: 'record_lookup',
        businessObject: 'customer',
        queryShape: 'list',
        scope: 'workspace',
        filters: {},
        routeCategory: 'customer_actions',
        handlerHint: 'customer_list',
    };
  }
  if (/\b(who\s+are|which)\s+(my\s+)?(customers?|clients?)\b/i.test(t)) {
    return {
        intentFamily: 'record_lookup',
        businessObject: 'customer',
        queryShape: 'list',
        scope: 'workspace',
        filters: {},
        routeCategory: 'customer_actions',
        handlerHint: 'customer_list',
    };
  }

  if (/\b(insight|insights|trend|trends|anomal)\b/i.test(t) && !/\b(invoice|invoices)\b/i.test(t)) {
    return {
        intentFamily: 'metric_query',
        businessObject: 'analytics',
        queryShape: 'explain',
        scope: 'workspace',
        filters: {},
        routeCategory: 'analytics_queries',
        handlerHint: 'analytics',
    };
  }

  if (
    /\b(revenue|profit|loss|p&l|p\s*&\s*l|cash\s*flow|margin|kpi|forecast)\b/i.test(t) ||
    /\b(how\s+much\s+did|financial|earnings)\b/i.test(t) ||
    /\b(cash\s+collected|money\s+collected|gross\s+sales|turnover)\b/i.test(t) ||
    /\b(payments?\s+received|took\s+in|cash\s+in)\b/i.test(t) ||
    /\b(total\s+unpaid|unpaid\s+total|outstanding\s+balance)\b/i.test(t) ||
    /\b(ar|a\/r)\s+balance\b/i.test(t) ||
    /\baccounts\s+receivable\b/i.test(t) ||
    /\bhow\s+much\b.*\b(unpaid|outstanding)\b/i.test(t) ||
    /\b(overdue\s+total|total\s+overdue|overdue\s+amount|overdue\s+balance)\b/i.test(t) ||
    /\bhow\s+much\b.*\boverdue\b/i.test(t) ||
    (/\b(how\s+many|number\s+of|count\s+of)\s+invoices?\b/i.test(t) &&
      /\b(today|yesterday|week|month|mtd|7\s+days)\b/i.test(t))
  ) {
    return {
        intentFamily: 'metric_query',
        businessObject: /\b(invoice|invoices)\b/i.test(t) ? 'invoice' : 'revenue',
        queryShape: /\bhow\s+many\b/i.test(t) ? 'count' : 'total_amount',
        scope: 'workspace',
        filters: {
          includePartialPayments: /\b(revenue|collected|payments?\s+received|gross\s+sales|turnover|took\s+in|cash\s+in)\b/i.test(
            lower
          ),
        },
        rangeSpec: parseFinancialMetricRangeSpec(lower),
        routeCategory: 'financial_queries',
        handlerHint: 'financial_metric',
    };
  }

  if (
    /\b(go\s+to|take\s+me\s+to|open\s+the|navigate\s+to|show\s+me\s+the)\b/i.test(t) ||
    /\b(sidebar|settings|preferences)\b/i.test(t)
  ) {
    return {
        intentFamily: 'navigation',
        businessObject: 'unknown',
        queryShape: 'navigate',
        scope: 'workspace',
        filters: {},
        routeCategory: 'navigation',
        handlerHint: 'none',
    };
  }

  if (looksLikeBusinessCollectedRevenueQuery(lower)) {
    return {
        intentFamily: 'metric_query',
        businessObject: 'revenue',
        queryShape: 'total_amount',
        scope: 'workspace',
        filters: { includePartialPayments: true },
        rangeSpec: parseFinancialMetricRangeSpec(lower),
        routeCategory: 'financial_queries',
        handlerHint: 'financial_metric',
    };
  }

  return {
    intentFamily: 'help_explanation',
    businessObject: 'unknown',
    queryShape: 'unknown',
    scope: 'workspace',
    filters: {},
    routeCategory: 'general',
    handlerHint: 'fallback',
  };
}

/**
 * Parse user text into structured intent and a routing category.
 * Strong explicit first, then metrics / invoice keywords / fallback (no bare "edit <name>" without DB).
 */
export function parseAssistantStructuredQuery(
  text: string,
  metricSession?: AssistantMetricSessionContext | null
): AssistantStructuredParseResult {
  const t = normalizeAssistantInput(text).normalized;
  if (!t) {
    return { query: emptyQuery('general') };
  }
  const strong = parseAssistantStrongExplicitStructuredQuery(t);
  if (strong) {
    return { query: strong };
  }
  return { query: parseAssistantMetricAndFallbackStructuredQuery(t, metricSession ?? null) };
}

