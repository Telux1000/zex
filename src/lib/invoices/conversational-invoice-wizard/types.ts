import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';

/**
 * Structured conversational invoice wizard: AI extracts data only; the system owns transitions.
 */

export const INVOICE_WIZARD_STEPS = [
  'GET_CUSTOMER',
  'CHECK_CUSTOMER',
  'CREATE_CUSTOMER',
  'COLLECT_NEW_CUSTOMER_PHONE',
  'COLLECT_NEW_CUSTOMER_CONTACT',
  'COLLECT_NEW_CUSTOMER_ADDRESS',
  'COLLECT_NEW_CUSTOMER_COUNTRY',
  /** After first customer save — edit vs continue to invoice (resume flows). */
  'AWAIT_POST_CREATE_CUSTOMER',
  'COLLECT_ITEMS',
  'COLLECT_QUANTITY',
  'COLLECT_PRICING',
  'COLLECT_DUE_DATE',
  'CONFIRM',
  'CREATE_INVOICE',
  'SUCCESS',
] as const;

export type InvoiceWizardStep = (typeof INVOICE_WIZARD_STEPS)[number];

/** Sub-steps after email for a brand-new workspace customer (all optional except email). */
export type NewCustomerOnboardSubstep = 'phone' | 'contact' | 'address' | 'country';

/** Hints for inline UI (e.g. country combobox) on the assistant client. */
export type WizardClientUI = {
  country_pick?: boolean;
  /** Full-screen searchable country modal (preferred over inline `country_pick`). */
  country_modal?: boolean;
  /** One-shot: open `CustomerFormModal` for this customer, then clear on the client. */
  open_customer_form?: { customer_id: string };
};

/** Which single address field the assistant is collecting (progressive disclosure). */
export type NewCustomerAddressCollectSlot = 'street' | 'city' | 'region' | 'postal';

/** Client round-trip while Assistant is editing a customer (survives lost `pending_customer_context`). */
export type AssistantCustomerEditSessionV1 = {
  customer_id: string;
  display_name: string;
};

/** Fields that support “reply with the new value” in Assistant customer edit. */
export type CustomerInlineAwaitingField =
  | 'name'
  | 'email'
  | 'company'
  | 'phone'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'state'
  | 'postal_code'
  | 'country';

export type WizardMissingField =
  | 'customer'
  /** Name present but no `customerId` yet — user must pick/create (CHECK_CUSTOMER). */
  | 'customer_pick'
  | 'customer_email'
  | 'items'
  | 'quantity'
  | 'pricing'
  | 'due_date'
  | 'confirm';

/** Invoice-side data (line items, money, dates) — separate from customer identity. */
export type InvoiceWizardLineItem = {
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  /** Billing unit (item, hour, session, project, …) */
  unit_label: string;
};

/** Customer-side staging vs invoice-side draft. */
export type InvoiceWizardDraft = {
  customerId: string | null;
  isNewCustomer: boolean;
  /**
   * Company / client name (maps to `customers.company`).
   * Do not use for contact person — see `customerContactName` → `customers.name`.
   */
  customerName: string;
  /**
   * Set when chat bootstrapped “customer required before invoice” — after first customer is saved,
   * steer to invoice line items instead of customer-only follow-up.
   */
  resumeInvoiceAfterCustomerCreate?: boolean;
  customerEmail: string;
  /** Optional — collected after email, never required for progression */
  customerPhone: string | null;
  /** Contact person only; maps to `customers.name`. */
  customerContactName: string | null;
  /** Freeform or primary line (also mirrored into address_line1 when structured fields empty). */
  customerAddress: string | null;
  customerAddressLine1: string | null;
  customerAddressLine2: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerPostalCode: string | null;
  /** ISO 3166-1 alpha-2 when known */
  customerCountry: string | null;
  /** Which optional question we’re on after email (null once onboarding finished or not started). */
  newCustomerOnboardSubstep: NewCustomerOnboardSubstep | null;
  /**
   * Once true, optional onboarding is complete and the customer row may be inserted.
   */
  newCustomerOptionalStepDone: boolean;
  /**
   * When set, the assistant is asking for one structured address field at a time
   * (after free-text parse for street/city).
   */
  newCustomerAddressCollectSlot?: NewCustomerAddressCollectSlot | null;
  /** User explicitly skipped an optional address part (region/postal); do not re-ask unless edited. */
  newCustomerAddressSkips?: { region?: boolean; postal?: boolean } | null;
  /**
   * After creating a customer from chat, hold invoice line-item prompts until the user
   * confirms edit vs continue (resume-invoice flows).
   */
  awaitingPostCreateCustomerChoice?: boolean;
  /**
   * ISO codes from last fuzzy country match — next reply tries to resolve within this set first.
   */
  pendingCountryCandidates?: string[] | null;
  /** When true, client should show the searchable country modal (low-confidence or explicit fallback). */
  countryModalRecommended?: boolean;
  items: InvoiceWizardLineItem[];
  dueDate: string | null;
  notes: string | null;
  currency: string | null;
  taxPercent: number | null;
  discountPercent: number | null;
  discountAmount: number | null;
  usePaymentSchedule: boolean;
};

