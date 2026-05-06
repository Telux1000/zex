import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { extractInvoiceWizardUserText } from '@/lib/ai/invoice-parser';
import { createInvoiceFromParsed } from '@/lib/invoices/create-from-parsed';
import {
  dedupeMatchableCustomersById,
  disambiguateCustomerSuggestionLabels,
  resolveCustomerMatchFromAiInput,
  isInvalidGenericCustomerName,
} from '@/lib/customers/match-from-text';
import { assertBusinessPermission } from '@/lib/rbac/server';
import {
  type InvoiceReadinessBusinessRow,
  probeInvoiceCreationSetup,
} from '@/lib/onboarding/invoice-readiness-server';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';
import { createCustomerForBusiness } from '@/lib/customers/create-customer-server';
import { isSupportedCurrency } from '@/lib/currency/supported';
import { normalizeCountryCode } from '@/lib/location';
import { countryFieldsForStorageFromIso } from '@/lib/location/resolve-country-input';
import {
  emptyInvoiceWizardDraft,
  isEmptyWizardDraft,
  mergeWizardAiExtractIntoDraft,
} from '@/lib/invoices/conversational-invoice-wizard/draft';
import {
  applyNewCustomerOnboardingRawInput,
  applyNewCustomerOnboardingSkip,
  completeNewCustomerOnboarding,
  dedupeWizardAddressFields,
  ensureNewCustomerOnboardSubstep,
  fastForwardNewCustomerOnboardingAfterExtract,
  hasWizardCustomerAddressText,
  mergeCountryIntoNewCustomerDraft,
  normalizeAddressWhitespace,
} from '@/lib/invoices/conversational-invoice-wizard/new-customer-onboarding';
import { countries as isoCountries } from '@/lib/location/countries';
import {
  isAssistantAffirmation,
  isAssistantConfirmationDecline,
  isAssistantCustomerEditExit,
  isAssistantSwitchCustomer,
  normalizePendingCustomerContextFromUnknown,
  parseNameCompanyVsContactReply,
  resolveCustomerPickSelection,
} from '@/lib/business-assistant/assistant-customer-follow-up';
import {
  ASSISTANT_CONFIRM_DONE,
  ASSISTANT_CONTINUE_INVOICE_AFTER_CUSTOMER_EDIT,
  ASSISTANT_CREATE_CUSTOMER_GENERIC_ERROR,
  ASSISTANT_CUSTOMER_CREATED_CONFIRM,
  ASSISTANT_GENERIC_RETRY,
  CUSTOMER_INLINE_ASK_EDIT,
  CUSTOMER_INLINE_ASK_WHAT_TO_UPDATE,
  CUSTOMER_INLINE_CLOSE_NO_CHANGES,
  CUSTOMER_INLINE_CANNOT_REMOVE_EMAIL,
  CUSTOMER_INLINE_NAME_CLARIFY_RETRY,
  CUSTOMER_INLINE_NAME_WHICH,
  CUSTOMER_INLINE_NOT_FOUND,
  CUSTOMER_INLINE_POST_UPDATE,
  CUSTOMER_INLINE_SWITCH_CUSTOMER,
  CUSTOMER_INLINE_UNCLEAR,
  CUSTOMER_INSERT_VALIDATION,
  CUSTOMER_MATCH_PICK_OR_NEW,
  CUSTOMER_MATCH_UNSPECIFIED,
  INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
  invoiceWizardCustomerPickPrompt,
  WIZARD_COLLECT_ITEMS_LINE,
  wizardConfirmBlockedMessage,
  wizardConfirmEchoForTurn,
  wizardSingleMissingPrompt,
} from '@/lib/business-assistant/assistant-tone';
import { buildWizardShellResponse } from '@/lib/business-assistant/wizard-shell';
import {
  assistantLinesForStep,
  computeMissingFields,
  deriveExpectedInvoiceField,
  deriveCustomerResolutionState,
  draftToParsedInvoice,
  getNextMissingInvoiceField,
  isWizardDraftReadyForInvoiceCreate,
  resolveWizardStep,
  userTextSkipsCustomerOptionalStep,
} from '@/lib/invoices/conversational-invoice-wizard/state-machine';
import {
  wizardExtractHasInvoicePayload,
  type WizardAiExtract,
} from '@/lib/invoices/conversational-invoice-wizard/wizard-ai-extract';
import { buildUnifiedInvoiceTurnReplyLines } from '@/lib/invoices/conversational-invoice-wizard/wizard-assistant-turn';
import {
  shouldResetDraftForNewInvoiceIntent,
  textLooksLikeCreateInvoiceFlow,
} from '@/lib/invoices/invoice-chat-intent';
import { resolveCustomerBootstrapWhenNoCustomers } from '@/lib/invoices/conversational-invoice-wizard/chat-customer-bootstrap';
import { shouldAutoCreateInvoiceFromWizardTurn } from '@/lib/invoices/conversational-invoice-wizard/auto-create-policy';
import { resolveAddressPhase } from '@/lib/invoices/conversational-invoice-wizard/address-intelligence';
import { applyWizardCountryUserMessage } from '@/lib/invoices/conversational-invoice-wizard/country-wizard-turn';
import { mapValidationErrorToPrompt } from '@/lib/invoices/conversational-invoice-wizard/validation-prompts';
import {
  applyAssistantCustomerClearAddress,
  applyAssistantCustomerInlinePatch,
  displayNameFromRow,
  fetchCustomerInlineRow,
  formatCustomerConversationalSnapshot,
  type CustomerInlineRow,
} from '@/lib/customers/assistant-customer-inline-update';
import type { Customer } from '@/lib/database.types';
import { shouldExitCustomerInlineEditForStrongIntent } from '@/lib/customers/customer-inline-edit-strong-intent';
import type {
  CustomerInlineClearTarget,
  CustomerInlineEditCommand,
  CustomerInlinePatchKey,
} from '@/lib/customers/parse-customer-inline-edit-intent';
import { parseCustomerInlineEditCommand } from '@/lib/customers/parse-customer-inline-edit-intent';
import {
  formatDueDateForAssistantSummary,
  normalizeWizardDueDateToIso,
  validateAssistantDueDateIso,
} from '@/lib/utils/date';
import type {
  AssistantQuickReply,
  InvoiceAssistantChatCard,
  InvoiceWizardDraft,
  InvoiceWizardResponse,
  InvoiceWizardStep,
  PendingAssistantCustomer,
  PendingAssistantInvoice,
} from '@/lib/invoices/conversational-invoice-wizard/types';
import { coerceMetricSessionContextFromClient } from '@/lib/business-assistant/metric-session-context';
import {
  handleCustomerCreateWithCompanyNameReply,
  handleCustomerEmailUpdateWithCustomerNameReply,
} from '@/lib/business-assistant/handlers/customer-module';
import { coerceActiveWorkflowFromClient } from '@/lib/business-assistant/assistant-intent-hierarchy';
import { routeBusinessAssistantUserTurn } from '@/lib/business-assistant/router';
import { isSafeIanaTimeZone } from '@/lib/dashboard/date-range';
import { featureUpgradeMessage, hasPlanFeature } from '@/lib/billing/plans';
import { assertWorkspaceCoreWriteAccess, getOwnerBillingPlanAfterReconcile } from '@/lib/billing/subscription-access';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { assertPlatformInvoiceWizardAiEnabled } from '@/lib/admin/ai-assistant-platform-gate';
import { extractRawInvoiceTextFromImageBase64 } from '@/lib/ai/document-parser';
import { normalizeAssistantBrandMentionsForRouting } from '@/lib/assistant/brand-mention-normalization';

const NEW_CUSTOMER_ONBOARDING_STEPS: InvoiceWizardStep[] = [
  'COLLECT_NEW_CUSTOMER_PHONE',
  'COLLECT_NEW_CUSTOMER_CONTACT',
  'COLLECT_NEW_CUSTOMER_ADDRESS',
  'COLLECT_NEW_CUSTOMER_COUNTRY',
];

const lineItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  unit_label: z.string().max(40).optional(),
  description: z.string().nullable().optional(),
});

const newCustomerSubstepSchema = z.enum(['phone', 'contact', 'address', 'country']);

const newCustomerAddressCollectSlotSchema = z
  .enum(['street', 'city', 'region', 'postal'])
  .nullable()
  .optional();

const draftSchema = z.object({
  customerId: z.string().nullable(),
  isNewCustomer: z.boolean(),
  customerName: z.string(),
  customerEmail: z.string(),
  customerPhone: z.string().nullable().optional(),
  customerContactName: z.string().nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  customerAddressLine1: z.string().nullable().optional(),
  customerAddressLine2: z.string().nullable().optional(),
  customerCity: z.string().nullable().optional(),
  customerState: z.string().nullable().optional(),
  customerPostalCode: z.string().nullable().optional(),
  customerCountry: z.string().nullable().optional(),
  newCustomerOnboardSubstep: newCustomerSubstepSchema.nullable().optional(),
  newCustomerOptionalStepDone: z.boolean().optional(),
  resumeInvoiceAfterCustomerCreate: z.boolean().optional(),
  newCustomerAddressCollectSlot: newCustomerAddressCollectSlotSchema,
  newCustomerAddressSkips: z
    .object({ region: z.boolean().optional(), postal: z.boolean().optional() })
    .nullable()
    .optional(),
  awaitingPostCreateCustomerChoice: z.boolean().optional(),
  pendingCountryCandidates: z.array(z.string().min(2).max(2)).nullable().optional(),
  countryModalRecommended: z.boolean().optional(),
  items: z.array(lineItemSchema),
  dueDate: z.string().nullable(),
  notes: z.string().nullable(),
  currency: z.string().nullable(),
  taxPercent: z.number().nullable(),
  discountPercent: z.number().nullable(),
  discountAmount: z.number().nullable(),
  usePaymentSchedule: z.boolean(),
});

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select_customer'), customer_id: z.string().uuid() }),
  z.object({ type: z.literal('commit_new_customer') }),
  z.object({ type: z.literal('confirm_create'), idempotency_key: z.string().min(8).max(200) }),
  z.object({ type: z.literal('mark_new_customer') }),
  z.object({ type: z.literal('apply_country'), country_code: z.string().min(2).max(2) }),
  z.object({ type: z.literal('reset') }),
  z.object({
    type: z.literal('start_customer_inline_edit'),
    customer_id: z.string().uuid(),
  }),
]);

