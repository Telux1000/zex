import type { InvoiceWizardResponse } from '@/lib/invoices/conversational-invoice-wizard/types';
import { handleCustomerAssistantTurn } from '@/lib/business-assistant/handlers/customer-module';
import { handleFinancialAssistantTurn } from '@/lib/business-assistant/handlers/financial-module';
import { handleInvoiceAssistantTurn } from '@/lib/business-assistant/handlers/invoice-module';
import { handleAnalyticsAssistantTurn } from '@/lib/business-assistant/handlers/analytics-module';
import { handleNavigationAssistantTurn } from '@/lib/business-assistant/handlers/navigation-module';
import { resolveAssistantStructuredQueryHierarchy } from '@/lib/business-assistant/assistant-intent-hierarchy';
import { buildWizardShellResponse } from '@/lib/business-assistant/wizard-shell';
import { ASSISTANT_ROUTING_FALLBACK } from '@/lib/business-assistant/assistant-tone';
import type { AssistantRouterContext } from '@/lib/business-assistant/router-context';
import { tryRecentCreatedInvoiceFollowUp } from '@/lib/invoices/assistant-invoice-pipeline';

export type { AssistantRouterContext } from '@/lib/business-assistant/router-context';

/**
 * Route a user message through domain handlers.
 * - Pending invoice lookup always stays on the invoice module.
 * - Customer / financial / navigation return a full response and skip wizard text extraction for that turn.
 * - Invoice + general: run invoice lookup; if null, caller continues with AI wizard merge.
 */
export async function routeBusinessAssistantUserTurn(
  ctx: AssistantRouterContext
): Promise<InvoiceWizardResponse | null> {
  const trimmed = ctx.userText.trim();
  if (!trimmed) return null;

  if (ctx.pendingInvoiceLookup) {
    return handleInvoiceAssistantTurn(ctx);
  }

  const recentFollow = await tryRecentCreatedInvoiceFollowUp(ctx);
  if (recentFollow) return recentFollow;

  const resolution = await resolveAssistantStructuredQueryHierarchy({
    userText: trimmed,
    metricSessionContext: ctx.metricSessionContext ?? null,
    activeWorkflow: ctx.activeWorkflow ?? null,
    supabase: ctx.supabase,
    businessId: ctx.businessId,
  });
  const structuredQuery = resolution.query;

  if (structuredQuery.routeCategory === 'general' && structuredQuery.handlerHint === 'fallback') {
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: [ASSISTANT_ROUTING_FALLBACK],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const nextCtx: AssistantRouterContext = { ...ctx, structuredQuery };

  switch (structuredQuery.routeCategory) {
    case 'customer_actions':
      return await handleCustomerAssistantTurn(nextCtx);
    case 'financial_queries':
      return await handleFinancialAssistantTurn(nextCtx);
    case 'analytics_queries':
      return await handleAnalyticsAssistantTurn(nextCtx);
    case 'navigation':
      return handleNavigationAssistantTurn(nextCtx);
    case 'invoice_actions':
    case 'general':
    default:
      return handleInvoiceAssistantTurn(nextCtx);
  }
}
