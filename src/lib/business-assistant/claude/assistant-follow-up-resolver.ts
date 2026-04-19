import { parseInvoiceReferenceFromText } from '@/lib/invoices/invoice-reference';
import type {
  AssistantFollowUpAction,
  AssistantResponseMetaV1,
} from '@/lib/business-assistant/claude/assistant-response-meta';
import { buildBreakdownDirectiveForAction } from '@/lib/business-assistant/claude/assistant-response-meta';

const WEAK_CONFIRMATION_RE =
  /^\s*(yes|yep|yeah|yup|ok|okay|sure|go\s+ahead|please\s+do|sounds\s+good|do\s+it|please|that'?s?\s+fine|perfect|great)\s*[!.]?\s*$/i;

export function isWeakConfirmationUserText(text: string): boolean {
  const t = text.trim();
  if (t.length > 48) return false;
  return WEAK_CONFIRMATION_RE.test(t);
}

export type AssistantFollowUpResolution = {
  decision: 'act_default' | 'pass_through';
  effective_user_text: string;
  /** For logs / debugging */
  resolution_reason?: string;
};

function shouldActOnConfirmation(meta: AssistantResponseMetaV1): boolean {
  if (meta.ambiguity_count > 0) return false;
  if (meta.intent_confidence !== 'high') return false;
  if (meta.context_strength === 'none' || meta.context_strength === 'weak') return false;
  if (!meta.default_action) return false;
  if (meta.response_type === 'disambiguation_prompt' || meta.response_type === 'workflow_question') {
    return false;
  }
  if (
    meta.response_type === 'summary_with_breakdown_options' ||
    meta.response_type === 'metric_breakdown_result'
  ) {
    return true;
  }
  return false;
}

/**
 * If the user sent a bare confirmation and the prior turn offered a clear default, replace
 * the user message with an explicit tool directive for Claude (deterministic).
 */
export function resolveAssistantFollowUpUserText(args: {
  userText: string;
  priorResponseMeta: AssistantResponseMetaV1 | null;
}): AssistantFollowUpResolution {
  const raw = args.userText.trim();
  if (!args.priorResponseMeta || !isWeakConfirmationUserText(raw)) {
    return { decision: 'pass_through', effective_user_text: args.userText };
  }
  if (!shouldActOnConfirmation(args.priorResponseMeta)) {
    return { decision: 'pass_through', effective_user_text: args.userText };
  }
  const action = args.priorResponseMeta.default_action as AssistantFollowUpAction;
  const directive = buildBreakdownDirectiveForAction(action, {
    period_key: args.priorResponseMeta.period_key,
    start_date: args.priorResponseMeta.start_date,
    end_date: args.priorResponseMeta.end_date,
  });
  return {
    decision: 'act_default',
    effective_user_text: directive,
    resolution_reason: `weak_confirmation+${args.priorResponseMeta.response_type}+default_${action}`,
  };
}

/**
 * Edit/change/update invoice with no reference → steer Claude to ask once (no guessing).
 */
export function augmentEditInvoiceWithoutReference(userText: string): string | null {
  const t = userText.trim();
  if (!/\b(edit|change|update|modify|revise)\b/i.test(t)) return null;
  if (!/\binvoice\b/i.test(t) && !/\binv\b/i.test(t)) return null;
  if (parseInvoiceReferenceFromText(t)) return null;
  if (/\b\d{3,}\b/.test(t) && /\b(invoice|inv)\b/i.test(t)) return null;
  const bare = /^\s*(edit|change|update|modify|revise)\s+(the\s+)?(invoice|inv)\s*[.!]?\s*$/i.test(t);
  const loose =
    /\b(edit|change|update)\s+(the\s+)?invoice\b/i.test(t) && t.length < 80 && !/#\s*\d/.test(t);
  if (!bare && !loose) return null;
  return (
    `${userText.trim()}\n\n` +
    `(System: User wants to edit an invoice but gave no invoice number or INV- reference. ` +
    `Ask once which invoice to open — do not pick one arbitrarily.)`
  );
}
