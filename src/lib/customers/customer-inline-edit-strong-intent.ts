import { parseAssistantStructuredQuery } from '@/lib/business-assistant/assistant-structured-intent';
import {
  parseCustomerRecordStructuredQuery,
  tryParseBareEditCustomerNameIntent,
} from '@/lib/business-assistant/customer-record-intent';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import { detectInvoiceLookupIntent, textLooksLikeCreateInvoiceFlow } from '@/lib/invoices/invoice-chat-intent';

/**
 * When true, `invoice-wizard` should clear `inline_editing` / edit lock for this turn and route
 * like a normal Assistant message (wizard extract + business router).
 */
export function shouldExitCustomerInlineEditForStrongIntent(
  userText: string,
  metricSession?: AssistantMetricSessionContext | null
): boolean {
  const t = String(userText ?? '').trim();
  if (!t) return false;

  if (/\bcreate\s+(a\s+)?new\s+customer\b/i.test(t)) return true;
  if (/^\s*create\s+customer\b/i.test(t)) return true;
  if (/\badd\s+(a\s+)?new\s+customer\b/i.test(t)) return true;

  if (textLooksLikeCreateInvoiceFlow(t)) return true;
  if (detectInvoiceLookupIntent(t)) return true;

  if (parseCustomerRecordStructuredQuery(t)) return true;
  if (tryParseBareEditCustomerNameIntent(t)) return true;

  const { query } = parseAssistantStructuredQuery(t, metricSession ?? null);
  if (
    query.routeCategory === 'financial_queries' ||
    query.routeCategory === 'analytics_queries' ||
    query.routeCategory === 'navigation'
  ) {
    return true;
  }

  return false;
}