export type CustomerMatchPayload = {
  confidence: 'high' | 'medium' | 'low';
  prompt: string;
  suggestions: Array<{
    id: string;
    label: string;
    email: string | null;
    currency: string | null;
  }>;
};

/**
 * Invoice wizard customer identity phase (API + clients). Mutually exclusive per response.
 */
export type CustomerResolutionState =
  | 'customer_unresolved'
  | 'customer_exact_match'
  | 'customer_needs_confirmation'
  | 'customer_new_required'
  | 'customer_resolved';

/** Client round-trip while waiting for an invoice # or follow-up action. */
export type PendingAssistantInvoice =
  | { kind: 'invoice_ref'; subkind: 'view_edit'; intent: 'edit_invoice' | 'view_invoice' }
  | {
      kind: 'invoice_ref';
      subkind: 'action';
      action: 'mark_paid' | 'send' | 'resend' | 'duplicate' | 'void';
    }
  /** After a ranked overdue teaser; client echoes until user expands the list. */
  | { kind: 'overdue_followup_teaser'; totalOverdue: number; hiddenCount: number };

/** @deprecated Use PendingAssistantInvoice; name kept for API field `pending_invoice_lookup`. */
export type PendingInvoiceLookup = PendingAssistantInvoice;

export type PendingQuestionType =
  | 'confirm_edit_customer'
  | 'continue_edit_customer'
  | 'confirm_duplicate_customer'
  | 'confirm_create_invoice'
  | 'confirm_switch_customer'
  | null;

export type ActiveWorkflow =
  | 'create_customer'
  | 'edit_customer'
  | 'create_invoice'
  | 'edit_invoice'
  | 'metric_query'
  | 'lookup_customer'
  | 'lookup_invoice'
  | null;

export type ConfirmationState = {
  pendingQuestionType: PendingQuestionType;
  activeWorkflow: ActiveWorkflow;
  targetEntityType: 'customer' | 'invoice' | null;
  targetEntityId: string | null;
  defaultYesAction: string | null;
  defaultNoAction: string | null;
};

/**
 * Client echoes this after a customer card or while editing in chat.
 * - `single_confirm`: single match; short “yes” runs default action (edit → inline flow).
 * - `inline_editing`: in-chat field updates until cleared or user leaves the flow.
 */
export type PendingAssistantCustomer =
  | {
      kind: 'single_confirm';
      customer_id: string;
      display_name: string;
      default_action: 'edit_customer' | 'view_customer';
      can_edit_customer: boolean;
      /** Structured confirm context (client echoes). */
      confirmation_state?: ConfirmationState;
    }
  | {
      /** After bare “Create customer” / invoice bootstrap — next message is the company name. */
      kind: 'awaiting_create_customer_name';
      /** After save, continue the invoice wizard (line items, due date, …). */
      resume_invoice_after?: boolean;
    }
  | {
      /** Slot flow: “Update customer email” asked for customer name first. */
      kind: 'awaiting_customer_email_update';
      /** Optional email already parsed from the initial request. */
      pending_new_email?: string | null;
    }
  | {
      kind: 'inline_editing';
      customer_id: string;
      display_name: string;
      can_edit_customer: boolean;
      /** True after at least one successful customer row mutation this session (client echoes). */
      has_updates_in_session?: boolean;
      /** Next user message applies as the new value for this field (if valid). */
      awaiting_value_for?: CustomerInlineAwaitingField | null;
      /** User said “name” — ask company vs contact before accepting a value. */
      awaiting_inline_clarify?: 'name_company_vs_contact' | null;
    }
  | {
      kind: 'customer_pick_options';
      options: Array<{ customer_id: string; display_name: string; email: string | null }>;
      can_edit_customer: boolean;
    };