function normalizePendingInvoiceLookupFromBody(
  val: unknown
): PendingAssistantInvoice | null {
  if (val == null || typeof val !== 'object') return null;
  const o = val as Record<string, unknown>;
  if (o.kind === 'invoice_ref' && o.subkind === 'view_edit') {
    if (o.intent === 'edit_invoice' || o.intent === 'view_invoice') {
      return { kind: 'invoice_ref', subkind: 'view_edit', intent: o.intent };
    }
    return null;
  }
  if (o.kind === 'invoice_ref' && o.subkind === 'action') {
    const a = o.action;
    if (
      a === 'mark_paid' ||
      a === 'send' ||
      a === 'resend' ||
      a === 'duplicate' ||
      a === 'void'
    ) {
      return { kind: 'invoice_ref', subkind: 'action', action: a };
    }
    return null;
  }
  if (!('kind' in o) && (o.intent === 'edit_invoice' || o.intent === 'view_invoice')) {
    return { kind: 'invoice_ref', subkind: 'view_edit', intent: o.intent };
  }
  return null;
}

const bodySchema = z.object({
  business_id: z.string().uuid(),
  session_id: z.string().min(8).max(200),
  draft: draftSchema,
  user_text: z.string().max(32000).optional(),
  action: actionSchema.optional(),
  pending_invoice_lookup: z.unknown().optional().nullable(),
  /** IANA timezone from dashboard (e.g. `America/New_York`) for assistant date windows */
  workspace_timezone: z.string().min(2).max(120).optional().nullable(),
  /** Echo of last financial KPI context (e.g. bare “By invoice” chip). */
  metric_session_context: z.unknown().optional().nullable(),
  /** Customer card follow-up (single match + default action). */
  pending_customer_context: z.unknown().optional().nullable(),
  /** Locks Assistant customer edit when `pending_customer_context` was dropped client-side. */
  customer_edit_session: z
    .object({
      customer_id: z.string().uuid(),
      display_name: z.string().max(200),
    })
    .optional()
    .nullable(),
  /** Client echo: workflow lock for routing (see `deriveAssistantActiveWorkflowFromClientState`). */
  active_workflow: z.string().max(64).optional().nullable(),
  /**
   * Where the user opened the Assistant from (first empty-draft bootstrap only).
   * `general` — default menu entry; `create_invoice` / `create_customer` — focused onboarding.
   */
  assistant_launch_context: z
    .enum(['general', 'create_invoice', 'create_customer'])
    .optional(),
  /** Screenshot from Assistant composer: merged into user_text after vision OCR (same wizard pipeline). */
  assistant_image: z
    .object({
      base64: z.string().max(11_000_000),
      mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    })
    .optional(),
  /** Client echo: invoice just created in this chat (pronoun follow-ups: “send it”). */
  recent_created_invoice: z
    .object({
      invoice_id: z.string().uuid(),
      invoice_number: z.string().nullable().optional(),
      customer_name: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
    })
    .optional()
    .nullable(),
});

function normalizeDraft(d: z.infer<typeof draftSchema>): InvoiceWizardDraft {
  return {
    customerId: d.customerId,
    isNewCustomer: d.isNewCustomer,
    customerName: d.customerName,
    customerEmail: d.customerEmail,
    customerPhone: d.customerPhone ?? null,
    customerContactName: d.customerContactName ?? null,
    customerAddress: d.customerAddress ?? null,
    customerAddressLine1: d.customerAddressLine1 ?? null,
    customerAddressLine2: d.customerAddressLine2 ?? null,
    customerCity: d.customerCity ?? null,
    customerState: d.customerState ?? null,
    customerPostalCode: d.customerPostalCode ?? null,
    customerCountry: d.customerCountry ?? null,
    newCustomerOnboardSubstep: d.newCustomerOnboardSubstep ?? null,
    newCustomerOptionalStepDone: d.newCustomerOptionalStepDone ?? false,
    resumeInvoiceAfterCustomerCreate: d.resumeInvoiceAfterCustomerCreate === true ? true : undefined,
    newCustomerAddressCollectSlot: d.newCustomerAddressCollectSlot ?? undefined,
    newCustomerAddressSkips: d.newCustomerAddressSkips ?? undefined,
    awaitingPostCreateCustomerChoice: d.awaitingPostCreateCustomerChoice === true ? true : undefined,
    pendingCountryCandidates: d.pendingCountryCandidates ?? undefined,
    countryModalRecommended: d.countryModalRecommended === true ? true : undefined,
    items: d.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      unit_label: i.unit_label ?? 'item',
      description: i.description ?? null,
    })),
    dueDate: d.dueDate,
    notes: d.notes,
    currency: d.currency,
    taxPercent: d.taxPercent,
    discountPercent: d.discountPercent,
    discountAmount: d.discountAmount,
    usePaymentSchedule: d.usePaymentSchedule,
  };
}

function invoiceCreatedSuccessCards(
  draft: InvoiceWizardDraft,
  invoice: { id: string; invoice_number?: string | null }
): InvoiceAssistantChatCard[] {
  return [
    {
      card_type: 'invoice_created_success',
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number ?? null,
      customer_name: draft.customerName.trim() || null,
    },
  ];
}

/**
 * Maps wizard draft to the same payload shape as `POST /api/customers`, then calls
 * {@link createCustomerForBusiness} (activity, audit, notifications, validation).
 */
async function createCustomerFromWizardDraft(
  supabase: SupabaseClient,
  businessId: string,
  actorUserId: string,
  reportingCurrency: string,
  draft: InvoiceWizardDraft
): Promise<
  { ok: true; customerId: string; customer: Customer } | { ok: false; message: string }
> {
  const d0 = dedupeWizardAddressFields(draft);
  const company = d0.customerName.trim();
  const contactPerson = d0.customerContactName?.trim() ?? '';
  const email = d0.customerEmail.trim();
  if (!email || (!company && !contactPerson)) {
    return { ok: false, message: CUSTOMER_INSERT_VALIDATION };
  }
  const nameForApi = contactPerson;
  const companyRaw = company;
  const companyNorm =
    companyRaw && nameForApi && companyRaw.toLowerCase() === nameForApi.toLowerCase() ? '' : companyRaw;

  const pref = isSupportedCurrency(reportingCurrency) ? reportingCurrency : 'USD';
  const phoneRaw = d0.customerPhone?.trim();
  const rawLine1 = d0.customerAddressLine1?.trim() || d0.customerAddress?.trim() || '';
  const address_line1 = rawLine1 ? normalizeAddressWhitespace(rawLine1) : null;
  const hasAddr = hasWizardCustomerAddressText(d0);
  const countryIso = normalizeCountryCode(d0.customerCountry ?? '') || null;
  if (hasAddr && !countryIso) {
    return {
      ok: false,
      message:
        'We need a country for this address. Tell me the country (e.g. United Kingdom or GB), or use the picker.',
    };
  }
  const countryPayload = countryIso ? countryFieldsForStorageFromIso(countryIso) : { country: null, country_code: null };

  const result = await createCustomerForBusiness(supabase, actorUserId, {
    business_id: businessId,
    name: nameForApi || '',
    company: companyNorm || null,
    email,
    phone: phoneRaw ? normalizeAddressWhitespace(phoneRaw) : null,
    address_line1,
    address_line2: d0.customerAddressLine2?.trim() || null,
    city: d0.customerCity?.trim() || null,
    state: d0.customerState?.trim() || null,
    postal_code: d0.customerPostalCode?.trim() || null,
    country: countryPayload.country,
    country_code: countryPayload.country_code,
    preferred_currency_code: pref,
    notes: null,
  });

  if (!result.ok) {
    const message =
      result.status >= 500 ? ASSISTANT_CREATE_CUSTOMER_GENERIC_ERROR : result.error;
    return { ok: false, message };
  }
  return { ok: true, customerId: result.customer.id, customer: result.customer };
}

function countryDisplayNameFromCode(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const u = code.trim().toUpperCase();
  return isoCountries.find((c) => c.code === u)?.name ?? null;
}

/** Summary card from persisted customer row (same shape as create customer / DB). */
function customerCreatedSummaryFromCustomerRow(row: Customer): InvoiceAssistantChatCard {
  const company = row.company?.trim() || '';
  const personName = row.name?.trim() || '';
  const displayName = company || personName || 'Customer';
  const contactName =
    company && personName && company.toLowerCase() !== personName.toLowerCase() ? personName : null;

  const codeFromCol = row.country_code?.trim().toUpperCase() || '';
  const codeFromCountry = row.country?.trim() ? normalizeCountryCode(row.country) || '' : '';
  const countryCode = codeFromCol || codeFromCountry || null;

  const countryName =
    (countryCode ? countryDisplayNameFromCode(countryCode) : null) || row.country?.trim() || null;

  return {
    card_type: 'customer_created_summary',
    customer_id: row.id,
    display_name: displayName,
    email: row.email?.trim() || null,
    phone: row.phone?.trim() || null,
    contact_name: contactName,
    address_line1: row.address_line1?.trim() || null,
    address_line2: row.address_line2?.trim() || null,
    city: row.city?.trim() || null,
    state: row.state?.trim() || null,
    postal_code: row.postal_code?.trim() || null,
    country_code: countryCode,
    country_name: countryName,
  };
}

