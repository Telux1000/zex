import {
  buildCombinedInvoiceMissingPrompt,
  wizardSingleMissingPrompt,
} from '@/lib/business-assistant/assistant-tone';
import { formatDueDateForAssistantSummary } from '@/lib/utils/date';
import type { InvoiceWizardDraft, InvoiceWizardStep, WizardMissingField } from './types';
import { assistantLinesForStep, getNextMissingInvoiceField } from './state-machine';

const MULTI_LINE_REPLY_STEPS: InvoiceWizardStep[] = [
  'CREATE_CUSTOMER',
  'COLLECT_NEW_CUSTOMER_PHONE',
  'COLLECT_NEW_CUSTOMER_CONTACT',
  'COLLECT_NEW_CUSTOMER_ADDRESS',
  'COLLECT_NEW_CUSTOMER_COUNTRY',
  'AWAIT_POST_CREATE_CUSTOMER',
];

export function shouldUseUnifiedInvoiceTurnReply(step: InvoiceWizardStep): boolean {
  return !MULTI_LINE_REPLY_STEPS.includes(step);
}

/**
 * One-sentence summary of what changed this turn (no “Got it” stack).
 */
export function summarizeWizardTurnDelta(
  before: InvoiceWizardDraft,
  after: InvoiceWizardDraft
): string | null {
  const chunks: string[] = [];
  const bn = before.customerName.trim();
  const an = after.customerName.trim();
  /** “Customer set” only after a linked row exists — never while confirmation is still required. */
  if (after.customerId && an) {
    const linkedThisTurn = !before.customerId;
    const nameChanged = an !== bn;
    if (linkedThisTurn || nameChanged) {
      chunks.push(`Customer set to ${an}`);
    }
  }
  /** Line items and schedule belong to the invoice payload — only summarize once a customer is linked. */
  if (after.customerId) {
    const bi = before.items;
    const ai = after.items;
    if (ai.length > bi.length) {
      const added = ai.slice(bi.length);
      const parts = added.map((row) => {
        const nm = String(row?.name ?? '').trim();
        if (!nm) return null;
        const q = row.quantity;
        const p = row.unit_price;
        if (Number.isFinite(q) && q > 0 && Number.isFinite(p) && p > 0) {
          return `${nm} (qty ${q}) at $${p} each`;
        }
        return nm;
      });
      const flat = parts.filter(Boolean) as string[];
      if (flat.length === 1) chunks.push(`Added ${flat[0]}`);
      else if (flat.length > 1) chunks.push(`Added ${flat.length} lines: ${flat.join('; ')}`);
    }
    const bd = (before.dueDate ?? '').trim();
    const ad = (after.dueDate ?? '').trim();
    if (ad && ad !== bd) {
      chunks.push(`Due date set to ${formatDueDateForAssistantSummary(ad)}`);
    }
  }
  if (chunks.length === 0) return null;
  return `${chunks.join('. ')}.`;
}

function pickNextAsk(
  step: InvoiceWizardStep,
  missing: WizardMissingField[],
  draft: InvoiceWizardDraft
): string {
  if (step === 'CONFIRM') {
    return assistantLinesForStep(step, missing, draft)[0] ?? 'Look good? Tap confirm to create the draft.';
  }
  const combo = buildCombinedInvoiceMissingPrompt(missing);
  if (combo) return combo;
  const next = getNextMissingInvoiceField(draft);
  if (next) return wizardSingleMissingPrompt(next);
  const lines = assistantLinesForStep(step, missing, draft);
  return lines.join('\n');
}

export type UnifiedInvoiceTurnReplyOptions = {
  /** When set (e.g. customer picker prompt), overrides the next-slot question so chat matches UI. */
  followUpPromptOverride?: string | null;
};

/**
 * Single assistant bubble: delta summary + one follow-up question (invoice field flow only).
 */
export function buildUnifiedInvoiceTurnReplyLines(
  before: InvoiceWizardDraft,
  after: InvoiceWizardDraft,
  step: InvoiceWizardStep,
  missing: WizardMissingField[],
  options?: UnifiedInvoiceTurnReplyOptions
): string[] | null {
  if (!shouldUseUnifiedInvoiceTurnReply(step)) return null;
  const summary = summarizeWizardTurnDelta(before, after);
  const ask =
    options?.followUpPromptOverride?.trim() || pickNextAsk(step, missing, after);
  if (summary && ask) {
    return [`${summary} ${ask}`];
  }
  if (summary) return [summary];
  if (ask) return [ask];
  return null;
}