export type AssistantClientNavigate = {
  href: string;
};

/** Opens in-chat Record Payment from assistant; client renders the same fields as the invoice Record Payment flow. */
export type AssistantOpenRecordPayment = {
  invoice_id: string;
  invoice_number: string | null;
  customer_name: string | null;
  currency: string | null;
  issue_date: string | null;
  mode: 'full' | 'installment';
  amount: number;
  remaining_balance: number;
  schedule_item_id: string | null;
};

export type InvoiceAssistantChatCard =
  | {
      card_type: 'invoice_created_success';
      invoice_id: string;
      invoice_number: string | null;
      customer_name: string | null;
    }
  | {
      /** After a successful send from the assistant — premium confirmation + quick actions. */
      card_type: 'invoice_sent_success';
      invoice_id: string;
      invoice_number: string | null;
      customer_name: string | null;
      /** User message to send when tapping “Send reminder” (e.g. Resend invoice INV-001). */
      reminder_followup_message: string;
    }
  | {
      /** After mark-paid success from assistant — compact financial completion card. */
      card_type: 'invoice_payment_success';
      invoice_id: string;
      invoice_number: string | null;
      customer_name: string | null;
      currency: string | null;
      status: string | null;
      payment_recorded_at: string;
    }
  | {
      card_type: 'invoice_single';
      intent: 'edit_invoice' | 'view_invoice';
      invoice_id: string;
      invoice_number: string | null;
      customer_name: string | null;
      total: number | null;
      currency: string | null;
      status: string | null;
      primary_action: 'edit_invoice' | 'view_invoice';
      /** Eyebrow above the summary (e.g. lookup results). */
      headline?: string | null;
      /** Short hint under status (e.g. draft note). */
      helper_text?: string | null;
      /** When primary is View, show Edit as secondary if user may open the editor. */
      display_edit_secondary?: boolean;
    }
  | {
      card_type: 'invoice_pick';
      intent: 'edit_invoice' | 'view_invoice';
      /** When false, edit intent still shows view-first actions (RBAC). */
      can_edit: boolean;
      options: Array<{
        invoice_id: string;
        invoice_number: string | null;
        customer_name: string | null;
        total: number | null;
        currency: string | null;
        status: string | null;
      }>;
    }
  | {
      card_type: 'invoice_list';
      title: string;
      list_variant?:
        | 'unpaid'
        | 'overdue'
        | 'due_today'
        | 'draft'
        | 'partially_paid'
        | 'paid'
        | 'customer'
        | 'date_range'
        | 'paid_period'
        | 'general';
      /** Business base currency for FX equivalent labels (e.g. USD). */
      base_currency_code?: string | null;
      items: Array<{
        invoice_id: string;
        invoice_number: string | null;
        customer_name: string | null;
        /** Invoice grand total (for preview); not the amount collected in period. */
        total: number | null;
        /** Invoice currency (balance, preview). */
        currency: string | null;
        status: string | null;
        /** ISO date string when list is filtered by payment date */
        paid_at?: string | null;
        /** Sum of payment rows in window in base currency (FX). */
        amount_in_base?: number | null;
        /** Per-currency amounts actually received in the window (partial payments summed). */
        received_by_currency?: Array<{ currency: string; amount: number }>;
        /** Outstanding balance on invoice (invoice currency); paid-period / partial context. */
        balance_due?: number | null;
        /** Raw invoice due date (ISO / DB). */
        due_date?: string | null;
        amount_paid?: number | null;
        /** Cumulative refunds in invoice currency (receivable lists). */
        total_refunded?: number | null;
        /** Effective due YYYY-MM-DD (overdue list: next installment or invoice due). */
        display_due_ymd?: string | null;
        /** Workspace civil-calendar days past effective due (overdue list). */
        days_overdue?: number | null;
        /** Invoice total in business base (stored FX on invoice; overdue list). */
        total_in_base?: number | null;
        exchange_rate_to_base?: number | null;
        /** When true, overdue UI may show leg → base using stored rates and effective balance_due. */
        fx_for_base_reliable?: boolean;
      }>;
    }
  | {
      card_type: 'insight_summary';
      /** Main headline; omit or leave empty when the parent message already shows the same title. */
      title: string;
      rows: Array<{ label: string; value: string }>;
      /** `compact` hides the “Summary” eyebrow for scannable KPI-style answers. */
      presentation?: 'default' | 'compact';
      /** Optional footer CTA (e.g. "View invoices"). */
      cta?: { label: string; href: string };
    }
  | {
      card_type: 'customer_single';
      customer_id: string;
      display_name: string;
      email?: string | null;
      primary_mode: 'edit' | 'view';
      can_edit_customer: boolean;
    }
  | {
      card_type: 'customer_pick';
      primary_mode: 'edit' | 'view';
      can_edit_customer: boolean;
      options: Array<{
        customer_id: string;
        display_name: string;
        email?: string | null;
      }>;
    }
  | {
      /** Polished summary after assistant-led customer creation (before invoice line items). */
      card_type: 'customer_created_summary';
      customer_id: string;
      display_name: string;
      email: string | null;
      phone: string | null;
      contact_name: string | null;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
      country_code: string | null;
      country_name: string | null;
    };