function buildResponse(
  sessionId: string,
  draft: InvoiceWizardDraft,
  step: InvoiceWizardResponse['step'],
  customerMatch: InvoiceWizardResponse['customer_match'],
  invoice: InvoiceWizardResponse['invoice'],
  error: string | null,
  extras?: {
    chat_cards?: InvoiceAssistantChatCard[] | null;
    assistant_post_card_lines?: string[] | null;
    pending_invoice_lookup?: PendingAssistantInvoice | null;
    assistant_lines_only?: string[] | null;
    prepend_assistant_lines?: string[] | null;
    quick_replies?: AssistantQuickReply[] | null;
    wizard_client_ui?: InvoiceWizardResponse['wizard_client_ui'];
    pending_customer_context?: InvoiceWizardResponse['pending_customer_context'];
    client_navigate?: InvoiceWizardResponse['client_navigate'];
    customer_edit_session?: InvoiceWizardResponse['customer_edit_session'];
    customer_resolution_state?: InvoiceWizardResponse['customer_resolution_state'];
  }
): InvoiceWizardResponse {
  const collectingSteps: InvoiceWizardStep[] = [
    'GET_CUSTOMER',
    'CHECK_CUSTOMER',
    'CREATE_CUSTOMER',
    'COLLECT_NEW_CUSTOMER_PHONE',
    'COLLECT_NEW_CUSTOMER_CONTACT',
    'COLLECT_NEW_CUSTOMER_ADDRESS',
    'COLLECT_NEW_CUSTOMER_COUNTRY',
    'COLLECT_ITEMS',
    'COLLECT_QUANTITY',
    'COLLECT_PRICING',
    'COLLECT_DUE_DATE',
  ];
  const assistantState = collectingSteps.includes(step) ? 'collecting_invoice_details' : null;
  const missing = computeMissingFields(draft);
  const baseStepLines = assistantLinesForStep(step, missing, draft);
  const prepend = extras?.prepend_assistant_lines?.filter((s) => String(s).trim());
  const assistantOnly = extras?.assistant_lines_only;
  let lines: string[];
  if (assistantOnly !== undefined && assistantOnly !== null) {
    const core = [...assistantOnly];
    if (prepend?.length) {
      lines = error ? [error, ...prepend, '', ...core] : [...prepend, '', ...core];
    } else {
      lines = error ? [error, ...core] : core;
    }
  } else {
    let defaultLines = baseStepLines;
    if (prepend?.length) {
      defaultLines = [...prepend, '', ...baseStepLines];
    }
    lines = error ? [error, ...defaultLines] : defaultLines;
  }
  return {
    session_id: sessionId,
    step,
    assistant_state: assistantState,
    expected_field: deriveExpectedInvoiceField(draft),
    draft,
    missing_fields: missing,
    assistant_lines: lines,
    customer_match: customerMatch ?? null,
    invoice: invoice ?? null,
    error: error ?? null,
    chat_cards: extras?.chat_cards ?? null,
    pending_invoice_lookup: extras?.pending_invoice_lookup ?? null,
    quick_replies: extras?.quick_replies ?? null,
    assistant_post_card_lines: extras?.assistant_post_card_lines ?? null,
    wizard_client_ui:
      extras?.wizard_client_ui !== undefined
        ? extras.wizard_client_ui
        : step === 'COLLECT_NEW_CUSTOMER_COUNTRY' && draft.countryModalRecommended === true
          ? { country_modal: true }
          : null,
    pending_customer_context: extras?.pending_customer_context ?? null,
    client_navigate: extras?.client_navigate ?? null,
    customer_edit_session: extras?.customer_edit_session ?? null,
    customer_resolution_state:
      extras?.customer_resolution_state !== undefined ? extras.customer_resolution_state : null,
  };
}

function autoCreateIdempotencyKey(sessionId: string, userText: string): string {
  const h = createHash('sha256').update(sessionId).update('\0').update(userText).digest('hex').slice(0, 48);
  return `auto_${h}`;
}

function customerInlineNeedValuePrompt(key: CustomerInlinePatchKey): string {
  switch (key) {
    case 'email':
      return 'What should the new email be?';
    case 'phone':
      return 'What should the new phone number be?';
    case 'company':
      return 'What should the company or client name be?';
    case 'name':
      return 'What should the contact person’s name be?';
    case 'country':
      return 'What country should I use?';
    case 'address_line1':
    case 'address_line2':
      return 'What should the address be?';
    case 'city':
      return 'What city should I use?';
    case 'state':
      return 'What state or province should I use?';
    case 'postal_code':
      return 'What postal or ZIP code should I use?';
    default:
      return 'What should I use instead?';
  }
}

function inferCountryFromAddressSnippet(text: string): string | null {
  const parts = text
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = normalizeCountryCode(parts[i]!);
    if (c) return c;
  }
  return null;
}

async function respondCustomerInlineEditStart(
  supabase: SupabaseClient,
  args: {
    sessionId: string;
    businessId: string;
    draft: InvoiceWizardDraft;
    customerMatch: InvoiceWizardResponse['customer_match'];
    customerNeedsDisambiguation: boolean;
    customerId: string;
  }
): Promise<InvoiceWizardResponse> {
  const row = await fetchCustomerInlineRow(supabase, args.businessId, args.customerId);
  if (!row) {
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [CUSTOMER_INLINE_NOT_FOUND],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
    });
  }
  const displayName = displayNameFromRow(row);
  const lines = [...formatCustomerConversationalSnapshot(row), '', CUSTOMER_INLINE_ASK_EDIT];
  return buildWizardShellResponse({
    sessionId: args.sessionId,
    draft: args.draft,
    customerMatch: args.customerMatch,
    customerNeedsDisambiguation: args.customerNeedsDisambiguation,
    assistant_lines: lines,
    chat_cards: null,
    pending_invoice_lookup: null,
    pending_customer_context: {
      kind: 'inline_editing',
      customer_id: row.id,
      display_name: displayName,
      can_edit_customer: true,
    },
  });
}

