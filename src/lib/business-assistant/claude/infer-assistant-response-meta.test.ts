import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inferAssistantResponseMeta } from '@/lib/business-assistant/claude/infer-assistant-response-meta';
import type { BusinessAssistantToolExecutorContext } from '@/lib/business-assistant/claude/tool-executor';

function baseCtx(
  partial: Partial<BusinessAssistantToolExecutorContext>
): BusinessAssistantToolExecutorContext {
  return {
    supabase: {} as SupabaseClient,
    businessId: 'b1',
    reportingCurrency: 'USD',
    workspaceTimezone: 'UTC',
    role: 'owner',
    now: new Date(),
    metricSessionContext: null,
    assistantActiveContext: null,
    toolTrace: [],
    findInvoiceLookupMatches: null,
    ...partial,
  };
}

describe('inferAssistantResponseMeta', () => {
  it('infers summary_with_breakdown_options after collected revenue summary', () => {
    const ctx = baseCtx({
      assistantActiveContext: {
        current_intent_family: 'metric_query',
        active_metric_context: {
          metric: 'collected_from_invoices',
          period_key: 'last_month',
          scope: 'all',
          include_partial_payments: true,
          base_currency: 'USD',
        },
      },
    });
    const meta = inferAssistantResponseMeta(['get_metric_summary'], ctx);
    expect(meta?.response_type).toBe('summary_with_breakdown_options');
    expect(meta?.default_action).toBe('breakdown_customer');
    expect(meta?.period_key).toBe('last_month');
  });

  it('defaults next breakdown after by-invoice result', () => {
    const ctx = baseCtx({
      assistantActiveContext: {
        current_intent_family: 'record_breakdown',
        active_metric_context: {
          metric: 'collected_from_invoices',
          period_key: 'last_month',
          scope: 'all',
          include_partial_payments: true,
          base_currency: 'USD',
          breakdown_dimension: 'invoice',
        },
      },
    });
    const meta = inferAssistantResponseMeta(['get_metric_breakdown'], ctx);
    expect(meta?.response_type).toBe('metric_breakdown_result');
    expect(meta?.default_action).toBe('breakdown_customer');
    expect(meta?.breakdown_dimension).toBe('invoice');
  });
});
