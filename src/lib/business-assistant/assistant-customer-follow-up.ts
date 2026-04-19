import type {
  ActiveWorkflow,
  ConfirmationState,
  CustomerInlineAwaitingField,
  PendingAssistantCustomer,
  PendingQuestionType,
} from '@/lib/invoices/conversational-invoice-wizard/types';

const AWAITING_FIELDS: readonly CustomerInlineAwaitingField[] = [
  'name',
  'email',
  'company',
  'phone',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
] as const;

function coerceAwaitingField(raw: unknown): CustomerInlineAwaitingField | undefined {
  if (raw == null || raw === '') return undefined;
  const s = String(raw).trim();
  return (AWAITING_FIELDS as readonly string[]).includes(s) ? (s as CustomerInlineAwaitingField) : undefined;
}

/** User is done editing the customer in Assistant chat. */
export function isAssistantCustomerEditExit(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 72) return false;
  return /^(no|nope|done|that'?s all|that is all|no more|nothing else|stop|cancel|finished|all set|that'?s it|thats it|thanks,? that'?s all)(\s*[!.])*$/i.test(
    t
  );
}

/** User wants to leave edit mode and pick a different customer (invoice search may resume). */
export function isAssistantSwitchCustomer(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 120) return false;
  return (
    /^(edit\s+another\s+customer|switch\s+customer|not\s+this\s+customer|change\s+customer|different\s+customer|pick\s+a\s+different\s+customer)(\s*[!.?])*$/i.test(
      t
    ) ||
    /\b(edit\s+another\s+customer|switch\s+customer|not\s+this\s+customer)\b/i.test(t)
  );
}

/** Review current customer record (no DB write). */
export function isAssistantCustomerEditShowReview(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 96) return false;
  return (
    /^(show\s+details|show\s+current\s+data|review|what'?s\s+on\s+file|show\s+customer)(\s*[!.?])*$/i.test(t) ||
    /^(show\s+me\s+the\s+details|current\s+details)(\s*[!.?])*$/i.test(t)
  );
}

/** Reply after we asked “company name or contact person?”. */
export function parseNameCompanyVsContactReply(text: string): 'company' | 'contact' | null {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 80) return null;
  if (
    /^(company|company\s+name|client\s+name|business\s+name|customer\s+name|the\s+company)$/i.test(t) ||
    /\b(company\s+name|client\s+name|business\s+name)\b/i.test(text.trim())
  ) {
    return 'company';
  }
  if (
    /^(contact|contact\s+person|contact\s+name|person|representative|the\s+contact)$/i.test(t) ||
    /^contact\b/i.test(t)
  ) {
    return 'contact';
  }
  return null;
}

/** Short confirmations that should execute the pending customer default action (not invoice flow). */
export function isAssistantAffirmation(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 48) return false;
  return /^(yes|yeah|yep|yup|ok|okay|k|sure|go\s*ahead|do\s+it|please|absolutely|definitely|correct|right|fine|sounds?\s+good)(\s*[!.])*$/i.test(
    t
  );
}

const PENDING_QUESTION_SET = new Set<string>([
  'confirm_edit_customer',
  'continue_edit_customer',
  'confirm_duplicate_customer',
  'confirm_create_invoice',
  'confirm_switch_customer',
]);

const ACTIVE_WORKFLOW_SET = new Set<string>([
  'create_customer',
  'edit_customer',
  'create_invoice',
  'edit_invoice',
  'metric_query',
  'lookup_customer',
  'lookup_invoice',
]);

function parsePendingQuestionType(raw: unknown): PendingQuestionType {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  return PENDING_QUESTION_SET.has(raw) ? (raw as PendingQuestionType) : null;
}

function parseActiveWorkflow(raw: unknown): ActiveWorkflow {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  return ACTIVE_WORKFLOW_SET.has(raw) ? (raw as ActiveWorkflow) : null;
}