async function respondCustomerInlineEditUserText(
  supabase: SupabaseClient,
  args: {
    userId: string;
    businessId: string;
    sessionId: string;
    draft: InvoiceWizardDraft;
    customerMatch: InvoiceWizardResponse['customer_match'];
    customerNeedsDisambiguation: boolean;
    pending: Extract<PendingAssistantCustomer, { kind: 'inline_editing' }>;
    userText: string;
  }
): Promise<InvoiceWizardResponse> {
  const gateEdit = await assertBusinessPermission(supabase, args.businessId, args.userId, 'manage_customers');
  if (!gateEdit.ok) {
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: ['You do not have permission to edit customers.'],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  if (isAssistantCustomerEditExit(args.userText)) {
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [
        ASSISTANT_CONTINUE_INVOICE_AFTER_CUSTOMER_EDIT,
        '',
        WIZARD_COLLECT_ITEMS_LINE,
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  type InlineEditPending = Extract<PendingAssistantCustomer, { kind: 'inline_editing' }>;

  const pendingSansAwaiting: InlineEditPending = {
    kind: 'inline_editing',
    customer_id: args.pending.customer_id,
    display_name: args.pending.display_name,
    can_edit_customer: true,
    ...(args.pending.has_updates_in_session ? { has_updates_in_session: true as const } : {}),
  };

  const pendingAfterSuccessfulWrite = (
    row: CustomerInlineRow,
    extra?: Partial<Pick<InlineEditPending, 'awaiting_value_for' | 'awaiting_inline_clarify'>>
  ): InlineEditPending => ({
    kind: 'inline_editing',
    customer_id: row.id,
    display_name: displayNameFromRow(row),
    can_edit_customer: true,
    has_updates_in_session: true,
    ...(extra?.awaiting_value_for != null ? { awaiting_value_for: extra.awaiting_value_for } : {}),
    ...(extra?.awaiting_inline_clarify != null ? { awaiting_inline_clarify: extra.awaiting_inline_clarify } : {}),
  });

  const finishAddressCountryFollowUp = async (
    row: CustomerInlineRow,
    sourceText: string
  ): Promise<InvoiceWizardResponse> => {
    if (!String(row.country ?? '').trim()) {
      const inferred = inferCountryFromAddressSnippet(sourceText);
      if (inferred) {
        const c2 = await applyAssistantCustomerInlinePatch(supabase, {
          userId: args.userId,
          businessId: args.businessId,
          customerId: args.pending.customer_id,
          key: 'country',
          value: inferred,
        });
        if (c2.ok) {
          row = c2.row;
        } else {
          return buildWizardShellResponse({
            sessionId: args.sessionId,
            draft: args.draft,
            customerMatch: args.customerMatch,
            customerNeedsDisambiguation: args.customerNeedsDisambiguation,
            assistant_lines: [
              'Updated. Here’s the customer now:',
              '',
              ...formatCustomerConversationalSnapshot(row),
              '',
              customerInlineNeedValuePrompt('country'),
            ],
            chat_cards: null,
            pending_invoice_lookup: null,
            quick_replies: INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
            pending_customer_context: pendingAfterSuccessfulWrite(row, { awaiting_value_for: 'country' }),
          });
        }
      } else {
        return buildWizardShellResponse({
          sessionId: args.sessionId,
          draft: args.draft,
          customerMatch: args.customerMatch,
          customerNeedsDisambiguation: args.customerNeedsDisambiguation,
          assistant_lines: [
            'Updated. Here’s the customer now:',
            '',
            ...formatCustomerConversationalSnapshot(row),
            '',
            customerInlineNeedValuePrompt('country'),
          ],
          chat_cards: null,
          pending_invoice_lookup: null,
          quick_replies: INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
          pending_customer_context: pendingAfterSuccessfulWrite(row, { awaiting_value_for: 'country' }),
        });
      }
    }
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [
        'Updated. Here’s the customer now:',
        '',
        ...formatCustomerConversationalSnapshot(row),
        '',
        CUSTOMER_INLINE_POST_UPDATE,
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      quick_replies: INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
      pending_customer_context: pendingAfterSuccessfulWrite(row),
    });
  };

  const respondSwitchCustomer = (): InvoiceWizardResponse =>
    buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [CUSTOMER_INLINE_SWITCH_CUSTOMER],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });

  const respondShowReview = async (): Promise<InvoiceWizardResponse> => {
    const row = await fetchCustomerInlineRow(supabase, args.businessId, args.pending.customer_id);
    if (!row) {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [CUSTOMER_INLINE_NOT_FOUND],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: null,
        customer_edit_session: null,
      });
    }
    const displayName = displayNameFromRow(row);
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [
        'Here’s what I have on file:',
        '',
        ...formatCustomerConversationalSnapshot(row),
        '',
        CUSTOMER_INLINE_POST_UPDATE,
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      quick_replies: INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
      pending_customer_context: {
        kind: 'inline_editing',
        customer_id: row.id,
        display_name: displayName,
        can_edit_customer: true,
        ...(args.pending.has_updates_in_session ? { has_updates_in_session: true as const } : {}),
      },
    });
  };

  const handleClearFieldTarget = async (target: CustomerInlineClearTarget): Promise<InvoiceWizardResponse> => {
    if (target === 'email') {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [CUSTOMER_INLINE_CANNOT_REMOVE_EMAIL, '', CUSTOMER_INLINE_ASK_EDIT],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: pendingSansAwaiting,
      });
    }
    const key: CustomerInlinePatchKey =
      target === 'phone' ? 'phone' : target === 'name' ? 'name' : target === 'company' ? 'company' : 'country';
    const cleared = await applyAssistantCustomerInlinePatch(supabase, {
      userId: args.userId,
      businessId: args.businessId,
      customerId: args.pending.customer_id,
      key,
      value: '',
    });
    if (!cleared.ok) {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [cleared.userMessage, '', CUSTOMER_INLINE_ASK_EDIT],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: pendingSansAwaiting,
      });
    }
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [
        'Updated. Here’s the customer now:',
        '',
        ...formatCustomerConversationalSnapshot(cleared.row),
        '',
        CUSTOMER_INLINE_POST_UPDATE,
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      quick_replies: INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
      pending_customer_context: pendingAfterSuccessfulWrite(cleared.row),
    });
  };

  const applyDirectUpdate = async (key: CustomerInlinePatchKey, value: string): Promise<InvoiceWizardResponse> => {
    const applied = await applyAssistantCustomerInlinePatch(supabase, {
      userId: args.userId,
      businessId: args.businessId,
      customerId: args.pending.customer_id,
      key,
      value,
    });
    if (!applied.ok) {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [applied.userMessage, '', CUSTOMER_INLINE_ASK_EDIT],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: pendingSansAwaiting,
      });
    }
    if (key === 'address_line1') {
      return finishAddressCountryFollowUp(applied.row, value);
    }
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [
        'Updated. Here’s the customer now:',
        '',
        ...formatCustomerConversationalSnapshot(applied.row),
        '',
        CUSTOMER_INLINE_POST_UPDATE,
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      quick_replies: INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
      pending_customer_context: pendingAfterSuccessfulWrite(applied.row),
    });
  };

  const handleCommandInEditSession = async (
    cmd: CustomerInlineEditCommand
  ): Promise<InvoiceWizardResponse | null> => {
    if (cmd.kind === 'switch_customer' || isAssistantSwitchCustomer(args.userText)) {
      return respondSwitchCustomer();
    }
    if (cmd.kind === 'show_review') {
      return respondShowReview();
    }
    if (cmd.kind === 'open_form') {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: ['Opening the customer form — save there when you’re done, and we’ll pick up here in chat.'],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: pendingSansAwaiting,
        wizard_client_ui: { open_customer_form: { customer_id: args.pending.customer_id } },
      });
    }
    if (cmd.kind === 'clear_address') {
      const cleared = await applyAssistantCustomerClearAddress(supabase, {
        userId: args.userId,
        businessId: args.businessId,
        customerId: args.pending.customer_id,
      });
      if (!cleared.ok) {
        return buildWizardShellResponse({
          sessionId: args.sessionId,
          draft: args.draft,
          customerMatch: args.customerMatch,
          customerNeedsDisambiguation: args.customerNeedsDisambiguation,
          assistant_lines: [cleared.userMessage, '', CUSTOMER_INLINE_ASK_EDIT],
          chat_cards: null,
          pending_invoice_lookup: null,
          pending_customer_context: pendingSansAwaiting,
        });
      }
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [
          'Updated. Here’s the customer now:',
          '',
          ...formatCustomerConversationalSnapshot(cleared.row),
          '',
          CUSTOMER_INLINE_POST_UPDATE,
        ],
        chat_cards: null,
        pending_invoice_lookup: null,
        quick_replies: INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
        pending_customer_context: pendingAfterSuccessfulWrite(cleared.row),
      });
    }
    if (cmd.kind === 'clear_field') {
      return handleClearFieldTarget(cmd.target);
    }
    if (cmd.kind === 'ambiguous_name') {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [CUSTOMER_INLINE_NAME_WHICH],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: {
          ...pendingSansAwaiting,
          awaiting_inline_clarify: 'name_company_vs_contact',
        },
      });
    }
    if (cmd.kind === 'field_focus') {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [customerInlineNeedValuePrompt(cmd.key)],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: { ...pendingSansAwaiting, awaiting_value_for: cmd.key },
      });
    }
    if (cmd.kind === 'need_value') {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [customerInlineNeedValuePrompt(cmd.key)],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: { ...pendingSansAwaiting, awaiting_value_for: cmd.key },
      });
    }
    if (cmd.kind === 'direct_update') {
      return applyDirectUpdate(cmd.key, cmd.value);
    }
    return null;
  };

  if (args.pending.awaiting_inline_clarify === 'name_company_vs_contact') {
    if (isAssistantSwitchCustomer(args.userText)) {
      return respondSwitchCustomer();
    }
    const scope = parseNameCompanyVsContactReply(args.userText);
    if (scope === 'company') {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [customerInlineNeedValuePrompt('company')],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: { ...pendingSansAwaiting, awaiting_value_for: 'company' },
      });
    }
    if (scope === 'contact') {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [customerInlineNeedValuePrompt('name')],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: { ...pendingSansAwaiting, awaiting_value_for: 'name' },
      });
    }
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [CUSTOMER_INLINE_NAME_CLARIFY_RETRY],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: {
        ...pendingSansAwaiting,
        awaiting_inline_clarify: 'name_company_vs_contact',
      },
    });
  }

  const av = args.pending.awaiting_value_for;
  if (av) {
    const cmd = parseCustomerInlineEditCommand(args.userText);
    const routed = await handleCommandInEditSession(cmd);
    if (routed) {
      return routed;
    }
    const applied = await applyAssistantCustomerInlinePatch(supabase, {
      userId: args.userId,
      businessId: args.businessId,
      customerId: args.pending.customer_id,
      key: av,
      value: args.userText,
    });
    if (!applied.ok) {
      return buildWizardShellResponse({
        sessionId: args.sessionId,
        draft: args.draft,
        customerMatch: args.customerMatch,
        customerNeedsDisambiguation: args.customerNeedsDisambiguation,
        assistant_lines: [applied.userMessage, '', CUSTOMER_INLINE_ASK_EDIT],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: { ...pendingSansAwaiting, awaiting_value_for: av },
      });
    }
    if (av === 'address_line1') {
      return finishAddressCountryFollowUp(applied.row, args.userText);
    }
    return buildWizardShellResponse({
      sessionId: args.sessionId,
      draft: args.draft,
      customerMatch: args.customerMatch,
      customerNeedsDisambiguation: args.customerNeedsDisambiguation,
      assistant_lines: [
        'Updated. Here’s the customer now:',
        '',
        ...formatCustomerConversationalSnapshot(applied.row),
        '',
        CUSTOMER_INLINE_POST_UPDATE,
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      quick_replies: INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES,
      pending_customer_context: pendingAfterSuccessfulWrite(applied.row),
    });
  }

  const parsed = parseCustomerInlineEditCommand(args.userText);
  const mainRouted = await handleCommandInEditSession(parsed);
  if (mainRouted) {
    return mainRouted;
  }

  return buildWizardShellResponse({
    sessionId: args.sessionId,
    draft: args.draft,
    customerMatch: args.customerMatch,
    customerNeedsDisambiguation: args.customerNeedsDisambiguation,
    assistant_lines: [CUSTOMER_INLINE_UNCLEAR],
    chat_cards: null,
    pending_invoice_lookup: null,
    pending_customer_context: pendingSansAwaiting,
  });
}

async function executeConfirmCreateInvoice(args: {
  supabase: SupabaseClient;
  sessionId: string;
  businessId: string;
  reportingCurrency: string;
  draft: InvoiceWizardDraft;
  customerMatch: InvoiceWizardResponse['customer_match'];
  customerNeedsDisambiguation: boolean;
  idempotencyKey: string;
  userId: string;
}): Promise<NextResponse> {
  const {
    supabase,
    sessionId,
    businessId,
    reportingCurrency,
    draft,
    customerMatch,
    customerNeedsDisambiguation,
    idempotencyKey: key,
  } = args;

  const stepBeforeCreate = resolveWizardStep(draft, { customerNeedsDisambiguation });
  if (stepBeforeCreate !== 'CONFIRM') {
    return NextResponse.json(
      buildResponse(
        sessionId,
        draft,
        stepBeforeCreate,
        customerMatch,
        null,
        wizardConfirmBlockedMessage(getNextMissingInvoiceField(draft))
      ) satisfies InvoiceWizardResponse,
      { status: 422 }
    );
  }

  const { data: recent } = await supabase
    .from('invoices')
    .select('id, invoice_number, metadata, status')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(40);

  const prior = recent?.find(
    (r) =>
      r.metadata &&
      typeof r.metadata === 'object' &&
      (r.metadata as Record<string, unknown>).wizard_idempotency_key === key
  );
  if (prior?.id) {
    const draftSnapshotForCards = draft;
    const clearedAfterSuccess = emptyInvoiceWizardDraft();
    const priorStatus =
      prior && typeof prior === 'object'
        ? String((prior as { status?: unknown }).status ?? '')
        : '';
    return NextResponse.json(
      buildResponse(
        sessionId,
        clearedAfterSuccess,
        'SUCCESS',
        null,
        {
          id: String(prior.id),
          invoice_number: prior.invoice_number ?? null,
          customer_name: draftSnapshotForCards.customerName.trim() || null,
          status: priorStatus || null,
        },
        null,
        {
          chat_cards: invoiceCreatedSuccessCards(draftSnapshotForCards, {
            id: String(prior.id),
            invoice_number: prior.invoice_number ?? null,
          }),
          assistant_lines_only: [],
          quick_replies: [
            { label: 'Send invoice', message: 'Send it' },
            { label: 'View in chat', message: 'View it' },
            { label: 'Edit in chat', message: 'Edit it' },
          ],
        }
      ) satisfies InvoiceWizardResponse
    );
  }

  let parsedInvoice;
  try {
    parsedInvoice = draftToParsedInvoice(draft, reportingCurrency);
  } catch (ze) {
    if (ze instanceof ZodError) {
      console.error('[invoice-wizard] draftToParsedInvoice', ze.flatten(), ze.issues);
      const friendly = mapValidationErrorToPrompt(ze, draft);
      const recoverStep = resolveWizardStep(draft, { customerNeedsDisambiguation });
      return NextResponse.json(
        buildResponse(sessionId, draft, recoverStep, customerMatch, null, friendly) satisfies InvoiceWizardResponse,
        { status: 422 }
      );
    }
    throw ze;
  }

  const invoice = await createInvoiceFromParsed(supabase, {
    businessId,
    currency: reportingCurrency,
    parsed: parsedInvoice,
    customerId: draft.customerId,
    themeId: null,
    actorUserId: args.userId,
    source: 'assistant',
  });

  const invRow = invoice as {
    id: string;
    metadata?: Record<string, unknown> | null;
    invoice_number?: string;
  };
  const mergedMeta = {
    ...(typeof invRow.metadata === 'object' && invRow.metadata ? invRow.metadata : {}),
    wizard_session_id: sessionId,
    wizard_idempotency_key: key,
  };
  await supabase.from('invoices').update({ metadata: mergedMeta }).eq('id', invRow.id);

  const invOut = invoice as { id: string; invoice_number?: string | null; status?: string | null };
  const draftSnapshotForCards = draft;
  const clearedAfterSuccess = emptyInvoiceWizardDraft();
  return NextResponse.json(
    buildResponse(
      sessionId,
      clearedAfterSuccess,
      'SUCCESS',
      null,
      {
        id: invOut.id,
        invoice_number: invOut.invoice_number ?? null,
        customer_name: draftSnapshotForCards.customerName.trim() || null,
        status: invOut.status != null ? String(invOut.status) : 'draft',
      },
      null,
      {
        chat_cards: invoiceCreatedSuccessCards(draftSnapshotForCards, {
          id: invOut.id,
          invoice_number: invOut.invoice_number ?? null,
        }),
        assistant_lines_only: [],
        quick_replies: [
          { label: 'Send invoice', message: 'Send it' },
          { label: 'View in chat', message: 'View it' },
          { label: 'Edit in chat', message: 'Edit it' },
        ],
      }
    ) satisfies InvoiceWizardResponse
  );
}

