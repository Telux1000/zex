import {
  buildCombinedInvoiceMissingPrompt,
  wizardCreateCustomerEmailLines,
  wizardFallbackLines,
  wizardNewCustomerAddressLines,
  wizardNewCustomerPhoneLines,
  wizardOptionalAddLines,
  WIZARD_CHECK_CUSTOMER_LINE,
  WIZARD_COLLECT_DUE_DATE_LINE,
  WIZARD_COLLECT_ITEMS_LINE,
  WIZARD_COLLECT_PRICING_LINE,
  WIZARD_COLLECT_QUANTITY_LINE,
  WIZARD_CONFIRM_LINE,
  WIZARD_CREATING_LINE,
  WIZARD_GET_CUSTOMER_LINE,
  ASSISTANT_SUCCESS_CREATED,
} from '@/lib/business-assistant/assistant-tone';
import type { ParsedInvoice } from '@/lib/validations/invoice';
import { parsedInvoiceSchema } from '@/lib/validations/invoice';
import { conversationalPromptForAddressSlot, resolveAddressPhase } from './address-intelligence';
import type {
  CustomerResolutionState,
  InvoiceWizardDraft,
  InvoiceWizardStep,
  WizardMissingField,
} from './types';

function lineNeedsQuantity(i: InvoiceWizardDraft['items'][number]): boolean {
  const q = i.quantity;
  return !Number.isFinite(q) || q <= 0;
}

/** Draft is ready to persist: linked customer, no missing invoice fields, at CONFIRM step. */
export function isWizardDraftReadyForInvoiceCreate(
  draft: InvoiceWizardDraft,
  customerNeedsDisambiguation: boolean
): boolean {
  if (customerNeedsDisambiguation) return false;
  if (draft.awaitingPostCreateCustomerChoice) return false;
  if (!draft.customerId) return false;
  if (computeMissingFields(draft).length > 0) return false;
  return resolveWizardStep(draft, { customerNeedsDisambiguation }) === 'CONFIRM';
}

export function computeMissingFields(draft: InvoiceWizardDraft): WizardMissingField[] {
  const m: WizardMissingField[] = [];
  if (draft.customerId && draft.awaitingPostCreateCustomerChoice) {
    return [];
  }
  if (!draft.customerId) {
    const nameMissing = !draft.customerName.trim();
    if (nameMissing && !(draft.isNewCustomer && draft.customerEmail.trim())) {
      m.push('customer');
    } else if (draft.isNewCustomer && !draft.customerEmail.trim()) {
      m.push('customer_email');
    } else if (!nameMissing && !draft.isNewCustomer) {
      /** Linked customer required before line items — same gate as CHECK_CUSTOMER in `resolveWizardStep`. */
      m.push('customer_pick');
    }
    /** Never leave “no missing fields” while `customerId` is unset (avoids item prompts before resolution). */
    if (m.length === 0) {
      m.push('customer');
    }
    return m;
  }
  if (draft.items.length === 0) m.push('items');
  else if (draft.items.some(lineNeedsQuantity)) m.push('quantity');
  else if (draft.items.some((i) => i.unit_price <= 0)) m.push('pricing');
  if (!draft.dueDate?.trim()) m.push('due_date');
  return m;
}

/** First missing field in guided completeness order (for logging / mapping). */
export function getNextMissingInvoiceField(draft: InvoiceWizardDraft): WizardMissingField | null {
  const missing = computeMissingFields(draft);
  return missing[0] ?? null;
}

/**
 * Single source of truth for invoice customer identity phase (API `customer_resolution_state`).
 */
