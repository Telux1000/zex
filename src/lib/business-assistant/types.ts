import type { InvoiceWizardResponse } from '@/lib/invoices/conversational-invoice-wizard/types';

/**
 * Business Assistant — multi-domain chat routing (invoices, customers, analytics, …).
 * Core route still returns InvoiceWizardResponse for one chat surface; domains plug in via router + handlers.
 */

export type AssistantIntentCategory =
  | 'invoice_actions'
  | 'customer_actions'
  | 'financial_queries'
  | 'analytics_queries'
  | 'navigation'
  | 'general';

/** Optional envelope when a handler wants to expose both category and body (e.g. logging). */
export type AssistantRoutedTurn = {
  category: AssistantIntentCategory;
  response: InvoiceWizardResponse;
};