function parseTargetEntityType(raw: unknown): 'customer' | 'invoice' | null {
  if (raw === 'customer' || raw === 'invoice') return raw;
  return null;
}

function readStringOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t || null;
}

function parseConfirmationStateFromUnknown(raw: unknown): ConfirmationState | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    pendingQuestionType: parsePendingQuestionType(
      r.pendingQuestionType ?? r.pending_question_type
    ),
    activeWorkflow: parseActiveWorkflow(r.activeWorkflow ?? r.active_workflow),
    targetEntityType: parseTargetEntityType(r.targetEntityType ?? r.target_entity_type),
    targetEntityId: readStringOrNull(r.targetEntityId ?? r.target_entity_id),
    defaultYesAction: readStringOrNull(r.defaultYesAction ?? r.default_yes_action),
    defaultNoAction: readStringOrNull(r.defaultNoAction ?? r.default_no_action),
  };
}

function mergeConfirmationStateDefaults(
  s: ConfirmationState,
  customerId: string,
  defaultAction: 'edit_customer' | 'view_customer'
): ConfirmationState {
  return {
    ...s,
    targetEntityId: s.targetEntityId ?? customerId,
    targetEntityType: s.targetEntityType ?? 'customer',
    defaultYesAction:
      s.defaultYesAction ??
      (defaultAction === 'edit_customer' ? 'edit_customer' : 'view_customer'),
  };
}

/** Maps pre–confirmation_state wire fields (client echoes). */
function confirmationStateFromLegacyWire(
  o: Record<string, unknown>,
  customerId: string,
  defaultAction: 'edit_customer' | 'view_customer'
): ConfirmationState | undefined {
  const pq = o.pending_question;
  const aw = o.active_workflow;
  if (typeof pq !== 'string' && typeof aw !== 'string') return undefined;

  let pendingQuestionType: PendingQuestionType = null;
  if (typeof pq === 'string') {
    if (pq === 'confirm_continue_editing') pendingQuestionType = 'continue_edit_customer';
    else if (pq === 'confirm_create_new_record') pendingQuestionType = null;
    else if (PENDING_QUESTION_SET.has(pq)) pendingQuestionType = pq as PendingQuestionType;
  }

  let activeWorkflow: ActiveWorkflow = null;
  if (typeof aw === 'string') {
    if (aw === 'customer_inline_edit') activeWorkflow = 'edit_customer';
    else if (ACTIVE_WORKFLOW_SET.has(aw)) activeWorkflow = aw as ActiveWorkflow;
  }

  if (pendingQuestionType === null && activeWorkflow === null) return undefined;

  return mergeConfirmationStateDefaults(
    {
      pendingQuestionType,
      activeWorkflow,
      targetEntityType: null,
      targetEntityId: null,
      defaultYesAction: null,
      defaultNoAction: null,
    },
    customerId,
    defaultAction
  );
}

/** Short declines for a pending yes/no confirm (e.g. “Do you want to edit it?”). Not used for free-form chat. */
export function isAssistantConfirmationDecline(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 48) return false;
  return /^(no|nope|nah|not\s+now|don'?t|do\s+not|skip|pass)(\s*[!.])*$/i.test(t);
}

export function resolveCustomerPickSelection(
  text: string,
  options: Array<{ customer_id: string; display_name: string; email: string | null }>
): string | null {
  const t = text.trim();
  if (!t || !options.length) return null;
  const num = /^\s*(\d{1,2})\s*$/.exec(t);
  if (num) {
    const n = parseInt(num[1]!, 10);
    if (n >= 1 && n <= options.length) return options[n - 1]!.customer_id;
  }
  const lower = t.toLowerCase();
  for (const o of options) {
    const name = o.display_name.trim().toLowerCase();
    if (!name) continue;
    if (lower === name || name.includes(lower) || lower.includes(name)) {
      return o.customer_id;
    }
  }
  return null;
}

