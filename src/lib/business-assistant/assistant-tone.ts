/**
 * Conversational tone for the business Assistant.
 *
 * Keep copy natural, short, and confident. Prefer “What’s…” over “Please provide”.
 * Avoid long paragraphs, system-style wording, and repeating entity names without a reason.
 *
 * User-visible strings that should stay consistent across wizard, API errors, and invoice
 * retrieval live here; step ordering and transitions stay in the state machine / routes.
 */

import type {
  AssistantQuickReply,
  InvoiceWizardDraft,
  WizardMissingField,
} from '@/lib/invoices/conversational-invoice-wizard/types';

/** Short confirmations (use when echoing acceptance in future turns). */
export const ASSISTANT_CONFIRM_GOT_IT = 'Got it.';
export const ASSISTANT_CONFIRM_DONE = 'Done.';
export const ASSISTANT_CONFIRM_ALL_SET = 'All set.';

export const ASSISTANT_SUCCESS_CREATED = 'Successfully created ✅';

/** Matches chat confirmation when a customer is saved via the shared create-customer flow. */
export const ASSISTANT_CUSTOMER_CREATED_CONFIRM = 'Customer created ✅';

/** Generic failure when `createCustomerForBusiness` returns a server error (mirrors UI toast spirit). */
export const ASSISTANT_CREATE_CUSTOMER_GENERIC_ERROR =
  'Something went wrong creating the customer. Let’s try again.';

export const WIZARD_GET_CUSTOMER_LINE = 'Who’s this invoice for?';

/** When the customer is already linked — not used while confirmation is still required. */
export const WIZARD_CHECK_CUSTOMER_LINE =
  'Pick a match below, or create a new customer.';

/** After email is known; optional onboarding. */
export function wizardOptionalAddLines(thing: string): string[] {
  return [`Do you want to add ${thing} too?`, `You can send it now or say skip.`];
}

/** First optional step after email (create-customer flow). */
export function wizardNewCustomerPhoneLines(): string[] {
  return [
    `${ASSISTANT_CONFIRM_GOT_IT} Do you want to add a phone number too?`,
    'You can send it now or say skip.',
  ];
}

export function wizardNewCustomerAddressLines(): string[] {
  return [
    `${ASSISTANT_CONFIRM_GOT_IT} Do you want to add an address too?`,
    'You can send it now or say skip.',
  ];
}

/** New customer: email required (two lines when we already have a display name). */
export function wizardCreateCustomerEmailLines(customerNameTrimmed: string | undefined): string[] {
  const n = customerNameTrimmed?.trim();
  if (n) {
    return [`${n} isn’t in your customers yet. What’s the email address?`];
  }
  return [`What’s the email address?`];
}

/** Invoice wizard: disambiguation — user must confirm before we link a customer row. */
export function invoiceWizardCustomerPickPrompt(
  displayName: string,
  reason: 'duplicate_exact' | 'fuzzy_partial'
): string {
  const n = displayName.trim() || 'this name';
  if (reason === 'duplicate_exact') {
    return `More than one customer matches “${n}”. Pick one below, or create a new customer.`;
  }
  return `I found possible matches for ${n}. Pick one below, or create a new customer.`;
}

export const WIZARD_COUNTRY_LINE =
  'Which country should we use? Pick below or type a code (e.g. US, Canada).';

export const WIZARD_COLLECT_ITEMS_LINE = 'What’s the item or service?';

export const WIZARD_COLLECT_QUANTITY_LINE = 'How many units or hours on this line?';

export const WIZARD_COLLECT_PRICING_LINE = 'What’s the price per unit?';

export const WIZARD_COLLECT_DUE_DATE_LINE = 'What’s the due date?';

export const WIZARD_CONFIRM_LINE = 'Look good?\nTap confirm to create the draft.';

export const WIZARD_CREATING_LINE = 'Creating…';

export const WIZARD_CONTINUE_PROMPT = 'What’s next?';

/**
 * Combined ask only for **line-item refinements** (quantity / pricing with items).
 * Identity and schedule are **sequential slots**: customer → items → due date — never bundle
 * customer with items/due in one prompt (see `computeMissingFields` order).
 */
