/**
 * Deterministic Assistant routing tiers (single source for priority).
 *
 * 1. Strong explicit action (sync + DB-backed bare “edit &lt;name&gt;”)
 * 2. Active workflow command (invoice draft defers metrics unless user crosses domains)
 * 3. Confirmation reply — handled in `invoice-wizard` POST before this resolver runs
 * 4. Query / metric / breakdown (sync rules)
 * 5. Fallback — never auto-starts invoice wizard (unless `activeWorkflow` is create/edit invoice; then bare text stays in wizard)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { looksLikeBusinessCollectedRevenueQuery } from '@/lib/business-assistant/financial-metric-resolve';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import {
  findCustomerRecordsByName,
  suggestCustomersBySimilarity,
} from '@/lib/business-assistant/assistant-customer-find';
import type { AssistantStructuredQuery } from '@/lib/business-assistant/assistant-structured-intent';
import { looksLikeCustomerLifecycleAnalyticsIntent } from '@/lib/business-assistant/customer-lifecycle-intent';
import {
  looksLikeAttentionSummaryIntent,
  looksLikeBusinessHealthSummaryIntent,
  looksLikeGrowthCheckIntent,
  looksLikeInvoiceKpiAverageIntent,
  looksLikeInvoiceSuperlativeIntent,
  looksLikePeriodComparisonIntent,
  looksLikeRevenueWhyDiagnosticIntent,
  looksLikeCollectionsIntelligenceIntent,
  looksLikeRiskAdvisoryIntent,
  looksLikeWhatChangedTrendIntent,
  parseAssistantMetricAndFallbackStructuredQuery,
  parseAssistantStrongExplicitStructuredQuery,
} from '@/lib/business-assistant/assistant-structured-intent';
import { normalizeAssistantInput } from '@/lib/assistant/normalize-user-text';
import {
  looksLikeComparativeCustomerSpendingQuery,
  looksLikeCustomerHistoryQuery,
  looksLikeTopCustomersAggregateQuery,
  parseCustomerCreateStructuredQuery,
  parseCustomerRecordStructuredQuery,
  tryParseBareEditCustomerNameIntent,
} from '@/lib/business-assistant/customer-record-intent';
import { textLooksLikeUnpaidReceivablesReportingIntent } from '@/lib/invoices/assistant-receivables-intent';
import { textLooksLikeDailyBusinessSummary } from '@/lib/invoices/assistant-invoice-resolve-intent';
import {
  detectInvoiceLookupIntent,
  textLooksLikeCreateInvoiceFlow,
  textLooksLikeInvoicePaymentRecordingIntent,
} from '@/lib/invoices/invoice-chat-intent';
import type { ActiveWorkflow } from '@/lib/invoices/conversational-invoice-wizard/types';
import type { PendingAssistantCustomer } from '@/lib/invoices/conversational-invoice-wizard/types';
import type { InvoiceWizardStep } from '@/lib/invoices/conversational-invoice-wizard/types';
import { tryParseRevenueMetricFollowUpIntent } from '@/lib/business-assistant/revenue-metric-follow-up';

export type AssistantRoutingTier = 1 | 2 | 3 | 4 | 5;

/** Top-level intent families for logging / future persistence (orthogonal to legacy `intentFamily`). */
export type AssistantHierarchyIntentFamily =
  | 'create_customer'
  | 'edit_customer'
  | 'view_customer'
  | 'create_invoice'
  | 'edit_invoice'
  | 'view_invoice'
  | 'invoice_payment_action'
  | 'metric_query'
  | 'metric_breakdown'
  | 'confirmation_reply'
  | 'workflow_field_input'
  | 'session_control'
  | 'fallback';

export type AssistantHierarchyResolution = {
  tier: AssistantRoutingTier;
  family: AssistantHierarchyIntentFamily;
  query: AssistantStructuredQuery;
};

const ACTIVE_WORKFLOW_CLIENT = new Set<string>([
  'create_customer',
  'edit_customer',
  'create_invoice',
  'edit_invoice',
  'metric_query',
  'lookup_customer',
  'lookup_invoice',
]);

export function coerceActiveWorkflowFromClient(raw: unknown): ActiveWorkflow | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return ACTIVE_WORKFLOW_CLIENT.has(t) ? (t as ActiveWorkflow) : null;
}

function customerRecordEditQuery(nameHint: string, bareVerbOnly?: boolean): AssistantStructuredQuery {
  return {
    intentFamily: 'record_action',
    businessObject: 'customer',
    queryShape: 'edit_record',
    scope: 'customer',
    filters: {
      customerNameHint: nameHint,
      ...(bareVerbOnly ? { bareEditFromVerbOnly: true } : {}),
    },
    routeCategory: 'customer_actions',
    handlerHint: 'customer_record',
  };
}

function bareEditClarifyQuery(nameHint: string): AssistantStructuredQuery {
  return {
    intentFamily: 'help_explanation',
    businessObject: 'customer',
    queryShape: 'explain',
    scope: 'workspace',
    filters: { customerNameHint: nameHint, bareEditNoMatch: true },
    routeCategory: 'customer_actions',
    handlerHint: 'bare_edit_clarify',
  };
}

