import {
  WIZARD_COLLECT_ITEMS_LINE,
  WIZARD_COLLECT_PRICING_LINE,
  WIZARD_COLLECT_QUANTITY_LINE,
  WIZARD_CONTINUE_PROMPT,
  WIZARD_GET_CUSTOMER_LINE,
  wizardSingleMissingPrompt,
} from '@/lib/business-assistant/assistant-tone';
import { ZodError, type ZodIssue } from 'zod';
import type { InvoiceWizardDraft } from './types';
import {
  assistantLinesForStep,
  computeMissingFields,
  resolveWizardStep,
} from './state-machine';

function pathKey(path: (string | number)[]): string {
  return path.map(String).join('.');
}

/** Map Zod issue paths to a single user-facing line (no raw JSON / codes). */
export function mapZodIssuesToPrompt(issues: ZodIssue[], draft: InvoiceWizardDraft): string {
  for (const issue of issues) {
    const p = pathKey(issue.path);
    if (p === 'items' || p.startsWith('items.')) {
      if (issue.code === 'too_small' && issue.path[0] === 'items') {
        return WIZARD_COLLECT_ITEMS_LINE;
      }
      if (issue.path.includes('quantity') || /items\.\d+\.quantity/.test(p)) {
        return WIZARD_COLLECT_QUANTITY_LINE;
      }
      if (
        issue.path.includes('unit_price') ||
        issue.path.includes('price') ||
        /items\.\d+\.(unit_price|price)/.test(p)
      ) {
        return WIZARD_COLLECT_PRICING_LINE;
      }
      if (issue.path.includes('name') || /items\.\d+\.name/.test(p)) {
        return WIZARD_COLLECT_ITEMS_LINE;
      }
    }
    if (p === 'customer_name' || issue.path[0] === 'customer_name') {
      return WIZARD_GET_CUSTOMER_LINE;
    }
    if (p === 'due_date' || issue.path[0] === 'due_date') {
      return wizardSingleMissingPrompt('due_date');
    }
    if (p === 'currency' || issue.path[0] === 'currency') {
      return 'What currency should this use?';
    }
  }

  return conversationalPromptForDraft(draft, { customerNeedsDisambiguation: false });
}

export function mapValidationErrorToPrompt(error: unknown, draft: InvoiceWizardDraft): string {
  if (error instanceof ZodError) {
    return mapZodIssuesToPrompt(error.issues, draft);
  }
  return conversationalPromptForDraft(draft, { customerNeedsDisambiguation: false });
}

export function conversationalPromptForDraft(
  draft: InvoiceWizardDraft,
  opts: { customerNeedsDisambiguation: boolean }
): string {
  const step = resolveWizardStep(draft, opts);
  const lines = assistantLinesForStep(step, computeMissingFields(draft), draft);
  return lines[0] ?? WIZARD_CONTINUE_PROMPT;
}