/** Optional chips below an assistant message (e.g. progressive disclosure). */
export type AssistantQuickReply = {
  label: string;
  /** Text sent as the next user message when the chip is tapped (ignored when `href` is set). */
  message: string;
  /** When set, navigate client-side instead of sending `message`. */
  href?: string | null;
};

/**
 * Plain-text assistant copy with an optional title (render title with UI bold — no markdown).
 */
export type AssistantStructuredBody = {
  title?: string;
  lines: string[];
};

export function flattenAssistantStructured(body: AssistantStructuredBody): string[] {
  const out: string[] = [];
  const t = body.title?.trim();
  if (t) out.push(t);
  out.push(...body.lines.filter((x) => String(x).trim().length > 0));
  return out;
}

export type InvoiceWizardResponse = {
  session_id: string;
  step: InvoiceWizardStep;
  /** Assistant collection phase for multi-turn draft capture. */
  assistant_state?: 'collecting_invoice_details' | null;
  /** Next field the assistant expects from user input. */
  expected_field?: 'customer' | 'line_item' | 'amount' | 'due_date' | 'confirm' | null;
  draft: InvoiceWizardDraft;
  missing_fields: WizardMissingField[];
  assistant_lines: string[];
  /**
   * When `chat_cards` are present, render these lines after the card(s) and before `quick_replies`
   * (e.g. a follow-up question, then chips).
   */
  assistant_post_card_lines?: string[] | null;
  /** When set, clients should render `title` + `lines` with styled title (not markdown). */
  assistant_structured?: AssistantStructuredBody | null;
  customer_match?: CustomerMatchPayload | null;
  /** Deterministic customer identity phase for this turn (premium UX / analytics). */
  customer_resolution_state?: CustomerResolutionState | null;
  invoice?: {
    id: string;
    invoice_number?: string | null;
    customer_name?: string | null;
    status?: string | null;
  } | null;
  error?: string | null;
  /** Structured invoice lookup / action UI (chat assistant). */
  chat_cards?: InvoiceAssistantChatCard[] | null;
  /** Optional action chips (e.g. revenue breakdown follow-ups). */
  quick_replies?: AssistantQuickReply[] | null;
  /**
   * When set, client should send back with the next message until cleared.
   * Value is a PendingAssistantInvoice (legacy name `pending_invoice_lookup` on the wire).
   */
  pending_invoice_lookup?: PendingAssistantInvoice | null;
  /** Last financial KPI / breakdown context (optional round-trip for future chip handling). */
  metric_session_context?: AssistantMetricSessionContext | null;
  /** Customer record follow-up (e.g. after “Customer found” + edit default). */
  pending_customer_context?: PendingAssistantCustomer | null;
  /** One-shot navigation hint after confirmations (client runs `router.push`). */
  client_navigate?: AssistantClientNavigate | null;
  /** In-chat record payment — prefer over `client_navigate` to manage-payment for assistant UX. */
  open_record_payment?: AssistantOpenRecordPayment | null;
  /** Inline widgets (e.g. country selector) for the chat composer area. */
  wizard_client_ui?: WizardClientUI | null;
  /**
   * Echoed while the user is in Assistant customer edit mode; client sends back until cleared.
   * Suppresses invoice customer picker churn if `pending_customer_context` is missing.
   */
  customer_edit_session?: AssistantCustomerEditSessionV1 | null;
};
