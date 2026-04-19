/**
 * Structured metadata for the last assistant turn (Claude path).
 * Drives deterministic follow-up: weak confirmations + default actions without re-asking.
 */

export type AssistantResponseType =
  | 'summary_with_breakdown_options'
  | 'metric_breakdown_result'
  | 'disambiguation_prompt'
  | 'workflow_question'
  | 'invoice_lookup_result'
  | 'general';

export type AssistantFollowUpAction =
  | 'breakdown_customer'
  | 'breakdown_day'
  | 'breakdown_invoice'
  | 'breakdown_month'
  | 'breakdown_currency';

export type AssistantConfidence = 'high' | 'medium' | 'low';
export type AssistantContextStrength = 'strong' | 'weak' | 'none';

export type AssistantResponseMetaV1 = {
  response_type: AssistantResponseType;
  intent_confidence: AssistantConfidence;
  entity_confidence: AssistantConfidence;
  context_strength: AssistantContextStrength;
  /** Higher => prefer ASK over ACT */
  ambiguity_count: number;
  available_actions?: AssistantFollowUpAction[];
  default_action?: AssistantFollowUpAction;
  period_key?: string;
  start_date?: string | null;
  end_date?: string | null;
  /** Last breakdown dimension when response_type is metric_breakdown_result */
  breakdown_dimension?: string;
};

export function coerceAssistantResponseMetaFromUnknown(raw: unknown): AssistantResponseMetaV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const rt = o.response_type;
  if (typeof rt !== 'string') return null;
  const okTypes: AssistantResponseType[] = [
    'summary_with_breakdown_options',
    'metric_breakdown_result',
    'disambiguation_prompt',
    'workflow_question',
    'invoice_lookup_result',
    'general',
  ];
  if (!okTypes.includes(rt as AssistantResponseType)) return null;
  const ic = o.intent_confidence;
  const ec = o.entity_confidence;
  const cs = o.context_strength;
  const amb = o.ambiguity_count;
  return {
    response_type: rt as AssistantResponseType,
    intent_confidence: ic === 'high' || ic === 'medium' || ic === 'low' ? ic : 'medium',
    entity_confidence: ec === 'high' || ec === 'medium' || ec === 'low' ? ec : 'medium',
    context_strength: cs === 'strong' || cs === 'weak' || cs === 'none' ? cs : 'weak',
    ambiguity_count: typeof amb === 'number' && Number.isFinite(amb) ? Math.max(0, Math.floor(amb)) : 0,
    available_actions: Array.isArray(o.available_actions)
      ? (o.available_actions as unknown[]).filter((x): x is AssistantFollowUpAction =>
          typeof x === 'string' &&
          [
            'breakdown_customer',
            'breakdown_day',
            'breakdown_invoice',
            'breakdown_month',
            'breakdown_currency',
          ].includes(x)
        )
      : undefined,
    default_action:
      typeof o.default_action === 'string' &&
      [
        'breakdown_customer',
        'breakdown_day',
        'breakdown_invoice',
        'breakdown_month',
        'breakdown_currency',
      ].includes(o.default_action)
        ? (o.default_action as AssistantFollowUpAction)
        : undefined,
    period_key: typeof o.period_key === 'string' ? o.period_key : undefined,
    start_date: o.start_date != null ? String(o.start_date) : null,
    end_date: o.end_date != null ? String(o.end_date) : null,
    breakdown_dimension:
      typeof o.breakdown_dimension === 'string' ? o.breakdown_dimension : undefined,
  };
}

function actionToDimension(a: AssistantFollowUpAction): 'customer' | 'day' | 'invoice' | 'month' | 'currency' {
  if (a === 'breakdown_customer') return 'customer';
  if (a === 'breakdown_day') return 'day';
  if (a === 'breakdown_invoice') return 'invoice';
  if (a === 'breakdown_month') return 'month';
  return 'currency';
}

/** Instruction appended for Claude so it calls tools without re-asking. */
export function buildBreakdownDirectiveForAction(
  action: AssistantFollowUpAction,
  meta: Pick<
    AssistantResponseMetaV1,
    'period_key' | 'start_date' | 'end_date'
  >
): string {
  const dim = actionToDimension(action);
  const pk = meta.period_key ?? 'this_month';
  let periodPart = `period_key "${pk}"`;
  if (pk === 'custom' && meta.start_date && meta.end_date) {
    periodPart += `, start_date "${meta.start_date}", end_date "${meta.end_date}"`;
  }
  return (
    `[Follow-up: user confirmed the default next step — act now, do not ask which breakdown again.] ` +
    `Call get_metric_breakdown with metric "collected_from_invoices", breakdown_dimension "${dim}", ` +
    `${periodPart}, scope "all", include_partial_payments true. ` +
    `Then answer in plain language with title, numbers, and date range.`
  );
}