export function deriveCustomerResolutionState(
  draft: InvoiceWizardDraft,
  opts: {
    customerNeedsDisambiguation: boolean;
    /** True when this turn auto-linked after deterministic exact string match (normalized). */
    exactAutoLinkedThisTurn: boolean;
  }
): CustomerResolutionState {
  if (draft.customerId) {
    return opts.exactAutoLinkedThisTurn ? 'customer_exact_match' : 'customer_resolved';
  }
  if (opts.customerNeedsDisambiguation) {
    return 'customer_needs_confirmation';
  }
  if (draft.isNewCustomer) {
    return 'customer_new_required';
  }
  if (!draft.customerName.trim()) {
    return 'customer_unresolved';
  }
  return 'customer_unresolved';
}

/**
 * Deterministic next step from draft + customer resolution state (system-owned).
 */
export function resolveWizardStep(
  draft: InvoiceWizardDraft,
  opts: {
    /**
     * Passed through from the API for consistency with `customerNeedsDisambiguation` / picker state.
     * Step resolution for linking an existing customer no longer branches on this alone.
     */
    customerNeedsDisambiguation: boolean;
    /**
     * Legacy: previously skipped `CHECK_CUSTOMER` when set (harmful with `customer_pick_options`).
     * Ignored for step selection — retained so call sites stay unchanged.
     */
    assistantCustomerEditLock?: boolean;
  }
): InvoiceWizardStep {
  void opts.customerNeedsDisambiguation;
  void opts.assistantCustomerEditLock;
  if (!draft.customerId) {
    // New-customer onboarding must win over GET_CUSTOMER: follow-ups (e.g. bare email) may not
    // resend display name from the client; isNewCustomer + email still means "stay in create flow".
    if (draft.isNewCustomer) {
      if (!draft.customerEmail.trim()) return 'CREATE_CUSTOMER';
      if (!draft.newCustomerOptionalStepDone) {
        const sub = draft.newCustomerOnboardSubstep ?? 'phone';
        if (sub === 'phone') return 'COLLECT_NEW_CUSTOMER_PHONE';
        if (sub === 'contact') return 'COLLECT_NEW_CUSTOMER_CONTACT';
        if (sub === 'address') return 'COLLECT_NEW_CUSTOMER_ADDRESS';
        if (sub === 'country') return 'COLLECT_NEW_CUSTOMER_COUNTRY';
        return 'COLLECT_NEW_CUSTOMER_PHONE';
      }
    }
    if (!draft.customerName.trim()) return 'GET_CUSTOMER';
    /**
     * Existing-customer invoice flow: stay on `CHECK_CUSTOMER` until `customerId` is set.
     * Do not use `assistantCustomerEditLock` here — when the client holds `customer_pick_options`
     * (or similar), the lock must not skip this step or we fall through to `COLLECT_ITEMS` while
     * the UI is still waiting for a customer selection.
     */
    if (!draft.isNewCustomer) {
      return 'CHECK_CUSTOMER';
    }
  }
  if (draft.customerId && draft.awaitingPostCreateCustomerChoice) {
    return 'AWAIT_POST_CREATE_CUSTOMER';
  }
  if (draft.items.length === 0) return 'COLLECT_ITEMS';
  if (draft.items.some(lineNeedsQuantity)) return 'COLLECT_QUANTITY';
  if (draft.items.some((i) => i.unit_price <= 0)) return 'COLLECT_PRICING';
  if (!draft.dueDate?.trim()) return 'COLLECT_DUE_DATE';
  return 'CONFIRM';
}

/** Natural-language skip for optional customer phone/address step */
export function userTextSkipsCustomerOptionalStep(text: string): boolean {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return false;
  return /^(skip|no|no thanks|not now|later|pass|none|nope)\b/.test(t) || t === 'no.';
}

export function combinedInvoiceFieldsPrompt(missing: WizardMissingField[]): string | null {
  return buildCombinedInvoiceMissingPrompt(missing);
}