export function buildCombinedInvoiceMissingPrompt(missing: WizardMissingField[]): string | null {
  const want = new Set(missing);
  if (want.has('customer') || want.has('customer_email') || want.has('customer_pick')) return null;
  if (want.has('due_date')) return null;
  const parts: string[] = [];
  if (want.has('items')) parts.push('item or service');
  if (want.has('pricing')) parts.push('amount');
  if (want.has('quantity')) parts.push('quantity');
  if (parts.length < 2) return null;
  const list = parts.join(', ');
  const oxford = list.replace(/, ([^,]*)$/, ', and $1');
  return `What’s the ${oxford}? One message is fine — e.g. “Logo design, $500”.`;
}

export function wizardSingleMissingPrompt(field: WizardMissingField): string {
  switch (field) {
    case 'due_date':
      return 'What’s the due date?';
    case 'customer':
      return 'Who’s this invoice for?';
    case 'customer_pick':
      return WIZARD_CHECK_CUSTOMER_LINE;
    case 'customer_email':
      return 'What’s the email address?';
    case 'items':
      return 'What’s the item or service?';
    case 'quantity':
      return 'How many units or hours?';
    case 'pricing':
      return 'What’s the price per unit?';
    case 'confirm':
      return WIZARD_CONFIRM_LINE;
  }
}

/** One slot at a time, in `computeMissingFields` order (customer → items → due date, …). */
export function wizardFallbackLines(missing: WizardMissingField[]): string[] {
  if (missing.length === 0) return [WIZARD_CONTINUE_PROMPT];
  const first = missing[0];
  if (first) return [wizardSingleMissingPrompt(first)];
  return [WIZARD_CONTINUE_PROMPT];
}

/** When confirm_create is blocked; prefer the next missing field if known. */
export function wizardConfirmBlockedMessage(nextMissing: WizardMissingField | null): string {
  if (nextMissing) return wizardSingleMissingPrompt(nextMissing);
  return 'A few details are still missing before we can create this.';
}

/** Assistant customer record flow (edit / view / find). */
export const CUSTOMER_ASSISTANT_FOUND_TITLE = 'Customer found';
export const CUSTOMER_ASSISTANT_NOT_FOUND_TITLE = 'Customer not found';
export const CUSTOMER_ASSISTANT_DID_YOU_MEAN = 'Did you mean:';
export const CUSTOMER_ASSISTANT_NOT_FOUND =
  'I couldn’t find that customer. Do you want to create a new one?';
export const CUSTOMER_ASSISTANT_NEED_NAME = 'Which customer should I look up?';

/** Tier-5 routing: no structured match — do not start invoice wizard. */
export const ASSISTANT_ROUTING_FALLBACK =
  'Say what you’d like to do — for example **create invoice**, **create customer**, or **how much did we collect last month**.';

/** User repeated “create invoice” while a draft is still in progress. */
export const ASSISTANT_ALREADY_CREATING_INVOICE =
  'You’re already creating an invoice. Let’s continue.';

/**
 * Short confirmations after a wizard turn applied new draft fields (customer / line / due date).
 */
export function wizardConfirmEchoForTurn(before: InvoiceWizardDraft, after: InvoiceWizardDraft): string[] {
  const lines: string[] = [];
  const bn = before.customerName.trim();
  const an = after.customerName.trim();
  if (an && an !== bn) {
    lines.push(`Got it — ${an}.`);
  }
  const bi = before.items;
  const ai = after.items;
  if (ai.length > bi.length) {
    const last = ai[ai.length - 1];
    const nm = String(last?.name ?? '').trim();
    if (nm) lines.push(`Got it — ${nm}.`);
  } else if (ai.length > 0 && bi.length === ai.length) {
    for (let i = 0; i < ai.length; i++) {
      const pb = bi[i];
      const pa = ai[i];
      if (!pa) continue;
      const nameBefore = String(pb?.name ?? '').trim();
      const nameAfter = String(pa.name ?? '').trim();
      if (nameAfter && nameAfter !== nameBefore) {
        lines.push(`Got it — ${nameAfter}.`);
        break;
      }
    }
  }
  const bd = (before.dueDate ?? '').trim();
  const ad = (after.dueDate ?? '').trim();
  if (ad && ad !== bd) {
    lines.push(`Got it — due ${ad}.`);
  }
  return lines;
}
export const CUSTOMER_ASSISTANT_PICK = 'I found a few matches. Which one?';

