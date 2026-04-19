import type { BusinessAssistantToolExecutorContext } from '@/lib/business-assistant/claude/tool-executor';
import type { AssistantFollowUpAction, AssistantResponseMetaV1 } from '@/lib/business-assistant/claude/assistant-response-meta';

const BREAKDOWN_ORDER: AssistantFollowUpAction[] = [
  'breakdown_customer',
  'breakdown_day',
  'breakdown_invoice',
];

function dimensionToAction(dim: string): AssistantFollowUpAction | null {
  const d = dim.toLowerCase();
  if (d === 'customer') return 'breakdown_customer';
  if (d === 'day') return 'breakdown_day';
  if (d === 'invoice') return 'breakdown_invoice';
  if (d === 'month') return 'breakdown_month';
  if (d === 'currency') return 'breakdown_currency';
  return null;
}

function nextDefaultAfterDimension(dim: string): AssistantFollowUpAction {
  const cur = dimensionToAction(dim);
  if (cur === 'breakdown_customer') return 'breakdown_day';
  if (cur === 'breakdown_day') return 'breakdown_invoice';
  if (cur === 'breakdown_invoice') return 'breakdown_customer';
  if (cur === 'breakdown_month') return 'breakdown_invoice';
  if (cur === 'breakdown_currency') return 'breakdown_invoice';
  return 'breakdown_customer';
}

function availableAfterDimension(dim: string): AssistantFollowUpAction[] {
  const cur = dimensionToAction(dim);
  return BREAKDOWN_ORDER.filter((a) => a !== cur);
}

function periodFieldsFromContext(
  ctx: BusinessAssistantToolExecutorContext
): Pick<AssistantResponseMetaV1, 'period_key' | 'start_date' | 'end_date'> {
  const am = ctx.assistantActiveContext?.active_metric_context;
  return {
    period_key: am?.period_key ?? 'this_month',
    start_date: am?.start_date ?? null,
    end_date: am?.end_date ?? null,
  };
}

/**
 * Deterministic meta from tool trace + post-tool context (no LLM).
 */
export function inferAssistantResponseMeta(
  toolTrace: readonly string[],
  ctx: BusinessAssistantToolExecutorContext
): AssistantResponseMetaV1 | null {
  if (toolTrace.length === 0) return null;
  const last = toolTrace[toolTrace.length - 1]!;

  if (last === 'find_invoice') {
    return {
      response_type: 'invoice_lookup_result',
      intent_confidence: 'high',
      entity_confidence: 'high',
      context_strength: 'strong',
      ambiguity_count: 0,
    };
  }

  if (last === 'get_metric_summary') {
    const metric = ctx.assistantActiveContext?.active_metric_context?.metric;
    if (metric === 'collected_from_invoices') {
      const pf = periodFieldsFromContext(ctx);
      return {
        response_type: 'summary_with_breakdown_options',
        intent_confidence: 'high',
        entity_confidence: 'high',
        context_strength: 'strong',
        ambiguity_count: 0,
        available_actions: [...BREAKDOWN_ORDER],
        default_action: 'breakdown_customer',
        ...pf,
      };
    }
    return {
      response_type: 'general',
      intent_confidence: 'high',
      entity_confidence: 'high',
      context_strength: 'strong',
      ambiguity_count: 0,
      ...periodFieldsFromContext(ctx),
    };
  }

  if (last === 'get_metric_breakdown') {
    const dim = ctx.assistantActiveContext?.active_metric_context?.breakdown_dimension ?? '';
    const pf = periodFieldsFromContext(ctx);
    const default_action = nextDefaultAfterDimension(dim);
    return {
      response_type: 'metric_breakdown_result',
      intent_confidence: 'high',
      entity_confidence: 'high',
      context_strength: 'strong',
      ambiguity_count: 0,
      available_actions: availableAfterDimension(dim),
      default_action,
      breakdown_dimension: dim || undefined,
      ...pf,
    };
  }

  return {
    response_type: 'general',
    intent_confidence: 'medium',
    entity_confidence: 'medium',
    context_strength: 'weak',
    ambiguity_count: 0,
  };
}
