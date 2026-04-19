import type { WizardAiExtract } from '@/lib/invoices/conversational-invoice-wizard/wizard-ai-extract';

/** Generic labels models often hallucinate when the user did not name a product. */
const GENERIC_LINE_NAMES = /^(service|item|items|product|products|goods|line item|line items|work|labor)$/i;

/**
 * True if the user message plausibly refers to scheduling / due (not just a bare date in another context).
 */
export function userMessageMentionsDueOrSchedule(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\bdue\b|deadline|pay\s*by|payable|net\s+\d+/i.test(t)) return true;
  if (/\bin\s+\d+\s+days?\b/i.test(t)) return true;
  if (/\b(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t))
    return true;
  if (/\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(t)) return true;
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(t))
    return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b\.?\s+\d{1,2}/i.test(t)) return true;
  if (/\d{4}-\d{2}-\d{2}/.test(t)) return true;
  return false;
}

/**
 * Heuristic: line item name should appear in (or strongly overlap with) the user’s words.
 * Reduces invented rows like "Service" when the user only described one product.
 */
export function lineItemNameSupportedByUserText(name: string, userMessage: string): boolean {
  const n = name.trim();
  const u = userMessage.trim();
  if (!n || !u) return false;
  const nl = n.toLowerCase();
  const ul = u.toLowerCase();
  if (GENERIC_LINE_NAMES.test(nl) && !ul.includes(nl)) return false;
  if (ul.includes(nl)) return true;
  const nameTokens = nl.split(/\s+/).filter((t) => t.length > 2);
  if (nameTokens.length === 0) return ul.includes(nl);
  const hits = nameTokens.filter((t) => ul.includes(t));
  return hits.length >= Math.ceil(nameTokens.length / 2);
}

/**
 * Drop extract fields that are not supported by the raw user message (anti-hallucination).
 */
export function filterWizardExtractAgainstUserText(
  extract: WizardAiExtract,
  userMessage: string
): WizardAiExtract {
  const u = userMessage.trim();
  let items = extract.items ?? [];
  if (items.length > 0 && u) {
    items = items.filter((it) => {
      const name = String(it.name ?? '').trim();
      if (!name) return false;
      return lineItemNameSupportedByUserText(name, u);
    });
  }

  let due_date = extract.due_date;
  if (String(due_date ?? '').trim()) {
    if (!userMessageMentionsDueOrSchedule(u)) {
      due_date = undefined;
    }
  }

  return { ...extract, items, due_date };
}