function minimalInvoiceWizardContinueQuery(): AssistantStructuredQuery {
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

/** User is explicitly switching away from an in-progress invoice draft. */
function metricSessionHasPaymentsWindowForDrillDown(ms: AssistantMetricSessionContext | null): boolean {
  const pw = ms?.paymentsWindow;
  return Boolean(pw?.startIso && pw?.endIso && pw?.timezone && pw?.label);
}

/**
 * Bare chips like "by invoice" / "by day" continue the last collected-revenue report when the client
 * echoed `metric_session_context.paymentsWindow`. Without that anchor, invoice-draft workflow still
 * absorbs ambiguous short replies (see tier-2 guard below).
 */
export function isRevenueReportDrillDownChip(
  userText: string,
  metricSession: AssistantMetricSessionContext | null
): boolean {
  if (!metricSessionHasPaymentsWindowForDrillDown(metricSession)) return false;
  return tryParseRevenueMetricFollowUpIntent(userText) != null;
}

export function textLooksLikeCrossWorkflowIntent(userText: string): boolean {
  const t = userText.trim();
  const lower = t.toLowerCase();
  if (!t) return false;
  if (looksLikePeriodComparisonIntent(lower, t)) return true;
  if (looksLikeRevenueWhyDiagnosticIntent(lower, t)) return true;
  if (looksLikeWhatChangedTrendIntent(lower, t)) return true;
  if (looksLikeInvoiceSuperlativeIntent(lower, t)) return true;
  if (looksLikeGrowthCheckIntent(lower, t)) return true;
  if (looksLikeInvoiceKpiAverageIntent(lower, t)) return true;
  if (looksLikeCustomerLifecycleAnalyticsIntent(lower, t)) return true;
  if (looksLikeBusinessHealthSummaryIntent(lower, t)) return true;
  if (looksLikeCollectionsIntelligenceIntent(lower, t)) return true;
  if (looksLikeRiskAdvisoryIntent(lower, t)) return true;
  if (looksLikeAttentionSummaryIntent(lower, t)) return true;
  if (textLooksLikeInvoicePaymentRecordingIntent(t)) return true;
  if (textLooksLikeCreateInvoiceFlow(t)) return true;
  if (parseCustomerCreateStructuredQuery(t)) return true;
  if (parseCustomerRecordStructuredQuery(t)) return true;
  if (detectInvoiceLookupIntent(t)) return true;
  if (tryParseBareEditCustomerNameIntent(t)) return true;
  if (/\b(go\s+to|navigate\s+to|open\s+the|sidebar|settings)\b/i.test(t)) return true;
  if (looksLikeBusinessCollectedRevenueQuery(lower)) return true;
  if (textLooksLikeUnpaidReceivablesReportingIntent(lower)) return true;
  if (textLooksLikeDailyBusinessSummary(lower, t)) return true;
  if (
    /\b(how\s+much|how\s+many|revenue|unpaid|outstanding|receivables?|overdue|break\s+down|breakdown|mtd|quarter|collected)\b/i.test(
      lower
    )
  ) {
    return true;
  }
  if (/\b(insight|analytics|trend)\b/i.test(lower)) return true;
  if (looksLikeTopCustomersAggregateQuery(t)) return true;
  if (looksLikeComparativeCustomerSpendingQuery(lower, t)) return true;
  if (looksLikeCustomerHistoryQuery(t)) return true;
  return false;
}

export function mapStructuredQueryToHierarchyFamily(q: AssistantStructuredQuery): AssistantHierarchyIntentFamily {
  const h = q.handlerHint;
  const bo = q.businessObject;
  const fam = q.intentFamily;
  const shape = q.queryShape;
  if (h === 'fallback') return 'fallback';
  if (h === 'daily_business_summary') return 'metric_query';
  if (h === 'bare_edit_clarify') return 'session_control';
  if (h === 'customer_create') return 'create_customer';
  if (h === 'customer_email_update') return 'edit_customer';
  if (h === 'customer_record') {
    if (shape === 'edit_record') return 'edit_customer';
    if (shape === 'open_record') return 'view_customer';
  }
  if (h === 'customer_list') return 'view_customer';
  if (h === 'invoice_wizard') {
    if (fam === 'workflow_create' && bo === 'invoice') return 'create_invoice';
    if (fam === 'record_lookup' && bo === 'invoice') return 'view_invoice';
    return 'create_invoice';
  }
  if (fam === 'record_breakdown' || h === 'revenue_follow_up') return 'metric_breakdown';
  if (fam === 'metric_query' || h === 'financial_metric') return 'metric_query';
  if (
    h === 'analytics' ||
    h === 'top_customers' ||
    h === 'customer_history' ||
    h === 'business_health_summary' ||
    h === 'growth_check' ||
    h === 'invoice_kpi_average' ||
    h === 'inactive_customers' ||
    h === 'churned_customers' ||
    h === 'attention_summary' ||
    h === 'risk_advisory' ||
    h === 'collections_intelligence' ||
    h === 'period_comparison' ||
    h === 'revenue_why_diagnostic' ||
    h === 'what_changed_summary' ||
    h === 'customer_spending_comparison'
  )
    return 'metric_query';
  if (fam === 'navigation' || h === 'none') return 'session_control';
  return 'fallback';
}

export function deriveAssistantActiveWorkflowFromClientState(args: {
  pendingCustomer: PendingAssistantCustomer | null;
  wizardStep: InvoiceWizardStep | null;
  successInvoice: boolean;
}): ActiveWorkflow | null {
  const { pendingCustomer, wizardStep, successInvoice } = args;
  if (successInvoice) return null;
  if (pendingCustomer?.kind === 'inline_editing') return 'edit_customer';
  if (pendingCustomer?.kind === 'awaiting_create_customer_name') return 'create_customer';
  if (pendingCustomer?.kind === 'awaiting_customer_email_update') return 'edit_customer';
  if (pendingCustomer?.kind === 'single_confirm') {
    return pendingCustomer.confirmation_state?.activeWorkflow ?? 'lookup_customer';
  }
  if (wizardStep && wizardStep !== 'SUCCESS') return 'create_invoice';
  return null;
}

export async function resolveAssistantStructuredQueryHierarchy(input: {
  userText: string;
  metricSessionContext: AssistantMetricSessionContext | null;
  activeWorkflow: ActiveWorkflow | null | undefined;
  supabase: SupabaseClient;
  businessId: string;
}): Promise<AssistantHierarchyResolution> {
  const normalized = normalizeAssistantInput(input.userText);
  const t = normalized.normalized;
  const ms = input.metricSessionContext ?? null;

  const strong = parseAssistantStrongExplicitStructuredQuery(t);
  if (strong) {
    return { tier: 1, family: mapStructuredQueryToHierarchyFamily(strong), query: strong };
  }

  const bareName = tryParseBareEditCustomerNameIntent(t);
  if (bareName) {
    const { rows } = await findCustomerRecordsByName(input.supabase, input.businessId, bareName);
    if (rows.length >= 1) {
      const q = customerRecordEditQuery(bareName, true);
      return { tier: 1, family: 'edit_customer', query: q };
    }
    const fuzzy = await suggestCustomersBySimilarity(input.supabase, input.businessId, bareName, {
      minRatio: 0.3,
      limit: 5,
    });
    if (fuzzy.length > 0) {
      const q = customerRecordEditQuery(bareName, false);
      return { tier: 1, family: 'edit_customer', query: q };
    }
    return { tier: 1, family: 'fallback', query: bareEditClarifyQuery(bareName) };
  }

  let q = parseAssistantMetricAndFallbackStructuredQuery(t, ms);

  // Hard guard: never route overdue keyword queries to generic fallback.
  if (q.routeCategory === 'general' && q.handlerHint === 'fallback' && /\boverdue\b/i.test(normalized.keywordText)) {
    q = {
      intentFamily: 'metric_query',
      businessObject: 'invoice',
      queryShape: 'list',
      scope: 'workspace',
      filters: { invoiceStatus: 'overdue' },
      routeCategory: 'invoice_actions',
      handlerHint: 'invoice_wizard',
    };
    return { tier: 4, family: mapStructuredQueryToHierarchyFamily(q), query: q };
  }

  const aw = input.activeWorkflow;
  if (q.handlerHint === 'revenue_follow_up_choice_clarify') {
    return { tier: 4, family: mapStructuredQueryToHierarchyFamily(q), query: q };
  }
  if (q.handlerHint === 'revenue_follow_up_choice_decline') {
    return { tier: 4, family: mapStructuredQueryToHierarchyFamily(q), query: q };
  }
  if (
    (aw === 'create_invoice' || aw === 'edit_invoice') &&
    !textLooksLikeCrossWorkflowIntent(t) &&
    !isRevenueReportDrillDownChip(t, ms) &&
    (q.routeCategory === 'financial_queries' ||
      q.routeCategory === 'analytics_queries' ||
      q.routeCategory === 'navigation')
  ) {
    q = minimalInvoiceWizardContinueQuery();
    return { tier: 2, family: 'workflow_field_input', query: q };
  }

  // Mid invoice wizard: bare answers (e.g. customer name) parse as tier-5 fallback — keep the flow.
  if (
    (aw === 'create_invoice' || aw === 'edit_invoice') &&
    !textLooksLikeCrossWorkflowIntent(t) &&
    !isRevenueReportDrillDownChip(t, ms) &&
    q.routeCategory === 'general' &&
    q.handlerHint === 'fallback'
  ) {
    q = minimalInvoiceWizardContinueQuery();
    return { tier: 2, family: 'workflow_field_input', query: q };
  }

  if (q.routeCategory === 'general' && q.handlerHint === 'fallback') {
    return { tier: 5, family: 'fallback', query: q };
  }

  return { tier: 4, family: mapStructuredQueryToHierarchyFamily(q), query: q };
}
