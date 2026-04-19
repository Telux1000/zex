import { describe, expect, it } from 'vitest';
import { parseAssistantStructuredQuery } from '@/lib/business-assistant/assistant-structured-intent';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';

describe('parseAssistantStructuredQuery', () => {
  const pendingChoiceMetricSession: AssistantMetricSessionContext = {
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
    pending_followup_choice: {
      kind: 'drilldown_dimension',
      prompt: 'would you like it by invoice or by day?',
      options: ['invoice', 'day'],
    },
  };

  it('maps global revenue total + last month', () => {
    const { query } = parseAssistantStructuredQuery('how much was made last month', null);
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.intentFamily).toBe('metric_query');
    expect(query.businessObject).toBe('revenue');
    expect(query.queryShape).toBe('total_amount');
    expect(query.scope).toBe('workspace');
    expect(query.filters.includePartialPayments).toBe(true);
    expect(query.rangeSpec).toEqual({ kind: 'last_month' });
  });

  it('maps partially paid invoice count (workspace, not invoice wizard)', () => {
    const { query } = parseAssistantStructuredQuery(
      'how many partially paid invoices do i have',
      null
    );
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.intentFamily).toBe('metric_query');
    expect(query.businessObject).toBe('invoice');
    expect(query.queryShape).toBe('count');
    expect(query.scope).toBe('workspace');
    expect(query.filters.invoiceStatus).toBe('partially_paid');
  });

  it('maps partially paid invoice list with amounts to financial_queries (not invoice wizard)', () => {
    const { query } = parseAssistantStructuredQuery(
      'show the total, paid and balance of the partially paid invoices',
      null
    );
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.businessObject).toBe('invoice');
    expect(query.queryShape).toBe('list');
    expect(query.filters.invoiceStatus).toBe('partially_paid');
  });

  it('maps revenue breakdown by invoice + rolling period', () => {
    const { query } = parseAssistantStructuredQuery(
      'break down revenue by invoice for the last 14 days',
      null
    );
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.intentFamily).toBe('record_breakdown');
    expect(query.businessObject).toBe('revenue');
    expect(query.queryShape).toBe('breakdown');
    expect(query.filters.breakdownDimension).toBe('invoice');
    expect(query.filters.includePartialPayments).toBe(true);
    expect(query.rangeSpec).toEqual({ kind: 'rolling_days', days: 14 });
  });

  it('maps collected by currency + period to financial_queries (not generic fallback)', () => {
    const { query } = parseAssistantStructuredQuery(
      'Show collected amounts by currency for last week',
      null
    );
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.handlerHint).not.toBe('fallback');
    expect(query.filters?.includePartialPayments).toBe(true);
  });

  it('maps payments received by currency + explicit window to currency breakdown route', () => {
    const { query } = parseAssistantStructuredQuery(
      'payments received by currency last week',
      null
    );
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.filters?.breakdownDimension).toBe('currency');
    expect(query.rangeSpec).toEqual({ kind: 'last_week' });
  });

  it('maps "invoice paid yesterday" to financial reporting (not invoice wizard)', () => {
    const { query } = parseAssistantStructuredQuery('invoice paid yesterday', null);
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.handlerHint).toBe('financial_metric');
    expect(query.rangeSpec).toEqual({ kind: 'yesterday' });
  });

  it('maps receivables questions without the word invoice to invoice_actions (not general fallback)', () => {
    const { query } = parseAssistantStructuredQuery("who hasn't paid us yet?", null);
    expect(query.routeCategory).toBe('invoice_actions');
    expect(query.handlerHint).not.toBe('fallback');
  });

  it('maps record payment phrasing to invoice_actions (not general fallback)', () => {
    for (const msg of [
      'Record payment',
      'add payment',
      'log payment',
      'register payment',
      'invoice paid',
    ]) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.routeCategory, msg).toBe('invoice_actions');
      expect(query.handlerHint, msg).not.toBe('fallback');
    }
  });

  it('maps short unpaid / overdue commands to invoice_actions (not general fallback)', () => {
    for (const msg of ['show unpaid', 'unpaid', 'what are unpaid', 'show outstanding', 'overdue']) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.routeCategory, msg).toBe('invoice_actions');
      expect(query.handlerHint, msg).not.toBe('fallback');
    }
  });

  it('maps open invoice lookup', () => {
    const { query } = parseAssistantStructuredQuery('open invoice 59', null);
    expect(query.routeCategory).toBe('invoice_actions');
    expect(query.intentFamily).toBe('record_lookup');
    expect(query.queryShape).toBe('open_record');
    expect(query.businessObject).toBe('invoice');
  });

  it('maps edit customer profile to customer_actions (not invoice wizard)', () => {
    const { query } = parseAssistantStructuredQuery(
      'I want to edit basir Limited customer profile',
      null
    );
    expect(query.routeCategory).toBe('customer_actions');
    expect(query.handlerHint).toBe('customer_record');
    expect(query.intentFamily).toBe('record_action');
    expect(query.businessObject).toBe('customer');
    expect(query.queryShape).toBe('edit_record');
    expect(query.filters.customerNameHint?.toLowerCase()).toContain('basir');
  });

  it('maps "update customer email" to slot-based customer_email_update without premature lookup', () => {
    const { query } = parseAssistantStructuredQuery('Update customer email', null);
    expect(query.routeCategory).toBe('customer_actions');
    expect(query.handlerHint).toBe('customer_email_update');
    expect(query.filters.customerNameHint).toBeUndefined();
    expect(query.filters.customerEmailHint).toBeUndefined();
  });

  it('does not sync-parse bare edit <name> (resolved asynchronously in intent hierarchy)', () => {
    const { query } = parseAssistantStructuredQuery('edit haret llc', null);
    expect(query.routeCategory).toBe('general');
    expect(query.handlerHint).toBe('fallback');
  });

  it('does not sync-parse bare update/modify <name>', () => {
    expect(parseAssistantStructuredQuery('update Acme Co', null).query.handlerHint).toBe('fallback');
    expect(parseAssistantStructuredQuery('modify "Northwind"', null).query.handlerHint).toBe('fallback');
  });

  it('does not treat invoice field phrases as customer direct-edit', () => {
    const { query } = parseAssistantStructuredQuery('update due date', null);
    expect(query.routeCategory).toBe('invoice_actions');
    expect(query.handlerHint).toBe('invoice_wizard');
  });

  it('does not direct-edit when an invoice reference is present', () => {
    const { query } = parseAssistantStructuredQuery('edit inv 59', null);
    expect(query.routeCategory).toBe('invoice_actions');
    expect(query.businessObject).toBe('invoice');
  });

  it('maps create customer with name to customer_create (not customer_list stub)', () => {
    const { query } = parseAssistantStructuredQuery('Create Customer Haret LLC', null);
    expect(query.routeCategory).toBe('customer_actions');
    expect(query.handlerHint).toBe('customer_create');
    expect(query.intentFamily).toBe('workflow_create');
    expect(query.businessObject).toBe('customer');
    expect(query.queryShape).toBe('create');
    expect(query.filters.customerNameHint).toBe('Haret LLC');
  });

  it('maps new customer name variant to customer_create', () => {
    const { query } = parseAssistantStructuredQuery('new customer Acme Corp', null);
    expect(query.handlerHint).toBe('customer_create');
    expect(query.filters.customerNameHint).toBe('Acme Corp');
  });

  it('maps executive growth questions to analytics growth_check (this month vs last month)', () => {
    for (const msg of ['Are we growing?', 'Are we improving?', 'How are we trending?']) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('growth_check');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.filters.periodComparison?.current.kind, msg).toBe('this_month');
      expect(query.filters.periodComparison?.baseline.kind, msg).toBe('last_month');
    }
  });

  it('maps executive health questions to analytics business_health_summary', () => {
    for (const msg of ['Are we doing well?', 'How is business?']) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('business_health_summary');
      expect(query.routeCategory, msg).toBe('analytics_queries');
    }
  });

  it('maps attention / priority phrases to analytics attention_summary (before daily task summary)', () => {
    const examples = [
      'What needs my attention today?',
      "What's urgent?",
      'what should I focus on',
      'what should I do today',
      'Show urgent items',
      'urgent items',
      'show urgent',
      'urgent tasks',
      'list urgent',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('attention_summary');
      expect(query.routeCategory, msg).toBe('analytics_queries');
    }
  });

  it('maps period comparison phrases to analytics period_comparison', () => {
    const examples = [
      'Compare this month vs last month',
      'this month vs last month',
      'month over month',
      'How did we do vs last month?',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('period_comparison');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.filters.periodComparison?.current.kind, msg).toBe('this_month');
      expect(query.filters.periodComparison?.baseline.kind, msg).toBe('last_month');
    }
  });

  it('maps causal revenue decline questions to revenue_why_diagnostic (defaults to this month vs last month)', () => {
    const examples = [
      'Why is revenue down?',
      'Why did revenue drop?',
      'What caused revenue decline?',
      'Why is revenue lower this month?',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('revenue_why_diagnostic');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.filters.periodComparison?.current.kind, msg).toBe('this_month');
      expect(query.filters.periodComparison?.baseline.kind, msg).toBe('last_month');
    }
  });

  it('maps what-changed / trend phrases to what_changed_summary (defaults to this week vs last week)', () => {
    const examples = [
      'What changed?',
      'What changed this week?',
      "What's different?",
      'What moved?',
      "What's new this week?",
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('what_changed_summary');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.filters.periodComparison?.current.kind, msg).toBe('this_week');
      expect(query.filters.periodComparison?.baseline.kind, msg).toBe('last_week');
    }
  });

  it('infers this month vs last month for what changed when only this month is named', () => {
    const { query } = parseAssistantStructuredQuery('What changed this month?', null);
    expect(query.handlerHint).toBe('what_changed_summary');
    expect(query.filters.periodComparison?.current.kind).toBe('this_month');
    expect(query.filters.periodComparison?.baseline.kind).toBe('last_month');
  });

  it('maps inactive / churn customer lifecycle phrases to analytics (not invoice wizard or customer name)', () => {
    const inactive = [
      'inactive customers',
      'customers not active',
      'customers with no activity',
      "who hasn't bought",
    ];
    for (const msg of inactive) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('inactive_customers');
      expect(query.routeCategory, msg).toBe('analytics_queries');
    }
    const churn = [
      'churn customers',
      'churned customers',
      'lost customers',
      'customers we lost',
    ];
    for (const msg of churn) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('churned_customers');
      expect(query.routeCategory, msg).toBe('analytics_queries');
    }
  });

  it('maps show inactive customers to lifecycle analytics (not customer_record for name "inactive")', () => {
    const { query } = parseAssistantStructuredQuery('show inactive customers', null);
    expect(query.handlerHint).toBe('inactive_customers');
    expect(query.routeCategory).toBe('analytics_queries');
  });

  it('maps invoice KPI / average size questions to analytics invoice_kpi_average (not invoice wizard)', () => {
    const examples = [
      "What's our average invoice size?",
      "What’s our average invoice size?",
      'average invoice value this month',
      'avg invoice last week',
      'average deal size',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('invoice_kpi_average');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.businessObject, msg).toBe('invoice');
    }
  });

  it('maps executive business health questions to analytics business_health_summary', () => {
    const examples = [
      'How is the business doing this month?',
      'How are we doing this week?',
      'Give me a summary this month',
      'Business performance this month',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('business_health_summary');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.businessObject, msg).toBe('analytics');
    }
  });

  it('maps collections / follow-up phrasing to analytics collections_intelligence', () => {
    const examples = [
      'Who should I follow up with?',
      'Who owes me money?',
      "Who hasn't paid?",
      'Who should I chase?',
      'pending collections',
      'collections follow up',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('collections_intelligence');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.businessObject, msg).toBe('analytics');
    }
  });

  it('maps risk & advisory phrasing to analytics risk_advisory', () => {
    const examples = [
      'Any risks I should know?',
      'What risks should I know about?',
      'Where am I exposed financially?',
      'Should I worry about cash flow?',
      'Any red flags?',
      'Business advisory for cash',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('risk_advisory');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.businessObject, msg).toBe('analytics');
    }
  });

  it('maps business intelligence / snapshot phrasing to analytics (summarize ≠ summary word boundary)', () => {
    const examples = [
      'Summarize my business this week',
      'Summarize my business',
      'How is business doing?',
      'Business this week',
      'Weekly summary',
      'Performance this week',
      'Business snapshot',
      'Give me a business snapshot for this month',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('business_health_summary');
      expect(query.routeCategory, msg).toBe('analytics_queries');
      expect(query.businessObject, msg).toBe('analytics');
    }
  });

  it('maps task today to daily_business_summary (not routing fallback)', () => {
    const { query } = parseAssistantStructuredQuery('What is my task today?', null);
    expect(query.handlerHint).toBe('daily_business_summary');
    expect(query.routeCategory).toBe('general');
    expect(query.businessObject).toBe('invoice');
  });

  it('maps top customers aggregate queries to analytics top_customers (not customer lookup)', () => {
    const { query } = parseAssistantStructuredQuery('Show top customers this month', null);
    expect(query.routeCategory).toBe('analytics_queries');
    expect(query.handlerHint).toBe('top_customers');
    expect(query.businessObject).toBe('customer');
    expect(query.rangeSpec).toEqual({ kind: 'this_month' });
  });

  it('maps best customers to analytics top_customers', () => {
    const { query } = parseAssistantStructuredQuery('who are our top clients last week', null);
    expect(query.routeCategory).toBe('analytics_queries');
    expect(query.handlerHint).toBe('top_customers');
    expect(query.rangeSpec).toEqual({ kind: 'last_week' });
  });

  it('maps comparative customer spending queries to customer_spending_comparison (not customer_list)', () => {
    const examples = [
      'Which customers increased spending?',
      'Customers spending more this month',
      'Who increased spending?',
      'Top growing customers',
      'Which customers are spending less?',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.handlerHint, msg).toBe('customer_spending_comparison');
      expect(query.routeCategory, msg).toBe('analytics_queries');
    }
    const defaultPeriod = parseAssistantStructuredQuery('Which customers increased spending?', null);
    expect(defaultPeriod.query.filters.periodComparison?.current.kind).toBe('this_month');
    expect(defaultPeriod.query.filters.periodComparison?.baseline.kind).toBe('last_month');
  });

  it('maps weak affirmation to follow-up clarification when metric session is awaiting drill-down choice', () => {
    const { query } = parseAssistantStructuredQuery('yes', pendingChoiceMetricSession);
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.handlerHint).toBe('revenue_follow_up_choice_clarify');
  });

  it('maps weak decline to contextual follow-up close when metric session is awaiting drill-down choice', () => {
    const { query } = parseAssistantStructuredQuery('no', pendingChoiceMetricSession);
    expect(query.routeCategory).toBe('financial_queries');
    expect(query.handlerHint).toBe('revenue_follow_up_choice_decline');
  });

  it('maps invoice superlative phrases to invoice_superlative ranking intent', () => {
    const examples = [
      'Biggest invoice this month',
      'largest invoice last month',
      'highest invoice this week',
      'top invoice this month',
      'biggest deal this month',
    ];
    for (const msg of examples) {
      const { query } = parseAssistantStructuredQuery(msg, null);
      expect(query.routeCategory, msg).toBe('financial_queries');
      expect(query.handlerHint, msg).toBe('invoice_superlative');
    }
  });

  it('still maps show customer Acme to customer_record (single named lookup)', () => {
    const { query } = parseAssistantStructuredQuery('show customer Acme LLC', null);
    expect(query.routeCategory).toBe('customer_actions');
    expect(query.handlerHint).toBe('customer_record');
  });

  it('maps customer history phrases to analytics customer_history (not invoice wizard)', () => {
    const { query } = parseAssistantStructuredQuery('Customer history for Lava LLC', null);
    expect(query.routeCategory).toBe('analytics_queries');
    expect(query.handlerHint).toBe('customer_history');
    expect(query.filters.customerNameHint).toMatch(/lava/i);
  });

  it('maps "Lava LLC history" to customer_history', () => {
    const { query } = parseAssistantStructuredQuery('Lava LLC history', null);
    expect(query.handlerHint).toBe('customer_history');
  });
});
