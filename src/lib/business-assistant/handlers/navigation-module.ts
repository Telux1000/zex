import { assistantBoldLine } from '@/lib/assistant/assistant-bold-line';
import { buildWizardShellResponse } from '@/lib/business-assistant/wizard-shell';
import type { AssistantRouterContext } from '@/lib/business-assistant/router-context';

const T = (s: string) => s.trim();

/** Lightweight deterministic navigation hints (expand with path mapping later). */
export function handleNavigationAssistantTurn(ctx: AssistantRouterContext) {
  const t = ctx.userText.toLowerCase();

  let title: string | undefined;
  let lead = 'Use the sidebar for now — opening pages from chat is coming later.';

  if (/\b(invoice|invoices|billing)\b/i.test(t)) {
    title = 'Invoices';
    lead = 'Invoices live under Invoices in the sidebar (/dashboard/invoices).';
  } else if (/\b(customer|customers|clients?)\b/i.test(t)) {
    title = 'Customers';
    lead = 'Customers are under Customers in the sidebar (/dashboard/customers).';
  } else if (/\b(report|reports|analytics|dashboard)\b/i.test(t)) {
    title = 'Reports';
    lead = 'Open Dashboard for overview metrics, or Reports from your workspace menu when available.';
  } else if (/\bsetting|preferences\b/i.test(t)) {
    title = 'Settings';
    lead = 'Settings is available from your workspace or account menu.';
  }

  return buildWizardShellResponse({
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    assistant_lines: [],
    assistant_structured: {
      title: title ? assistantBoldLine(title) : undefined,
      lines: [T(lead), 'Ask about invoices anytime.'],
    },
    chat_cards: null,
    pending_invoice_lookup: null,
  });
}
