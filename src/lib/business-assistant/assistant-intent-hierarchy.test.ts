import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import { resolveAssistantStructuredQueryHierarchy } from './assistant-intent-hierarchy';

vi.mock('@/lib/business-assistant/assistant-customer-find', () => ({
  findCustomerRecordsByName: vi.fn(),
  suggestCustomersBySimilarity: vi.fn(),
}));

import {
  findCustomerRecordsByName,
  suggestCustomersBySimilarity,
} from '@/lib/business-assistant/assistant-customer-find';

const fakeSb = {} as import('@supabase/supabase-js').SupabaseClient;

/** Minimal echo of a prior collected-revenue report (top customers, breakdown, etc.). */
const collectedReportMetricSessionFixture: AssistantMetricSessionContext = {
  currentMetric: 'collected_revenue',
  currentIntent: 'revenue_breakdown_by_customer',
  rangeLabel: 'this_month',
  periodTitleSuffix: 'this month',
  currentResultType: 'customer_breakdown',
  availableBreakdowns: ['customer', 'day', 'invoice'],
  paymentsWindow: {
    startIso: '2026-04-01T07:00:00.000Z',
    endIso: '2026-05-01T06:59:59.999Z',
    timezone: 'America/New_York',
    label: 'this_month',
  },
};

describe('resolveAssistantStructuredQueryHierarchy', () => {
  beforeEach(() => {
    vi.mocked(findCustomerRecordsByName).mockReset();
    vi.mocked(suggestCustomersBySimilarity).mockReset();
  });

  it('edit haret llc + DB exact match → edit_customer (tier 1)', async () => {
    vi.mocked(findCustomerRecordsByName).mockResolvedValue({
      result: {
        match: { id: 'c1' } as import('@/lib/customers/match-from-text').MatchableCustomer,
        matches: [],
        confidence: 'high' as const,
      },
      rows: [{ id: 'c1', display_name: 'Haret LLC', email: null }],
    });
    vi.mocked(suggestCustomersBySimilarity).mockResolvedValue([]);
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'edit haret llc',
      metricSessionContext: null,
      activeWorkflow: null,
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(1);
    expect(r.family).toBe('edit_customer');
    expect(r.query.handlerHint).toBe('customer_record');
    expect(r.query.filters.customerNameHint).toBe('haret llc');
    expect(r.query.filters.bareEditFromVerbOnly).toBe(true);
  });

  it('create customer Haret LLC → create_customer (tier 1 strong)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'create customer Haret LLC',
      metricSessionContext: null,
      activeWorkflow: null,
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(1);
    expect(r.family).toBe('create_customer');
    expect(r.query.handlerHint).toBe('customer_create');
    expect(r.query.filters.customerNameHint).toBe('Haret LLC');
  });

  it('activeWorkflow create_invoice + "update customer email" stays on customer slot flow (tier 1)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Update customer email',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(1);
    expect(r.family).toBe('edit_customer');
    expect(r.query.routeCategory).toBe('customer_actions');
    expect(r.query.handlerHint).toBe('customer_email_update');
  });

  it('break it down by invoice → metric_breakdown (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'break it down by invoice',
      metricSessionContext: null,
      activeWorkflow: null,
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_breakdown');
    expect(r.query.routeCategory).toBe('financial_queries');
  });

  it('activeWorkflow create_invoice + no metric session: bare "by invoice" stays in invoice wizard (tier 2)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'by invoice',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(2);
    expect(r.family).toBe('workflow_field_input');
    expect(r.query.routeCategory).toBe('invoice_actions');
    expect(r.query.handlerHint).toBe('invoice_wizard');
  });

  it('activeWorkflow create_invoice + echoed report context: "by invoice" continues financial drill-down (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'by invoice',
      metricSessionContext: collectedReportMetricSessionFixture,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_breakdown');
    expect(r.query.routeCategory).toBe('financial_queries');
    expect(r.query.handlerHint).toBe('revenue_follow_up');
    expect(r.query.filters.breakdownDimension).toBe('invoice');
  });

  it('activeWorkflow create_invoice + pending drill-down + "yes" stays contextual (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'yes',
      metricSessionContext: {
        ...collectedReportMetricSessionFixture,
        pending_followup_choice: {
          kind: 'drilldown_dimension',
          prompt: 'would you like it by invoice or by day?',
          options: ['invoice', 'day'],
        },
      },
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('financial_queries');
    expect(r.query.handlerHint).toBe('revenue_follow_up_choice_clarify');
  });

  it('activeWorkflow create_invoice + pending drill-down + "no" stays contextual (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'no',
      metricSessionContext: {
        ...collectedReportMetricSessionFixture,
        pending_followup_choice: {
          kind: 'drilldown_dimension',
          prompt: 'would you like it by invoice or by day?',
          options: ['invoice', 'day'],
        },
      },
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('financial_queries');
    expect(r.query.handlerHint).toBe('revenue_follow_up_choice_decline');
  });

  it('activeWorkflow create_invoice + biggest invoice query breaks out to financial ranking (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Biggest invoice this month',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('financial_queries');
    expect(r.query.handlerHint).toBe('invoice_superlative');
  });

  it('activeWorkflow create_invoice + explicit revenue question still runs metric (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'how much revenue last month',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.query.routeCategory).toBe('financial_queries');
  });

  it('activeWorkflow create_invoice + growth question breaks out to analytics growth_check (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Are we growing?',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('growth_check');
  });

  it('activeWorkflow create_invoice + period comparison breaks out to analytics (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Compare this month vs last month',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('period_comparison');
  });

  it('activeWorkflow create_invoice + revenue why diagnostic breaks out to analytics (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Why is revenue down?',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('revenue_why_diagnostic');
  });

  it('activeWorkflow create_invoice + what changed breaks out to analytics (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'What changed this week?',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('what_changed_summary');
  });

  it('activeWorkflow create_invoice + business health summary breaks out to analytics (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'How is the business doing this month?',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('business_health_summary');
  });

  it('activeWorkflow create_invoice + collections follow-up breaks out to analytics (not invoice wizard)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Who should I follow up with?',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('collections_intelligence');
  });

  it('activeWorkflow create_invoice + risk advisory breaks out to analytics (not invoice wizard)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Any risks I should know?',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('risk_advisory');
  });

  it('activeWorkflow create_invoice + “Summarize my business this week” breaks out to analytics (not invoice wizard)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Summarize my business this week',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('business_health_summary');
  });

  it('activeWorkflow create_invoice + attention summary breaks out to analytics (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'What needs my attention today?',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('attention_summary');
  });

  it('activeWorkflow create_invoice + show urgent items breaks out to attention_summary (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Show urgent items',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.query.handlerHint).toBe('attention_summary');
    expect(r.query.routeCategory).toBe('analytics_queries');
  });

  it('activeWorkflow create_invoice + inactive customers breaks out to analytics (tier 1 strong)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'inactive customers',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(1);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('inactive_customers');
  });

  it('activeWorkflow create_invoice + average invoice KPI breaks out to analytics (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: "What's our average invoice size?",
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('invoice_kpi_average');
  });

  it('activeWorkflow create_invoice + "invoice paid yesterday" breaks out to reporting (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'invoice paid yesterday',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).toBe('metric_query');
    expect(r.query.routeCategory).toBe('financial_queries');
  });

  it('activeWorkflow create_invoice + "what’s overdue right now" breaks out to reporting/list', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: "What's overdue right now?",
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).not.toBe('workflow_field_input');
    expect(r.query.handlerHint).toBe('invoice_wizard');
  });

  it('normalizes curly apostrophe in overdue query before workflow continuation', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'What’s overdue right now?',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.family).not.toBe('workflow_field_input');
    expect(r.query.handlerHint).not.toBe('fallback');
  });

  it('activeWorkflow create_invoice + bare customer name → wizard continuation (tier 2), not routing fallback', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Lava LLC',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(2);
    expect(r.family).toBe('workflow_field_input');
    expect(r.query.handlerHint).toBe('invoice_wizard');
    expect(r.query.routeCategory).toBe('invoice_actions');
  });

  it('activeWorkflow create_invoice + receivables question breaks out to invoice assistant (tier 4)', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: "who hasn't paid us yet?",
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.query.routeCategory).toBe('invoice_actions');
    expect(r.query.handlerHint).toBe('invoice_wizard');
  });

  it('activeWorkflow create_invoice + customer history → analytics (tier 4), not wizard', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Customer history for Lava LLC',
      metricSessionContext: null,
      activeWorkflow: 'create_invoice',
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(1);
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('customer_history');
  });

  it('Which customers increased spending → analytics customer_spending_comparison (tier 4), not customer_list', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Which customers increased spending?',
      metricSessionContext: null,
      activeWorkflow: null,
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.query.handlerHint).toBe('customer_spending_comparison');
    expect(r.query.routeCategory).toBe('analytics_queries');
  });

  it('Show top customers this month → analytics top_customers (tier 4), not customer_record', async () => {
    const r = await resolveAssistantStructuredQueryHierarchy({
      userText: 'Show top customers this month',
      metricSessionContext: null,
      activeWorkflow: null,
      supabase: fakeSb,
      businessId: 'b1',
    });
    expect(r.tier).toBe(4);
    expect(r.query.routeCategory).toBe('analytics_queries');
    expect(r.query.handlerHint).toBe('top_customers');
    expect(r.family).toBe('metric_query');
  });
});