export function assistantLinesForStep(
  step: InvoiceWizardStep,
  missing: WizardMissingField[],
  draft?: InvoiceWizardDraft
): string[] {
  switch (step) {
    case 'GET_CUSTOMER':
      return [WIZARD_GET_CUSTOMER_LINE];
    case 'CHECK_CUSTOMER':
      return [WIZARD_CHECK_CUSTOMER_LINE];
    case 'CREATE_CUSTOMER':
      return wizardCreateCustomerEmailLines(draft?.customerName);
    case 'COLLECT_NEW_CUSTOMER_PHONE':
      return wizardNewCustomerPhoneLines();
    case 'COLLECT_NEW_CUSTOMER_CONTACT':
      return wizardOptionalAddLines('a contact person');
    case 'COLLECT_NEW_CUSTOMER_ADDRESS': {
      if (!draft) return wizardNewCustomerAddressLines();
      const ph = resolveAddressPhase(draft);
      if (ph.kind === 'slot' && ph.slot) {
        return [conversationalPromptForAddressSlot(ph.slot, draft)];
      }
      if (ph.kind === 'need_country') {
        return ['Got it.', '', 'What country is this customer in?'];
      }
      return wizardNewCustomerAddressLines();
    }
    case 'COLLECT_NEW_CUSTOMER_COUNTRY': {
      const city = draft?.customerCity?.trim();
      const skippedRegion = draft?.newCustomerAddressSkips?.region === true;
      const region = draft?.customerState?.trim();
      if (city && (region || skippedRegion)) {
        return ['Got it.', '', 'What country is this customer in?'];
      }
      if (city) {
        return ['Got it.', '', 'What country is this customer in?'];
      }
      return ['What country is this customer in?'];
    }
    case 'AWAIT_POST_CREATE_CUSTOMER':
      return [];
    case 'COLLECT_ITEMS': {
      const combo = combinedInvoiceFieldsPrompt(missing);
      if (combo) return [combo];
      return [WIZARD_COLLECT_ITEMS_LINE];
    }
    case 'COLLECT_QUANTITY': {
      const combo = combinedInvoiceFieldsPrompt(missing);
      if (combo) return [combo];
      return [WIZARD_COLLECT_QUANTITY_LINE];
    }
    case 'COLLECT_PRICING': {
      const combo = combinedInvoiceFieldsPrompt(missing);
      if (combo) return [combo];
      return [WIZARD_COLLECT_PRICING_LINE];
    }
    case 'COLLECT_DUE_DATE': {
      const combo = combinedInvoiceFieldsPrompt(missing);
      if (combo) return [combo];
      return [WIZARD_COLLECT_DUE_DATE_LINE];
    }
    case 'CONFIRM':
      return [WIZARD_CONFIRM_LINE];
    case 'CREATE_INVOICE':
      return [WIZARD_CREATING_LINE];
    case 'SUCCESS':
      return [ASSISTANT_SUCCESS_CREATED];
    default:
      return wizardFallbackLines(missing);
  }
}

/** Build a ParsedInvoice for persistence; throws ZodError if invalid. */
export function draftToParsedInvoice(
  draft: InvoiceWizardDraft,
  reportingCurrency: string
): ParsedInvoice {
  const items = draft.items.map((i) => ({
    name: i.name,
    description: i.description ?? undefined,
    quantity: i.quantity,
    unit_price: i.unit_price,
    unit_label: i.unit_label ?? 'item',
    amount: i.quantity * i.unit_price,
  }));
  const due = draft.dueDate?.trim();
  if (!due) {
    throw new Error('draftToParsedInvoice: due date is required');
  }
  const raw = {
    customer_name: draft.customerName.trim(),
    customer_email: draft.customerEmail.trim(),
    items,
    due_date: due,
    notes: draft.notes?.trim() || undefined,
    currency: (draft.currency || reportingCurrency).trim().toUpperCase(),
    tax_percent: draft.taxPercent ?? undefined,
    discount_percent: draft.discountPercent ?? undefined,
    discount_amount: draft.discountAmount ?? undefined,
    use_payment_schedule: draft.usePaymentSchedule,
  };
  return parsedInvoiceSchema.parse(raw);
}
