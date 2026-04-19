import {
  isBareGenericCreateInvoiceMessage,
  isInvoiceForCustomerLeadIn,
  textLooksLikeCreateInvoiceFlow,
} from '@/lib/invoices/invoice-chat-intent';
import type { PendingAssistantCustomer } from '@/lib/invoices/conversational-invoice-wizard/types';

/** Bare “add/create customer” with no name — stay in chat and collect the name next. */
export function textLooksLikeBareAddCustomerIntent(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t || t.length > 96) return false;
  return /^(add|create|new)\s+(a\s+)?customer\b/i.test(t);
}

export type CustomerChatBootstrapResult = {
  assistant_lines: string[];
  pending_customer_context: PendingAssistantCustomer;
};

/**
 * When the workspace has zero customers, offer in-chat customer creation instead of a dead-end warning.
 * Returns null when this turn should fall through to normal routing / wizard extraction.
 */
export function resolveCustomerBootstrapWhenNoCustomers(params: {
  userText: string;
  assistantLaunchContext?: 'general' | 'create_invoice' | 'create_customer';
  requestedEmptyBootstrap: boolean;
  pendingCustomerContext: PendingAssistantCustomer | null;
}): CustomerChatBootstrapResult | null {
  const pending = params.pendingCustomerContext;
  if (pending?.kind === 'awaiting_create_customer_name') {
    return null;
  }
  if (
    pending &&
    pending.kind !== 'awaiting_create_customer_name'
  ) {
    return null;
  }

  const t = params.userText.trim();

  if (textLooksLikeBareAddCustomerIntent(t)) {
    return {
      assistant_lines: ['Sure — what’s the customer’s name?'],
      pending_customer_context: {
        kind: 'awaiting_create_customer_name',
        resume_invoice_after: false,
      },
    };
  }

  const emptyInvoiceBootstrap =
    !t && params.requestedEmptyBootstrap && params.assistantLaunchContext === 'create_invoice';

  const invoiceNeedsCustomerFirst =
    params.assistantLaunchContext !== 'create_customer' &&
    (emptyInvoiceBootstrap ||
      isBareGenericCreateInvoiceMessage(t) ||
      (textLooksLikeCreateInvoiceFlow(t) &&
        !isInvoiceForCustomerLeadIn(t) &&
        t.length <= 200));

  if (invoiceNeedsCustomerFirst) {
    return {
      assistant_lines: [
        'Before I create the invoice, I need a customer first. What’s the customer’s name?',
      ],
      pending_customer_context: {
        kind: 'awaiting_create_customer_name',
        resume_invoice_after: true,
      },
    };
  }

  return null;
}