export async function POST(req: Request) {
  let errorRecovery: { sessionId: string; draft: InvoiceWizardDraft } | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wizAdmin = getSupabaseServiceAdmin();
    const wizGate = await assertPlatformInvoiceWizardAiEnabled(wizAdmin);
    if (wizGate) return wizGate;

    const raw = await req.json();
    const parsedBody = bodySchema.safeParse(raw);
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { business_id: businessId, session_id: sessionId, action } = parsedBody.data;
    const recentCreatedInvoice = parsedBody.data.recent_created_invoice
      ? {
          invoice_id: parsedBody.data.recent_created_invoice.invoice_id,
          invoice_number: parsedBody.data.recent_created_invoice.invoice_number ?? null,
          customer_name: parsedBody.data.recent_created_invoice.customer_name ?? null,
          status: parsedBody.data.recent_created_invoice.status ?? null,
        }
      : null;
    let draft = normalizeDraft(parsedBody.data.draft);
    const draftAtRequestStart = structuredClone(draft);
    const hadCustomerEmailBeforeTurn = Boolean(draft.customerEmail.trim());
    let extractHadInvoicePayload = false;
    const requestedEmptyBootstrap = isEmptyWizardDraft(draft);
    let customerMatch: InvoiceWizardResponse['customer_match'] = null;
    let customerNeedsDisambiguation = false;
    let exactAutoLinkedThisTurn = false;
    let insertedCustomerThisTurn = false;
    let insertedCustomerSnapshot: Customer | null = null;
    /** Lines to prepend when fuzzy country resolution succeeds in chat. */
    let countryWizardAck: string[] | null = null;
    errorRecovery = { sessionId, draft };

    const gate = await assertBusinessPermission(supabase, businessId, user.id, 'create_invoice');
    if (!gate.ok) return gate.response;
    const { role } = gate;

    const { data: business, error: businessSelectError } = await supabase
      .from('businesses')
      .select(
        'id, owner_id, name, currency, timezone, address_line1, city, state, country, email, phone, invoice_settings'
      )
      .eq('id', businessId)
      .maybeSingle();
    if (businessSelectError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    let workspaceHasNoCustomers = false;
    const setupProbe = await probeInvoiceCreationSetup(
      supabase,
      businessId,
      business as InvoiceReadinessBusinessRow
    );
    if (!setupProbe.ok) {
      if ('notFound' in setupProbe && setupProbe.notFound) {
        return NextResponse.json({ error: 'Business not found' }, { status: 404 });
      }
      if ('customersQueryFailed' in setupProbe) {
        return NextResponse.json({ error: setupProbe.customersQueryFailed }, { status: 500 });
      }
      if ('missing' in setupProbe && setupProbe.missing === 'business_profile') {
        return NextResponse.json(
          {
            error: 'Complete your business profile before creating invoices.',
            code: 'invoice_setup_incomplete',
            missing: ['business_profile'],
          },
          { status: 403 }
        );
      }
      if ('missing' in setupProbe && setupProbe.missing === 'currency') {
        return NextResponse.json(
          {
            error: 'Set a supported base currency before creating invoices.',
            code: 'invoice_setup_incomplete',
            missing: ['currency'],
          },
          { status: 403 }
        );
      }
      workspaceHasNoCustomers = 'missing' in setupProbe && setupProbe.missing === 'customer';
    }

    const ownerIdWizard = String((business as { owner_id: string }).owner_id);
    const subGate = await assertWorkspaceCoreWriteAccess(supabase, ownerIdWizard);
    if (!subGate.ok) return subGate.response;

    const billingPlan = await getOwnerBillingPlanAfterReconcile(supabase, ownerIdWizard);
    if (!hasPlanFeature(billingPlan, 'ai_assistant')) {
      return NextResponse.json(
        {
          error: featureUpgradeMessage('ai_assistant'),
          code: 'plan_feature_ai_assistant',
          current_plan: billingPlan,
          cta: 'Upgrade',
        },
        { status: 403 }
      );
    }

    const reportingCurrency = getBusinessBaseCurrency(
      business as {
        currency?: string | null;
        invoice_settings?: { default_currency?: string | null } | null;
      }
    );

    if (action?.type === 'reset') {
      const fresh = emptyInvoiceWizardDraft();
      const step = resolveWizardStep(fresh, { customerNeedsDisambiguation: false });
      return NextResponse.json(
        buildResponse(sessionId, fresh, step, null, null, null, {
          assistant_lines_only: [],
        }) satisfies InvoiceWizardResponse
      );
    }

    if (action?.type === 'mark_new_customer') {
      draft = {
        ...draft,
        isNewCustomer: true,
        customerId: null,
        customerPhone: null,
        customerContactName: null,
        customerAddress: null,
        customerAddressLine1: null,
        customerAddressLine2: null,
        customerCity: null,
        customerState: null,
        customerPostalCode: null,
        customerCountry: null,
        newCustomerOnboardSubstep: null,
        newCustomerOptionalStepDone: false,
        newCustomerAddressCollectSlot: null,
        newCustomerAddressSkips: null,
        awaitingPostCreateCustomerChoice: false,
        pendingCountryCandidates: null,
        countryModalRecommended: false,
      };
      errorRecovery = { sessionId, draft };
    }

    if (action?.type === 'apply_country') {
      const probeCountry = resolveWizardStep(draft, { customerNeedsDisambiguation: false });
      if (probeCountry === 'COLLECT_NEW_CUSTOMER_COUNTRY') {
        const code = normalizeCountryCode(action.country_code);
        if (code) {
          draft = mergeCountryIntoNewCustomerDraft(draft, code);
        }
      }
      errorRecovery = { sessionId, draft };
    }

    let userText = typeof parsedBody.data.user_text === 'string' ? parsedBody.data.user_text.trim() : '';
    const assistantImageBody = parsedBody.data.assistant_image;
    if (assistantImageBody?.base64) {
      try {
        const raw = await extractRawInvoiceTextFromImageBase64(
          assistantImageBody.base64,
          assistantImageBody.mime_type
        );
        const parts = [userText, raw.trim()].filter(Boolean);
        userText = parts.join('\n\n');
      } catch (e) {
        console.error('[invoice-wizard] assistant_image', e);
        return NextResponse.json(
          {
            error:
              e instanceof Error ? e.message : 'Could not read the image. Try another file or smaller screenshot.',
          },
          { status: 422 }
        );
      }
    }
    const pendingInvoiceLookup = normalizePendingInvoiceLookupFromBody(
      parsedBody.data.pending_invoice_lookup
    );
    const normalizedRouting = normalizeAssistantBrandMentionsForRouting(userText);
    const routingUserText = normalizedRouting.normalizedText;
    const expectedFieldBeforeTurn = deriveExpectedInvoiceField(draft);
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[assistant-invoice] expected_field=${expectedFieldBeforeTurn ?? 'none'}`);
    }
    if (
      expectedFieldBeforeTurn === 'customer' &&
      userText &&
      !action &&
      !textLooksLikeCreateInvoiceFlow(routingUserText)
    ) {
      const capturedCustomer = userText.trim();
      if (capturedCustomer) {
        draft = { ...draft, customerName: capturedCustomer };
        errorRecovery = { sessionId, draft };
        if (process.env.NODE_ENV !== 'production') {
          console.debug(`[assistant-invoice] captured_customer=${capturedCustomer}`);
        }
      }
    }

    const tzRaw =
      typeof parsedBody.data.workspace_timezone === 'string'
        ? parsedBody.data.workspace_timezone.trim()
        : '';
    const businessTzRaw = String((business as { timezone?: string | null }).timezone ?? '').trim();
    const businessTimezone = businessTzRaw && isSafeIanaTimeZone(businessTzRaw) ? businessTzRaw : null;
    const workspaceTimezone = tzRaw && isSafeIanaTimeZone(tzRaw) ? tzRaw : businessTimezone;

    let pendingCustomerContext = normalizePendingCustomerContextFromUnknown(
      parsedBody.data.pending_customer_context
    );

    const ces = parsedBody.data.customer_edit_session;
    if (
      ces &&
      (!pendingCustomerContext ||
        (pendingCustomerContext.kind !== 'inline_editing' &&
          pendingCustomerContext.kind !== 'customer_pick_options' &&
          pendingCustomerContext.kind !== 'awaiting_create_customer_name' &&
          pendingCustomerContext.kind !== 'awaiting_customer_email_update'))
    ) {
      pendingCustomerContext = {
        kind: 'inline_editing',
        customer_id: ces.customer_id,
        display_name: ces.display_name.trim() || 'Customer',
        can_edit_customer: true,
      };
    }

    const metricSessionContext = coerceMetricSessionContextFromClient(
      parsedBody.data.metric_session_context
    );
    if (process.env.NODE_ENV !== 'production') {
      const nextExpected = deriveExpectedInvoiceField(draft);
      console.debug(`[assistant-invoice] next_expected_field=${nextExpected ?? 'none'}`);
    }

    if (workspaceHasNoCustomers) {
      const bootstrap = resolveCustomerBootstrapWhenNoCustomers({
        userText,
        assistantLaunchContext: parsedBody.data.assistant_launch_context,
        requestedEmptyBootstrap,
        pendingCustomerContext,
      });
      if (bootstrap) {
        errorRecovery = { sessionId, draft };
        return NextResponse.json(
          buildWizardShellResponse({
            sessionId,
            draft,
            customerMatch,
            customerNeedsDisambiguation: false,
            assistant_lines: bootstrap.assistant_lines,
            chat_cards: null,
            pending_invoice_lookup: null,
            pending_customer_context: bootstrap.pending_customer_context,
            customer_edit_session: null,
          }) satisfies InvoiceWizardResponse
        );
      }
    }

    /**
     * First empty turn (new chat / opening): the full handler below is identical but runs an extra
     * large customer list query and merge logic. Skip that work — same response as the tail `isEmptyBootstrapTurn` path.
     * Cuts ~multi-second latency on local/dev; production benefits from less DB and CPU.
     */
    if (
      requestedEmptyBootstrap &&
      !userText &&
      !action &&
      !parsedBody.data.assistant_image &&
      !pendingInvoiceLookup &&
      !recentCreatedInvoice &&
      pendingCustomerContext == null
    ) {
      const step = resolveWizardStep(draft, {
        customerNeedsDisambiguation: false,
        assistantCustomerEditLock: false,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[invoice-wizard] empty_bootstrap_fast_path', { step, sessionId });
      }
      errorRecovery = { sessionId, draft };
      return NextResponse.json(
        buildResponse(sessionId, draft, step, null, null, null, {
          assistant_lines_only: [],
        }) satisfies InvoiceWizardResponse
      );
    }

    if (
      draft.awaitingPostCreateCustomerChoice &&
      draft.customerId &&
      userText &&
      !action
    ) {
      const t = userText.trim();
      const continueInvoice =
        /^continue with invoice( creation)?$/i.test(t) ||
        /^continue to invoice$/i.test(t) ||
        /^let'?s continue$/i.test(t) ||
        /^start the invoice$/i.test(t) ||
        /^proceed with invoice$/i.test(t) ||
        /^go ahead( with)?( the)? invoice$/i.test(t) ||
        /^yes,? continue$/i.test(t) ||
        /\bcontinue\b.*\binvoice\b/i.test(t.toLowerCase());
      const editCustomer =
        /^edit (this )?customer\b/i.test(t) ||
        /^edit customer$/i.test(t) ||
        /^i want to edit/i.test(t) ||
        /^update (this )?customer\b/i.test(t);

      if (continueInvoice && !editCustomer) {
        const nextDraft: InvoiceWizardDraft = { ...draft, awaitingPostCreateCustomerChoice: false };
        errorRecovery = { sessionId, draft: nextDraft };
        const step = resolveWizardStep(nextDraft, { customerNeedsDisambiguation: false });
        return NextResponse.json(
          buildResponse(sessionId, nextDraft, step, customerMatch, null, null, {
            assistant_lines_only: [WIZARD_COLLECT_ITEMS_LINE],
          }) satisfies InvoiceWizardResponse
        );
      }
      if (editCustomer) {
        const editGate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_customers');
        if (!editGate.ok) return editGate.response;
        const cid = draft.customerId;
        const nextDraft: InvoiceWizardDraft = { ...draft, awaitingPostCreateCustomerChoice: false };
        errorRecovery = { sessionId, draft: nextDraft };
        return NextResponse.json(
          await respondCustomerInlineEditStart(supabase, {
            sessionId,
            businessId,
            draft: nextDraft,
            customerMatch,
            customerNeedsDisambiguation: false,
            customerId: cid,
          })
        );
      }
      errorRecovery = { sessionId, draft };
      return NextResponse.json(
        buildResponse(
          sessionId,
          draft,
          resolveWizardStep(draft, { customerNeedsDisambiguation: false }),
          customerMatch,
          null,
          null,
          {
            assistant_lines_only: [
              'Say **Continue to invoice** when you’re ready, or **Edit customer** if you want to change anything first.',
            ],
            quick_replies: [
              { label: 'Edit customer', message: 'Edit this customer' },
              { label: 'Continue to invoice', message: 'Continue with invoice creation' },
            ],
          }
        ) satisfies InvoiceWizardResponse
      );
    }

    if (
      userText &&
      pendingCustomerContext?.kind === 'inline_editing' &&
      shouldExitCustomerInlineEditForStrongIntent(userText, metricSessionContext)
    ) {
      pendingCustomerContext = null;
    }

    const assistantCustomerEditLock =
      pendingCustomerContext?.kind === 'inline_editing' ||
      pendingCustomerContext?.kind === 'customer_pick_options';

    if (action?.type === 'start_customer_inline_edit') {
      const gateEdit = await assertBusinessPermission(supabase, businessId, user.id, 'manage_customers');
      if (!gateEdit.ok) return gateEdit.response;
      return NextResponse.json(
        await respondCustomerInlineEditStart(supabase, {
          sessionId,
          businessId,
          draft,
          customerMatch,
          customerNeedsDisambiguation,
          customerId: action.customer_id,
        }) satisfies InvoiceWizardResponse
      );
    }

    if (userText && pendingCustomerContext?.kind === 'awaiting_create_customer_name') {
      const createGate = await assertBusinessPermission(supabase, businessId, user.id, 'create_customer');
      const manageCustomersGate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_customers');
      if (!createGate.ok && !manageCustomersGate.ok) return createGate.response;

      const companyName = userText.trim();
      if (!companyName) {
        const keepResume = pendingCustomerContext.resume_invoice_after === true;
        return NextResponse.json(
          buildWizardShellResponse({
            sessionId,
            draft,
            customerMatch,
            customerNeedsDisambiguation: false,
            assistant_lines: ['What’s the company or client name?'],
            chat_cards: null,
            pending_invoice_lookup: null,
            pending_customer_context: keepResume
              ? { kind: 'awaiting_create_customer_name', resume_invoice_after: true }
              : { kind: 'awaiting_create_customer_name' },
          }) satisfies InvoiceWizardResponse
        );
      }

      const resumeInvoice = pendingCustomerContext.resume_invoice_after === true;
      const createResp = await handleCustomerCreateWithCompanyNameReply(
        {
          supabase,
          user,
          businessId,
          sessionId,
          draft,
          userText,
          pendingInvoiceLookup,
          customerMatch,
          customerNeedsDisambiguation,
          role,
          reportingCurrency,
          workspaceTimezone,
          metricSessionContext,
          resumeInvoiceAfterCustomerCreate: resumeInvoice,
        },
        companyName
      );
      return NextResponse.json(createResp satisfies InvoiceWizardResponse);
    }

    if (userText && pendingCustomerContext?.kind === 'awaiting_customer_email_update') {
      const customerName = userText.trim();
      if (!customerName) {
        return NextResponse.json(
          buildWizardShellResponse({
            sessionId,
            draft,
            customerMatch,
            customerNeedsDisambiguation: false,
            assistant_lines: ['Which customer would you like to update?'],
            chat_cards: null,
            pending_invoice_lookup: null,
            pending_customer_context: pendingCustomerContext,
          }) satisfies InvoiceWizardResponse
        );
      }

      const resumeResp = await handleCustomerEmailUpdateWithCustomerNameReply(
        {
          supabase,
          user,
          businessId,
          sessionId,
          draft,
          userText,
          pendingInvoiceLookup,
          customerMatch,
          customerNeedsDisambiguation,
          role,
          reportingCurrency,
          workspaceTimezone,
          metricSessionContext,
        },
        customerName,
        pendingCustomerContext.pending_new_email ?? null
      );
      return NextResponse.json(resumeResp satisfies InvoiceWizardResponse);
    }

    if (userText && pendingCustomerContext?.kind === 'customer_pick_options') {
      const picked = resolveCustomerPickSelection(userText, pendingCustomerContext.options);
      if (!picked) {
        return NextResponse.json(
          buildWizardShellResponse({
            sessionId,
            draft,
            customerMatch,
            customerNeedsDisambiguation: false,
            assistant_lines: [
              'I didn’t match that to one of the listed customers. Reply with a number from the list or the customer name.',
            ],
            chat_cards: null,
            pending_invoice_lookup: null,
            pending_customer_context: pendingCustomerContext,
          }) satisfies InvoiceWizardResponse
        );
      }
      const pickedRow = await fetchCustomerInlineRow(supabase, businessId, picked);
      if (!pickedRow) {
        return NextResponse.json(
          buildWizardShellResponse({
            sessionId,
            draft,
            customerMatch,
            customerNeedsDisambiguation: false,
            assistant_lines: [CUSTOMER_INLINE_NOT_FOUND],
            chat_cards: null,
            pending_invoice_lookup: null,
            pending_customer_context: null,
          }) satisfies InvoiceWizardResponse
        );
      }
      const pickedDisplay = displayNameFromRow(pickedRow);
      if (pendingCustomerContext.can_edit_customer) {
        const gatePick = await assertBusinessPermission(supabase, businessId, user.id, 'manage_customers');
        if (!gatePick.ok) return gatePick.response;
        const pickLines = [
          ...formatCustomerConversationalSnapshot(pickedRow),
          '',
          CUSTOMER_INLINE_ASK_EDIT,
        ];
        return NextResponse.json(
          buildWizardShellResponse({
            sessionId,
            draft,
            customerMatch,
            customerNeedsDisambiguation: false,
            assistant_lines: pickLines,
            chat_cards: null,
            pending_invoice_lookup: null,
            pending_customer_context: {
              kind: 'inline_editing',
              customer_id: pickedRow.id,
              display_name: pickedDisplay,
              can_edit_customer: true,
            },
          }) satisfies InvoiceWizardResponse
        );
      }
      const viewOnlyLines = [
        ...formatCustomerConversationalSnapshot(pickedRow),
        '',
        'You don’t have permission to edit customers here. Use Customers in the sidebar for the full directory.',
      ];
      return NextResponse.json(
        buildWizardShellResponse({
          sessionId,
          draft,
          customerMatch,
          customerNeedsDisambiguation: false,
          assistant_lines: viewOnlyLines,
          chat_cards: null,
          pending_invoice_lookup: null,
          pending_customer_context: null,
        }) satisfies InvoiceWizardResponse
      );
    }

    if (userText && pendingCustomerContext?.kind === 'inline_editing' && isAssistantAffirmation(userText)) {
      return NextResponse.json(
        buildWizardShellResponse({
          sessionId,
          draft,
          customerMatch,
          customerNeedsDisambiguation: false,
          assistant_lines: [CUSTOMER_INLINE_ASK_WHAT_TO_UPDATE],
          chat_cards: null,
          pending_invoice_lookup: null,
          pending_customer_context: pendingCustomerContext,
        }) satisfies InvoiceWizardResponse
      );
    }

    if (userText && pendingCustomerContext?.kind === 'inline_editing') {
      return NextResponse.json(
        await respondCustomerInlineEditUserText(supabase, {
          userId: user.id,
          businessId,
          sessionId,
          draft,
          customerMatch,
          customerNeedsDisambiguation: false,
          pending: pendingCustomerContext,
          userText,
        }) satisfies InvoiceWizardResponse
      );
    }

    if (userText && pendingCustomerContext?.kind === 'single_confirm' && isAssistantConfirmationDecline(userText)) {
      return NextResponse.json(
        buildWizardShellResponse({
          sessionId,
          draft,
          customerMatch,
          customerNeedsDisambiguation: false,
          assistant_lines: [CUSTOMER_INLINE_CLOSE_NO_CHANGES],
          chat_cards: null,
          pending_invoice_lookup: null,
          pending_customer_context: null,
          customer_edit_session: null,
        }) satisfies InvoiceWizardResponse
      );
    }

    if (userText && pendingCustomerContext?.kind === 'single_confirm' && isAssistantAffirmation(userText)) {
      if (pendingCustomerContext.default_action === 'edit_customer' && pendingCustomerContext.can_edit_customer) {
        const gateEdit = await assertBusinessPermission(supabase, businessId, user.id, 'manage_customers');
        if (!gateEdit.ok) return gateEdit.response;
        return NextResponse.json(
          await respondCustomerInlineEditStart(supabase, {
            sessionId,
            businessId,
            draft,
            customerMatch,
            customerNeedsDisambiguation,
            customerId: pendingCustomerContext.customer_id,
          }) satisfies InvoiceWizardResponse
        );
      }
      const href = `/dashboard/customers/${pendingCustomerContext.customer_id}`;
      return NextResponse.json(
        buildWizardShellResponse({
          sessionId,
          draft,
          customerMatch,
          customerNeedsDisambiguation: false,
          assistant_lines: [ASSISTANT_CONFIRM_DONE],
          chat_cards: null,
          pending_invoice_lookup: null,
          pending_customer_context: null,
          client_navigate: { href },
        }) satisfies InvoiceWizardResponse
      );
    }

    if (routingUserText && shouldResetDraftForNewInvoiceIntent(routingUserText)) {
      draft = emptyInvoiceWizardDraft();
      customerMatch = null;
      customerNeedsDisambiguation = false;
      errorRecovery = { sessionId, draft };
    }

    if (routingUserText) {
      const routed = await routeBusinessAssistantUserTurn({
        supabase,
        user,
        businessId,
        sessionId,
        draft,
        userText: routingUserText,
        pendingInvoiceLookup,
        customerMatch,
        customerNeedsDisambiguation: false,
        role,
        reportingCurrency,
        workspaceTimezone,
        metricSessionContext,
        activeWorkflow: coerceActiveWorkflowFromClient(parsedBody.data.active_workflow),
        recentCreatedInvoice,
      });
      if (routed) {
        errorRecovery = { sessionId, draft };
        return NextResponse.json(routed satisfies InvoiceWizardResponse);
      }
    }

    let extractedOk = false;
    let lastWizardExtract: WizardAiExtract | null = null;
    let dueDatePromptOverride: string | null = null;

    /** Due-date slot: parse first and skip generic AI extract so month/day text is not merged as line items. */
    let skipWizardAiExtractForDueDateSlot = false;
    if (userText) {
      const stepBeforeAiExtract = resolveWizardStep(draft, {
        customerNeedsDisambiguation: false,
        assistantCustomerEditLock,
      });
      if (
        stepBeforeAiExtract === 'COLLECT_DUE_DATE' &&
        !String(draft.dueDate ?? '').trim()
      ) {
        const parsedFromRawText = normalizeWizardDueDateToIso(userText, new Date());
        if (parsedFromRawText) {
          draft = { ...draft, dueDate: parsedFromRawText };
          skipWizardAiExtractForDueDateSlot = true;
        } else {
          const t = userText.trim();
          if (/^\d{1,2}$/.test(t)) {
            dueDatePromptOverride =
              'Which month did you mean? For example say "8 May" or "May 8".';
          } else {
            dueDatePromptOverride =
              "I couldn't read that due date. Try formats like Apr 20, April 20th, or 20 April 2026.";
          }
          skipWizardAiExtractForDueDateSlot = true;
        }
        errorRecovery = { sessionId, draft };
      }
    }

    if (userText && !skipWizardAiExtractForDueDateSlot) {
      try {
        const extracted = await extractInvoiceWizardUserText(userText, { draft });
        if (extracted.ok) {
          extractedOk = true;
          lastWizardExtract = extracted.extract;
          if (wizardExtractHasInvoicePayload(extracted.extract)) {
            extractHadInvoicePayload = true;
          }
          draft = mergeWizardAiExtractIntoDraft(draft, extracted.extract, {
            preserveLockedCustomer: Boolean(draft.customerId),
            ignoreCustomerFields: assistantCustomerEditLock,
          });
          draft = ensureNewCustomerOnboardSubstep(draft);
          draft = fastForwardNewCustomerOnboardingAfterExtract(draft);

          errorRecovery = { sessionId, draft };
        }
      } catch (parseErr) {
        console.error('[invoice-wizard] extractInvoiceWizardUserText failed', parseErr);
      }
    }

    if (userText && !skipWizardAiExtractForDueDateSlot) {
      draft = ensureNewCustomerOnboardSubstep(draft);
      const stepForCountry = resolveWizardStep(draft, {
        customerNeedsDisambiguation: false,
        assistantCustomerEditLock,
      });
      if (
        draft.isNewCustomer &&
        !draft.customerId &&
        !draft.newCustomerOptionalStepDone &&
        draft.customerEmail.trim() &&
        stepForCountry === 'COLLECT_NEW_CUSTOMER_COUNTRY' &&
        !userTextSkipsCustomerOptionalStep(userText)
      ) {
        const cr = applyWizardCountryUserMessage({ draft, userText });
        draft = cr.draft;
        errorRecovery = { sessionId, draft };
        if (cr.kind === 'disambiguate') {
          return NextResponse.json(
            buildResponse(sessionId, draft, 'COLLECT_NEW_CUSTOMER_COUNTRY', customerMatch, null, null, {
              assistant_lines_only: cr.lines,
              quick_replies: cr.quickReplies,
              wizard_client_ui: { country_modal: false },
            }) satisfies InvoiceWizardResponse
          );
        }
        if (cr.kind === 'need_modal') {
          return NextResponse.json(
            buildResponse(sessionId, draft, 'COLLECT_NEW_CUSTOMER_COUNTRY', customerMatch, null, null, {
              assistant_lines_only: cr.lines,
              wizard_client_ui: { country_modal: true },
            }) satisfies InvoiceWizardResponse
          );
        }
        if (cr.kind === 'resolved') {
          countryWizardAck = cr.ackLines;
        }
      }
    }

    if (userText) {
      draft = ensureNewCustomerOnboardSubstep(draft);
      const stepNow = resolveWizardStep(draft, {
        customerNeedsDisambiguation: false,
        assistantCustomerEditLock,
      });
      const emailJustFilled =
        draft.isNewCustomer &&
        Boolean(draft.customerEmail.trim()) &&
        !hadCustomerEmailBeforeTurn;
      const onlyEmailOnPhoneStep =
        emailJustFilled &&
        !userTextSkipsCustomerOptionalStep(userText) &&
        stepNow === 'COLLECT_NEW_CUSTOMER_PHONE' &&
        !draft.customerPhone?.trim();

      if (
        draft.isNewCustomer &&
        !draft.customerId &&
        !draft.newCustomerOptionalStepDone &&
        draft.customerEmail.trim() &&
        NEW_CUSTOMER_ONBOARDING_STEPS.includes(stepNow)
      ) {
        if (userTextSkipsCustomerOptionalStep(userText)) {
          draft = applyNewCustomerOnboardingSkip(draft, stepNow);
        } else if (!onlyEmailOnPhoneStep) {
          if (!extractedOk) {
            draft = applyNewCustomerOnboardingRawInput(draft, stepNow, userText, false);
          } else {
            if (stepNow === 'COLLECT_NEW_CUSTOMER_PHONE' && !draft.customerPhone?.trim()) {
              draft = applyNewCustomerOnboardingRawInput(draft, stepNow, userText, false);
            } else if (stepNow === 'COLLECT_NEW_CUSTOMER_CONTACT' && !draft.customerContactName?.trim()) {
              draft = applyNewCustomerOnboardingRawInput(draft, stepNow, userText, false);
            } else if (stepNow === 'COLLECT_NEW_CUSTOMER_ADDRESS') {
              const addrPh = resolveAddressPhase(draft);
              const needsAddressFollowUp =
                !extractedOk || addrPh.kind === 'slot' || addrPh.kind === 'need_country';
              if (needsAddressFollowUp) {
                draft = applyNewCustomerOnboardingRawInput(draft, stepNow, userText, false);
              }
            }
          }
        }
        draft = fastForwardNewCustomerOnboardingAfterExtract(draft);
        errorRecovery = { sessionId, draft };
      }
    }

    if (draft.dueDate?.trim()) {
      const dueIso = String(draft.dueDate).trim();
      const dueValidation = validateAssistantDueDateIso(dueIso, new Date());
      if (!dueValidation.ok) {
        const currentLabel = formatDueDateForAssistantSummary(dueIso);
        const suggestedLabel = formatDueDateForAssistantSummary(dueValidation.suggestedIso);
        dueDatePromptOverride = `${currentLabel} is in the past. Should I set it to ${suggestedLabel}?`;
        draft = { ...draft, dueDate: null };
      }
    }

    if (action?.type === 'select_customer') {
      draft = {
        ...draft,
        customerId: action.customer_id,
        isNewCustomer: false,
      };
      errorRecovery = { sessionId, draft };
    }

    if (action?.type === 'commit_new_customer') {
      if (!draft.customerEmail.trim()) {
        return NextResponse.json(
          buildResponse(
            sessionId,
            draft,
            'CREATE_CUSTOMER',
            null,
            null,
            wizardSingleMissingPrompt('customer_email')
          ) satisfies InvoiceWizardResponse,
          { status: 422 }
        );
      }
      draft = { ...draft, newCustomerOptionalStepDone: true };
      errorRecovery = { sessionId, draft };
    }

    if (
      draft.isNewCustomer &&
      draft.newCustomerOptionalStepDone &&
      draft.customerEmail.trim() &&
      !draft.customerId
    ) {
      const createGate = await assertBusinessPermission(supabase, businessId, user.id, 'create_customer');
      if (!createGate.ok) {
        const manageGate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_customers');
        if (!manageGate.ok) return manageGate.response;
      }
      const ins = await createCustomerFromWizardDraft(
        supabase,
        businessId,
        user.id,
        reportingCurrency,
        draft
      );
      if (!ins.ok) {
        return NextResponse.json(
          buildResponse(
            sessionId,
            draft,
            'CREATE_CUSTOMER',
            null,
            null,
            ins.message
          ) satisfies InvoiceWizardResponse,
          { status: 422 }
        );
      }
      insertedCustomerSnapshot = ins.customer;
      draft = {
        ...draft,
        customerId: ins.customerId,
        isNewCustomer: false,
        resumeInvoiceAfterCustomerCreate: false,
        awaitingPostCreateCustomerChoice: draft.items.length === 0,
      };
      insertedCustomerThisTurn = true;
      errorRecovery = { sessionId, draft };
    }

    const { data: customerRows } = await supabase
      .from('customers')
      .select(
        'id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, country_code, preferred_currency_code, created_at'
      )
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(60);

    if (
      !draft.customerId &&
      draft.customerName.trim() &&
      !draft.isNewCustomer
    ) {
      const rawName = draft.customerName.trim();
      const customerName = isInvalidGenericCustomerName(rawName) ? '' : rawName;
      const matchResult = resolveCustomerMatchFromAiInput(
        customerName,
        userText || draft.customerName,
        (customerRows ?? []) as Parameters<typeof resolveCustomerMatchFromAiInput>[2]
      );

      if (matchResult.confidence === 'high' && matchResult.match) {
        exactAutoLinkedThisTurn = true;
        const m = matchResult.match;
        draft = {
          ...draft,
          customerId: String(m.id),
          isNewCustomer: false,
          customerName: String(m.company || m.name || customerName).trim(),
          customerEmail: String(m.email || draft.customerEmail || '').trim(),
        };
      } else {
        const noDbHits =
          matchResult.confidence === 'low' &&
          matchResult.matches.length === 0 &&
          Boolean(customerName);

        if (noDbHits) {
          // Keep freeform customer name in draft and continue invoice collection.
          // We only require customer details at create time, not immediate customer-link resolution.
          draft = { ...draft, isNewCustomer: false, customerId: null };
          customerNeedsDisambiguation = false;
          customerMatch = null;
        } else {
          customerNeedsDisambiguation =
            matchResult.confidence === 'medium' ||
            (matchResult.confidence === 'low' && matchResult.matches.length > 0);

          const suggestionsRaw =
            matchResult.matches.length > 0
              ? matchResult.matches
              : ((customerRows ?? []) as {
                  id: string;
                  company?: string;
                  name?: string;
                  email?: string;
                  preferred_currency_code?: string;
                }[]).slice(0, 8);
          const suggestionsDeduped = dedupeMatchableCustomersById(suggestionsRaw).slice(0, 8);
          const mapped = suggestionsDeduped.map((c) => ({
            id: String(c.id),
            label: String(c.company || c.name || '').trim(),
            email: String(c.email || '').trim() || null,
            currency: c.preferred_currency_code
              ? String(c.preferred_currency_code).trim().toUpperCase()
              : null,
          }));
          const suggestions = disambiguateCustomerSuggestionLabels(mapped);

          let prompt: string;
          if (!customerName) {
            prompt = CUSTOMER_MATCH_UNSPECIFIED;
          } else if (matchResult.disambiguation) {
            prompt = invoiceWizardCustomerPickPrompt(customerName, matchResult.disambiguation);
          } else if (matchResult.matches.length > 0) {
            prompt = invoiceWizardCustomerPickPrompt(customerName, 'fuzzy_partial');
          } else {
            prompt = CUSTOMER_MATCH_PICK_OR_NEW;
          }

          customerMatch = {
            confidence: customerName ? matchResult.confidence : 'low',
            prompt,
            suggestions,
          };
        }
      }
    }

    if (
      extractedOk &&
      lastWizardExtract &&
      wizardExtractHasInvoicePayload(lastWizardExtract) &&
      draft.customerId &&
      !draftAtRequestStart.customerId
    ) {
      draft = mergeWizardAiExtractIntoDraft(draft, lastWizardExtract, {
        preserveLockedCustomer: true,
        ignoreCustomerFields: assistantCustomerEditLock,
      });
      draft = ensureNewCustomerOnboardSubstep(draft);
      draft = fastForwardNewCustomerOnboardingAfterExtract(draft);
    }

    errorRecovery = { sessionId, draft };

    const stepBeforeCreate = resolveWizardStep(draft, {
      customerNeedsDisambiguation,
      assistantCustomerEditLock,
    });

    if (action?.type === 'confirm_create') {
      errorRecovery = { sessionId, draft };
      return await executeConfirmCreateInvoice({
        supabase,
        sessionId,
        businessId,
        reportingCurrency,
        draft,
        customerMatch,
        customerNeedsDisambiguation,
        idempotencyKey: action.idempotency_key,
        userId: user.id,
      });
    }

    const readyAfter = isWizardDraftReadyForInvoiceCreate(draft, customerNeedsDisambiguation);
    const readyBefore = isWizardDraftReadyForInvoiceCreate(draftAtRequestStart, false);
    const shouldAutoCreateInvoice = shouldAutoCreateInvoiceFromWizardTurn({
      userText,
      action,
      readyAfter,
      readyBefore,
      extractHadInvoicePayload,
    });

    if (shouldAutoCreateInvoice) {
      errorRecovery = { sessionId, draft };
      return await executeConfirmCreateInvoice({
        supabase,
        sessionId,
        businessId,
        reportingCurrency,
        draft,
        customerMatch,
        customerNeedsDisambiguation,
        idempotencyKey: autoCreateIdempotencyKey(sessionId, userText),
        userId: user.id,
      });
    }

    const isEmptyBootstrapTurn = requestedEmptyBootstrap && !userText && !action;

    const persistAssistantCustomerContext =
      assistantCustomerEditLock && pendingCustomerContext != null
        ? {
            pending_customer_context: pendingCustomerContext,
            customer_edit_session:
              pendingCustomerContext.kind === 'inline_editing'
                ? {
                    customer_id: pendingCustomerContext.customer_id,
                    display_name: pendingCustomerContext.display_name,
                  }
                : null,
          }
        : {};

    const customerResolutionState = deriveCustomerResolutionState(draft, {
      customerNeedsDisambiguation,
      exactAutoLinkedThisTurn,
    });

    /** Full detail card — only when create-customer was the focus (no invoice lines yet). */
    const customerCreatedDetailSnapshot =
      insertedCustomerThisTurn && draft.items.length === 0;
    const postCreateCustomerSummaryTurn =
      customerCreatedDetailSnapshot && Boolean(draft.customerId && insertedCustomerSnapshot);
    const successLinesAfterCustomerCreate = customerCreatedDetailSnapshot ? ([] as string[]) : null;

    /** Mid-invoice: confirm + nudge without replacing the next wizard prompt. */
    const customerCreatedInvoicePrepend =
      insertedCustomerThisTurn && draft.items.length > 0
        ? [ASSISTANT_CUSTOMER_CREATED_CONFIRM, '', "Now let's continue with your invoice."]
        : null;

    const followUpPromptOverride =
      dueDatePromptOverride ??
      (customerNeedsDisambiguation && customerMatch?.prompt ? customerMatch.prompt : null);

    const unifiedTurnLines =
      userText &&
      (extractedOk || skipWizardAiExtractForDueDateSlot) &&
      !countryWizardAck?.length &&
      !customerCreatedDetailSnapshot &&
      !isEmptyBootstrapTurn
        ? buildUnifiedInvoiceTurnReplyLines(
            draftAtRequestStart,
            draft,
            stepBeforeCreate,
            computeMissingFields(draft),
            { followUpPromptOverride }
          )
        : null;

    const turnEchoLines =
      !unifiedTurnLines &&
      userText &&
      extractedOk &&
      !countryWizardAck?.length &&
      !skipWizardAiExtractForDueDateSlot &&
      !customerCreatedDetailSnapshot &&
      !isEmptyBootstrapTurn
        ? wizardConfirmEchoForTurn(draftAtRequestStart, draft)
        : [];

    const prependAssistantLinesMerged = (() => {
      const parts: string[] = [];
      if (countryWizardAck?.length) {
        parts.push(...countryWizardAck);
      }
      if (customerCreatedInvoicePrepend?.length) {
        if (parts.length) parts.push('');
        parts.push(...customerCreatedInvoicePrepend);
      }
      if (turnEchoLines.length) {
        if (parts.length) parts.push('');
        parts.push(...turnEchoLines);
      }
      return parts.length ? parts : null;
    })();

    let postCreateCustomerFollowUpExtras: {
      pending_customer_context?: InvoiceWizardResponse['pending_customer_context'];
      customer_edit_session?: InvoiceWizardResponse['customer_edit_session'];
    } = {};
    if (customerCreatedDetailSnapshot && draft.customerId && insertedCustomerSnapshot) {
      const followUpEditGate = await assertBusinessPermission(supabase, businessId, user.id, 'manage_customers');
      if (followUpEditGate.ok) {
        const cid = draft.customerId;
        const dn = displayNameFromRow(insertedCustomerSnapshot);
        postCreateCustomerFollowUpExtras = {
          pending_customer_context: {
            kind: 'inline_editing',
            customer_id: cid,
            display_name: dn,
            can_edit_customer: true,
          },
          customer_edit_session: { customer_id: cid, display_name: dn },
        };
      }
    }

    return NextResponse.json(
      buildResponse(
        sessionId,
        draft,
        stepBeforeCreate,
        customerMatch,
        null,
        null,
        {
          ...(isEmptyBootstrapTurn ? { assistant_lines_only: [] as string[] } : {}),
          ...(successLinesAfterCustomerCreate
            ? { assistant_lines_only: successLinesAfterCustomerCreate }
            : {}),
          ...(unifiedTurnLines ? { assistant_lines_only: unifiedTurnLines } : {}),
          ...(prependAssistantLinesMerged
            ? { prepend_assistant_lines: prependAssistantLinesMerged }
            : {}),
          ...(postCreateCustomerSummaryTurn && insertedCustomerSnapshot
            ? {
                chat_cards: [customerCreatedSummaryFromCustomerRow(insertedCustomerSnapshot)],
                assistant_post_card_lines: [
                  'Anything else to update, or should I continue with the invoice?',
                ],
                quick_replies: [
                  { label: 'Edit customer', message: 'Edit this customer' },
                  { label: 'Continue to invoice', message: 'Continue with invoice creation' },
                ],
              }
            : {}),
          ...persistAssistantCustomerContext,
          ...postCreateCustomerFollowUpExtras,
          customer_resolution_state: customerResolutionState,
        }
      ) satisfies InvoiceWizardResponse
    );
  } catch (e) {
    console.error('[invoice-wizard] unhandled error', e);
    if (errorRecovery) {
      const { sessionId: sid, draft: d } = errorRecovery;
      const step = resolveWizardStep(d, { customerNeedsDisambiguation: false });
      const friendly =
        e instanceof ZodError ? mapValidationErrorToPrompt(e, d) : ASSISTANT_GENERIC_RETRY;
      return NextResponse.json(
        buildResponse(sid, d, step, null, null, friendly) satisfies InvoiceWizardResponse,
        { status: 422 }
      );
    }
    return NextResponse.json({ error: ASSISTANT_GENERIC_RETRY }, { status: 422 });
  }
}
