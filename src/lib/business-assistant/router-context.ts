import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { BusinessRole } from '@/lib/rbac/types';
import type { AssistantStructuredQuery } from '@/lib/business-assistant/assistant-structured-intent';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import type {
  ActiveWorkflow,
  InvoiceWizardDraft,
  InvoiceWizardResponse,
  PendingAssistantInvoice,
} from '@/lib/invoices/conversational-invoice-wizard/types';

/** Shared context for one assistant POST (user text turn). */
export type AssistantRouterContext = {
  supabase: SupabaseClient;
  user: User;
  businessId: string;
  sessionId: string;
  draft: InvoiceWizardDraft;
  userText: string;
  pendingInvoiceLookup: PendingAssistantInvoice | null;
  customerMatch: InvoiceWizardResponse['customer_match'];
  customerNeedsDisambiguation: boolean;
  role: BusinessRole;
  /** Business base currency for insight summaries (MVP aggregation). */
  reportingCurrency: string;
  /** Optional IANA TZ from client (dashboard cookie) for paid-in-period windows. */
  workspaceTimezone?: string | null;
  /**
   * Optional echo of `metric_session_context` from the prior assistant message.
   * Reserved for future turns where the user omits the period; parsing text remains primary.
   */
  metricSessionContext?: AssistantMetricSessionContext | null;
  /** Filled by `routeBusinessAssistantUserTurn` before handlers run. */
  structuredQuery?: AssistantStructuredQuery | null;
  /** Client echo; used to defer metrics while drafting an invoice. */
  activeWorkflow?: ActiveWorkflow | null;
  /**
   * Client echo: invoice just created in this chat session (for pronouns like “send it”).
   * Session-scoped; omit after “create another” / new flow.
   */
  recentCreatedInvoice?: {
    invoice_id: string;
    invoice_number?: string | null;
    customer_name?: string | null;
    status?: string | null;
  } | null;
  /**
   * From `pending_customer_context.awaiting_create_customer_name` — carry into create-customer draft
   * so the first saved customer can resume the invoice wizard.
   */
  resumeInvoiceAfterCustomerCreate?: boolean;
};