/** In-chat customer edit (Assistant / invoice-wizard). */
export const CUSTOMER_INLINE_NOT_FOUND = 'I could not load that customer.';
export const CUSTOMER_INLINE_ASK_EDIT = 'What do you want me to edit?';
/** After “Anything else to update?” — short affirmations should land here, not invoice flow. */
export const CUSTOMER_INLINE_ASK_WHAT_TO_UPDATE = 'What do you want to update?';
export const CUSTOMER_INLINE_POST_UPDATE =
  'Anything else to update, or should I continue with the invoice?';
/** User closed edit after no successful mutations this session. */
export const CUSTOMER_INLINE_CLOSE_NO_CHANGES =
  'All set — say **Continue to invoice** when you’re ready to add line items.';
/** User closed edit after at least one successful save. */
export const CUSTOMER_INLINE_CLOSE_WITH_CHANGES =
  'Great — say **Continue to invoice** when you’re ready to add line items.';
/** After user finishes customer edits inside the invoice wizard — resume line items. */
export const ASSISTANT_CONTINUE_INVOICE_AFTER_CUSTOMER_EDIT =
  'Great — I’ll continue with the invoice.';

/** Chips after an inline customer update while creating an invoice. */
export const INVOICE_WIZARD_CUSTOMER_EDIT_QUICK_REPLIES: AssistantQuickReply[] = [
  { label: 'Edit customer', message: 'Edit this customer' },
  { label: 'Continue to invoice', message: 'Continue with invoice creation' },
];
export const CUSTOMER_INLINE_ACK_AFFIRM =
  'Sounds good. If you need another change, just say what to update.';
export const CUSTOMER_INLINE_UNCLEAR =
  'Say what to change — for example “change the email to name@company.com” or “update the phone to …”.';
export const CUSTOMER_INLINE_NAME_WHICH =
  'Do you want to change the **company name** or the **contact person**? Reply with one of those.';
export const CUSTOMER_INLINE_NAME_CLARIFY_RETRY =
  'Say **company name** or **contact person** so I know which to update.';
export const CUSTOMER_INLINE_SWITCH_CUSTOMER =
  'Sure — which customer should we work with? Say a name to search, or pick from your list.';
export const CUSTOMER_INLINE_CANNOT_REMOVE_EMAIL =
  'I can’t remove the email — every customer needs one. Say a new address to change it, or open the form for more options.';

/** Customer picker / disambiguation (invoice wizard API) — prefer `invoiceWizardCustomerPickPrompt` when name known. */
export const CUSTOMER_MATCH_CLARIFY = 'I found possible matches. Pick one below, or create a new customer.';
export const CUSTOMER_MATCH_PICK_OR_NEW =
  'Pick a match below, or create a new customer.';
export const CUSTOMER_MATCH_UNSPECIFIED = 'Who’s this for?';

/** Invoice lookup / actions (assistant-invoice-pipeline). */
export const INVOICE_REF_PROMPT = 'What’s the invoice number?';
export const INVOICE_MARK_PAID_REF_PROMPT = 'Which invoice would you like to record payment for?';

export function invoiceRefPromptForPendingAction(
  action: 'mark_paid' | 'send' | 'resend' | 'duplicate' | 'void'
): string {
  if (action === 'mark_paid') return INVOICE_MARK_PAID_REF_PROMPT;
  return INVOICE_REF_PROMPT;
}

export const INVOICE_NOT_FOUND_HELP =
  'Couldn’t find that invoice. Try the full number, or say how you want to search.';
export const INVOICE_MULTI_REF_CLARIFY = 'I found a few possible matches. Which one?';
export const INVOICE_SINGLE_REF_MISMATCH = 'Couldn’t match that to a single invoice. Try the full number.';

/** Short lead-in before an invoice list card. */
export function assistantListMatchesLine(count: number): string {
  return count === 1 ? '1 match below:' : `${count} matches below:`;
}

/** Customer row insert (wizard API). */
export const CUSTOMER_INSERT_VALIDATION = 'I need a client or company name plus an email to save them.';
export const CUSTOMER_INSERT_FAILED = 'Couldn’t save that customer. Double-check the email and try again.';

export const ASSISTANT_GENERIC_RETRY = 'Something went wrong. Try again.';
