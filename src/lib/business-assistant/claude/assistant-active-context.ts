/**
 * Server-persisted active query context for Business Assistant (Claude tool path).
 * Stored on `assistant_conversations.assistant_active_context`.
 */

export type AssistantActiveMetricContextV1 = {
  metric: string;
  period_key: string;
  start_date?: string | null;
  end_date?: string | null;
  scope: 'all' | 'customer';
  customer_id?: string | null;
  include_partial_payments?: boolean;
  base_currency?: string | null;
  breakdown_dimension?: string | null;
  /** Resolved window for metric_session_context parity */
  payments_window?: {
    start_iso: string;
    end_iso: string;
    timezone: string;
    label: string;
  };
};

export type AssistantActiveContextV1 = {
  current_intent_family?:
    | 'metric_query'
    | 'record_lookup'
    | 'record_breakdown'
    | 'workflow_create'
    | 'workflow_edit';
  active_metric_context?: AssistantActiveMetricContextV1 | null;
  active_workflow_context?: Record<string, unknown> | null;
};

export function coerceAssistantActiveContextFromUnknown(raw: unknown): AssistantActiveContextV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const fam =
    typeof o.current_intent_family === 'string' ? o.current_intent_family : undefined;
  const am = o.active_metric_context;
  let active_metric_context: AssistantActiveMetricContextV1 | null = null;
  if (am && typeof am === 'object') {
    const m = am as Record<string, unknown>;
    if (typeof m.metric === 'string' && typeof m.period_key === 'string') {
      active_metric_context = {
        metric: m.metric,
        period_key: m.period_key,
        start_date: typeof m.start_date === 'string' ? m.start_date : null,
        end_date: typeof m.end_date === 'string' ? m.end_date : null,
        scope: m.scope === 'customer' ? 'customer' : 'all',
        customer_id: typeof m.customer_id === 'string' ? m.customer_id : null,
        include_partial_payments: m.include_partial_payments === true ? true : undefined,
        base_currency: typeof m.base_currency === 'string' ? m.base_currency : null,
        breakdown_dimension: typeof m.breakdown_dimension === 'string' ? m.breakdown_dimension : undefined,
        payments_window:
          m.payments_window && typeof m.payments_window === 'object'
            ? (() => {
                const p = m.payments_window as Record<string, unknown>;
                if (
                  typeof p.start_iso === 'string' &&
                  typeof p.end_iso === 'string' &&
                  typeof p.timezone === 'string' &&
                  typeof p.label === 'string'
                ) {
                  return {
                    start_iso: p.start_iso,
                    end_iso: p.end_iso,
                    timezone: p.timezone,
                    label: p.label,
                  };
                }
                return undefined;
              })()
            : undefined,
      };
    }
  }
  const wf =
    o.active_workflow_context && typeof o.active_workflow_context === 'object'
      ? (o.active_workflow_context as Record<string, unknown>)
      : null;
  if (fam == null && active_metric_context == null && wf == null) return null;
  return {
    current_intent_family: fam as AssistantActiveContextV1['current_intent_family'],
    active_metric_context,
    active_workflow_context: wf,
  };
}
