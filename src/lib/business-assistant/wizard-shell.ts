import {
  computeMissingFields,
  resolveWizardStep,
} from '@/lib/invoices/conversational-invoice-wizard/state-machine';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import {
  flattenAssistantStructured,
  type AssistantClientNavigate,
  type AssistantOpenRecordPayment,
  type AssistantQuickReply,
  type AssistantStructuredBody,
  type InvoiceAssistantChatCard,
  type AssistantCustomerEditSessionV1,
  type InvoiceWizardDraft,
  type InvoiceWizardResponse,
  type PendingAssistantCustomer,
  type PendingAssistantInvoice,
  type WizardClientUI,
} from '@/lib/invoices/conversational-invoice-wizard/types';

export type WizardShellParams = {
  sessionId: string;
  draft: InvoiceWizardDraft;
  customerMatch: InvoiceWizardResponse['customer_match'];
  customerNeedsDisambiguation: boolean;
  /** Ignored when `assistant_structured` is set (lines are flattened from structure). */
  assistant_lines: string[];
  /** Render after `chat_cards`, before `quick_replies`. */
  assistant_post_card_lines?: string[] | null;
  assistant_structured?: AssistantStructuredBody | null;
  error?: string | null;
  chat_cards?: InvoiceAssistantChatCard[] | null;
  quick_replies?: AssistantQuickReply[] | null;
  pending_invoice_lookup?: PendingAssistantInvoice | null;
  metric_session_context?: AssistantMetricSessionContext | null;
  pending_customer_context?: PendingAssistantCustomer | null;
  client_navigate?: AssistantClientNavigate | null;
  open_record_payment?: AssistantOpenRecordPayment | null;
  wizard_client_ui?: WizardClientUI | null;
  /** When set, overrides auto echo from `pending_customer_context` (e.g. clear on exit). */
  customer_edit_session?: AssistantCustomerEditSessionV1 | null;
};

/**
 * Build a full assistant JSON payload for a turn that doesn’t run the invoice create wizard merge.
 * Used by invoice lookup, customer/financial/navigation stubs, etc.
 */
export function buildWizardShellResponse(p: WizardShellParams): InvoiceWizardResponse {
  const assistantCustomerEditLock =
    p.pending_customer_context?.kind === 'inline_editing' ||
    p.pending_customer_context?.kind === 'customer_pick_options';
  const step = resolveWizardStep(p.draft, {
    customerNeedsDisambiguation: p.customerNeedsDisambiguation,
    assistantCustomerEditLock,
  });
  const baseLines = p.assistant_structured
    ? flattenAssistantStructured(p.assistant_structured)
    : p.assistant_lines;
  const lines = p.error ? [p.error, ...baseLines] : baseLines;
  return {
    session_id: p.sessionId,
    step,
    draft: p.draft,
    missing_fields: computeMissingFields(p.draft),
    assistant_lines: lines,
    assistant_post_card_lines:
      p.assistant_post_card_lines != null && p.assistant_post_card_lines.length > 0
        ? p.assistant_post_card_lines
        : null,
    assistant_structured: p.assistant_structured ?? null,
    customer_match: p.customerMatch ?? null,
    invoice: null,
    error: p.error ?? null,
    chat_cards: p.chat_cards ?? null,
    quick_replies: p.quick_replies ?? null,
    pending_invoice_lookup: p.pending_invoice_lookup ?? null,
    metric_session_context: p.metric_session_context ?? null,
    pending_customer_context: p.pending_customer_context ?? null,
    client_navigate: p.client_navigate ?? null,
    open_record_payment: p.open_record_payment ?? null,
    wizard_client_ui: p.wizard_client_ui ?? null,
    customer_edit_session:
      p.customer_edit_session !== undefined
        ? p.customer_edit_session
        : p.pending_customer_context?.kind === 'inline_editing'
          ? {
              customer_id: p.pending_customer_context.customer_id,
              display_name: p.pending_customer_context.display_name,
            }
          : null,
  };
}