export function normalizePendingCustomerContextFromUnknown(raw: unknown): PendingAssistantCustomer | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.kind === 'awaiting_create_customer_name') {
    const resume = o.resume_invoice_after === true;
    return {
      kind: 'awaiting_create_customer_name',
      ...(resume ? { resume_invoice_after: true } : {}),
    };
  }
  if (o.kind === 'awaiting_customer_email_update') {
    const pending_new_email =
      typeof o.pending_new_email === 'string' && o.pending_new_email.trim()
        ? o.pending_new_email.trim()
        : null;
    return {
      kind: 'awaiting_customer_email_update',
      ...(pending_new_email ? { pending_new_email } : {}),
    };
  }

  if (o.kind === 'customer_pick_options') {
    const rawOpts = o.options;
    if (!Array.isArray(rawOpts) || rawOpts.length === 0) return null;
    const options = rawOpts
      .map((x) => {
        if (x == null || typeof x !== 'object') return null;
        const r = x as Record<string, unknown>;
        const cid = typeof r.customer_id === 'string' ? r.customer_id.trim() : '';
        const dn = typeof r.display_name === 'string' ? r.display_name.trim() : '';
        if (!cid || !dn) return null;
        const em = typeof r.email === 'string' ? r.email.trim() : null;
        return { customer_id: cid, display_name: dn, email: em || null };
      })
      .filter((x): x is { customer_id: string; display_name: string; email: string | null } => x != null);
    if (!options.length) return null;
    return {
      kind: 'customer_pick_options',
      options,
      can_edit_customer: Boolean(o.can_edit_customer),
    };
  }

  const id = typeof o.customer_id === 'string' ? o.customer_id.trim() : '';
  if (!id) return null;
  const display_name = typeof o.display_name === 'string' ? o.display_name.trim() : '';

  if (o.kind === 'inline_editing') {
    const awaiting = coerceAwaitingField(o.awaiting_value_for);
    const clarifyRaw = o.awaiting_inline_clarify;
    const clarify =
      clarifyRaw === 'name_company_vs_contact' ? ('name_company_vs_contact' as const) : undefined;
    return {
      kind: 'inline_editing',
      customer_id: id,
      display_name: display_name || 'Customer',
      can_edit_customer: Boolean(o.can_edit_customer),
      ...(o.has_updates_in_session === true ? { has_updates_in_session: true } : {}),
      ...(awaiting ? { awaiting_value_for: awaiting } : {}),
      ...(clarify ? { awaiting_inline_clarify: clarify } : {}),
    };
  }

  if (o.kind !== 'single_confirm') return null;
  const da = o.default_action;
  if (da !== 'edit_customer' && da !== 'view_customer') return null;
  const parsed = parseConfirmationStateFromUnknown(o.confirmation_state);
  const confirmation_state = parsed
    ? mergeConfirmationStateDefaults(parsed, id, da)
    : confirmationStateFromLegacyWire(o, id, da);
  return {
    kind: 'single_confirm',
    customer_id: id,
    display_name: display_name || 'Customer',
    default_action: da,
    can_edit_customer: Boolean(o.can_edit_customer),
    ...(confirmation_state ? { confirmation_state } : {}),
  };
}

/** Full-page navigation targets for legacy / non-chat flows. Chat edit uses inline mode first. */
export function hrefForPendingCustomerConfirm(p: PendingAssistantCustomer): string {
  if (p.kind === 'customer_pick_options') {
    return '/dashboard/customers';
  }
  if (p.kind === 'awaiting_create_customer_name') {
    return '/dashboard/customers';
  }
  if (p.kind === 'awaiting_customer_email_update') {
    return '/dashboard/customers';
  }
  if (p.kind === 'inline_editing') {
    return `/dashboard/customers/${p.customer_id}`;
  }
  if (p.kind === 'single_confirm') {
    if (p.default_action === 'edit_customer' && p.can_edit_customer) {
      return `/dashboard/customers/${p.customer_id}/edit`;
    }
    return `/dashboard/customers/${p.customer_id}`;
  }
  return '/dashboard/customers';
}
