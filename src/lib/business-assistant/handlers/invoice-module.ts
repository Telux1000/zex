import { runInvoiceAssistantPipeline } from '@/lib/invoices/assistant-invoice-pipeline';
import type { InvoiceWizardResponse } from '@/lib/invoices/conversational-invoice-wizard/types';
import type { AssistantRouterContext } from '@/lib/business-assistant/router-context';

/**
 * Invoice domain: retrieval, lists, insights, actions, view/edit (deterministic).
 * Returns null to continue with create-invoice wizard extraction.
 */
export async function handleInvoiceAssistantTurn(
  ctx: AssistantRouterContext
): Promise<InvoiceWizardResponse | null> {
  if (ctx.structuredQuery?.handlerHint === 'fallback') {
    return null;
  }
  return runInvoiceAssistantPipeline({
    supabase: ctx.supabase,
    user: ctx.user,
    businessId: ctx.businessId,
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    userText: ctx.userText,
    pending: ctx.pendingInvoiceLookup,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    role: ctx.role,
    reportingCurrency: ctx.reportingCurrency,
    workspaceTimezone: ctx.workspaceTimezone,
  });
}
