import { assistantBoldLine } from '@/lib/assistant/assistant-bold-line';
import {
  CUSTOMER_ASSISTANT_DID_YOU_MEAN,
  CUSTOMER_ASSISTANT_NEED_NAME,
  CUSTOMER_ASSISTANT_NOT_FOUND,
  CUSTOMER_ASSISTANT_NOT_FOUND_TITLE,
  CUSTOMER_INLINE_ASK_EDIT,
  wizardCreateCustomerEmailLines,
} from '@/lib/business-assistant/assistant-tone';
import {
  findCustomerRecordsByName,
  findCustomerRecordsExactNameMatch,
  suggestCustomersBySimilarity,
} from '@/lib/business-assistant/assistant-customer-find';
import type { AssistantStructuredQuery } from '@/lib/business-assistant/assistant-structured-intent';
import { buildWizardShellResponse } from '@/lib/business-assistant/wizard-shell';
import type { AssistantRouterContext } from '@/lib/business-assistant/router-context';
import { hasPermission } from '@/lib/rbac/permissions';
import type {
  InvoiceWizardDraft,
  InvoiceWizardResponse,
} from '@/lib/invoices/conversational-invoice-wizard/types';
import {
  displayNameFromRow,
  fetchCustomerInlineRow,
  formatCustomerConversationalSnapshot,
} from '@/lib/customers/assistant-customer-inline-update';

function pickListLines(
  options: Array<{ customer_id: string; display_name: string; email: string | null }>
): string[] {
  const body = options.map((o, i) => {
    const em = o.email?.trim() ? ` — ${o.email.trim()}` : '';
    return `${i + 1}. ${o.display_name}${em}`;
  });
  return [
    'I found a few matches:',
    '',
    ...body,
    '',
    'Which one did you mean? Reply with the number or the name.',
  ];
}

async function handleCustomerRecordTurn(ctx: AssistantRouterContext) {
  const hint = ctx.structuredQuery?.filters?.customerNameHint?.trim() ?? '';
  if (!hint) {
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: [CUSTOMER_ASSISTANT_NEED_NAME],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
    });
  }

  const { rows } = await findCustomerRecordsByName(ctx.supabase, ctx.businessId, hint);
  const canEdit = hasPermission(ctx.role, 'manage_customers');

  if (rows.length === 1) {
    const row = rows[0]!;
    const full = await fetchCustomerInlineRow(ctx.supabase, ctx.businessId, row.id);
    if (!full) {
      return buildWizardShellResponse({
        sessionId: ctx.sessionId,
        draft: ctx.draft,
        customerMatch: ctx.customerMatch,
        customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
        assistant_lines: [assistantBoldLine(CUSTOMER_ASSISTANT_NOT_FOUND_TITLE), CUSTOMER_ASSISTANT_NOT_FOUND],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: null,
      });
    }
    if (canEdit) {
      const lines = [...formatCustomerConversationalSnapshot(full), '', CUSTOMER_INLINE_ASK_EDIT];
      return buildWizardShellResponse({
        sessionId: ctx.sessionId,
        draft: ctx.draft,
        customerMatch: ctx.customerMatch,
        customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
        assistant_lines: lines,
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: {
          kind: 'inline_editing',
          customer_id: full.id,
          display_name: displayNameFromRow(full),
          can_edit_customer: true,
        },
      });
    }
    const lines = [
      ...formatCustomerConversationalSnapshot(full),
      '',
      'You don’t have permission to edit customers here. Open Customers in the sidebar for the full directory.',
    ];
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: lines,
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
    });
  }

  if (rows.length > 1) {
    const options = rows.map((r) => ({
      customer_id: r.id,
      display_name: r.display_name,
      email: r.email,
    }));
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: pickListLines(options),
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: {
        kind: 'customer_pick_options',
        options,
        can_edit_customer: canEdit,
      },
    });
  }

  const fuzzy = await suggestCustomersBySimilarity(ctx.supabase, ctx.businessId, hint, {
    minRatio: 0.3,
    limit: 5,
  });

  if (fuzzy.length > 0) {
    const options = fuzzy.map((r) => ({
      customer_id: r.id,
      display_name: r.display_name,
      email: r.email,
    }));
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: [
        assistantBoldLine(CUSTOMER_ASSISTANT_NOT_FOUND_TITLE),
        CUSTOMER_ASSISTANT_DID_YOU_MEAN,
        '',
        ...pickListLines(options),
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: {
        kind: 'customer_pick_options',
        options,
        can_edit_customer: canEdit,
      },
    });
  }

  return buildWizardShellResponse({
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    assistant_lines: [assistantBoldLine(CUSTOMER_ASSISTANT_NOT_FOUND_TITLE), CUSTOMER_ASSISTANT_NOT_FOUND],
    chat_cards: null,
    pending_invoice_lookup: null,
    pending_customer_context: null,
    quick_replies: [
      { label: 'New customer', message: 'Create a new customer' },
      { label: 'Open customers', message: 'Open the customers page' },
    ],
  });
}

async function handleCustomerEmailUpdateTurn(ctx: AssistantRouterContext) {
  const hint = ctx.structuredQuery?.filters?.customerNameHint?.trim() ?? '';
  const newEmail = ctx.structuredQuery?.filters?.customerEmailHint?.trim() ?? '';
  const canEdit = hasPermission(ctx.role, 'manage_customers');

  if (!hint) {
    const recent =
      ctx.customerMatch?.suggestions?.length === 1
        ? ctx.customerMatch.suggestions[0]?.label ?? null
        : null;
    const lines = ['Which customer would you like to update?'];
    if (recent) {
      lines.push('', `Do you want to update **${recent}**’s email?`);
    }
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: lines,
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: {
        kind: 'awaiting_customer_email_update',
        ...(newEmail ? { pending_new_email: newEmail } : {}),
      },
      customer_edit_session: null,
    });
  }

  const { rows } = await findCustomerRecordsByName(ctx.supabase, ctx.businessId, hint);
  if (rows.length === 0) {
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: [assistantBoldLine(CUSTOMER_ASSISTANT_NOT_FOUND_TITLE), CUSTOMER_ASSISTANT_NOT_FOUND],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }
  if (rows.length > 1) {
    const options = rows.map((r) => ({
      customer_id: r.id,
      display_name: r.display_name,
      email: r.email,
    }));
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: pickListLines(options),
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: {
        kind: 'customer_pick_options',
        options,
        can_edit_customer: canEdit,
      },
      customer_edit_session: null,
    });
  }

  const row = rows[0]!;
  const full = await fetchCustomerInlineRow(ctx.supabase, ctx.businessId, row.id);
  if (!full) {
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: [assistantBoldLine(CUSTOMER_ASSISTANT_NOT_FOUND_TITLE), CUSTOMER_ASSISTANT_NOT_FOUND],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  if (!canEdit) {
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: [
        ...formatCustomerConversationalSnapshot(full),
        '',
        'You don’t have permission to edit customers here. Open Customers in the sidebar for the full directory.',
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  if (!newEmail) {
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: ['What’s the new email?'],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: {
        kind: 'inline_editing',
        customer_id: full.id,
        display_name: displayNameFromRow(full),
        can_edit_customer: true,
        awaiting_value_for: 'email',
      },
      customer_edit_session: {
        customer_id: full.id,
        display_name: displayNameFromRow(full),
      },
    });
  }

  return buildWizardShellResponse({
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    assistant_lines: [
      `Update **${displayNameFromRow(full)}** email to **${newEmail}**?`,
      'Reply **yes** to confirm or provide a different email.',
    ],
    chat_cards: null,
    pending_invoice_lookup: null,
    pending_customer_context: {
      kind: 'inline_editing',
      customer_id: full.id,
      display_name: displayNameFromRow(full),
      can_edit_customer: true,
      awaiting_value_for: 'email',
    },
    customer_edit_session: {
      customer_id: full.id,
      display_name: displayNameFromRow(full),
    },
  });
}

function structuredQueryForCustomerEmailUpdateSlots(args: {
  customerNameHint?: string | null;
  customerEmailHint?: string | null;
}): AssistantStructuredQuery {
  return {
    intentFamily: 'record_action',
    businessObject: 'customer',
    queryShape: 'edit_record',
    scope: 'customer',
    filters: {
      ...(args.customerNameHint?.trim() ? { customerNameHint: args.customerNameHint.trim() } : {}),
      ...(args.customerEmailHint?.trim() ? { customerEmailHint: args.customerEmailHint.trim() } : {}),
    },
    routeCategory: 'customer_actions',
    handlerHint: 'customer_email_update',
  };
}

function structuredQueryForCustomerCreateName(hint: string): AssistantStructuredQuery {
  return {
    intentFamily: 'workflow_create',
    businessObject: 'customer',
    queryShape: 'create',
    scope: 'workspace',
    filters: { customerNameHint: hint.trim() },
    routeCategory: 'customer_actions',
    handlerHint: 'customer_create',
  };
}

/**
 * Resume create-customer after bare “Create customer” + user sends the company name.
 */
export async function handleCustomerCreateWithCompanyNameReply(
  ctx: AssistantRouterContext,
  companyNameTrimmed: string
): Promise<InvoiceWizardResponse> {
  return handleCustomerCreateTurn({
    ...ctx,
    structuredQuery: structuredQueryForCustomerCreateName(companyNameTrimmed),
  });
}

/** Resume update-customer-email after collecting only customer name. */
export async function handleCustomerEmailUpdateWithCustomerNameReply(
  ctx: AssistantRouterContext,
  customerNameTrimmed: string,
  pendingNewEmail?: string | null
): Promise<InvoiceWizardResponse> {
  return handleCustomerEmailUpdateTurn({
    ...ctx,
    structuredQuery: structuredQueryForCustomerEmailUpdateSlots({
      customerNameHint: customerNameTrimmed,
      customerEmailHint: pendingNewEmail ?? null,
    }),
  });
}

async function handleCustomerCreateTurn(ctx: AssistantRouterContext) {
  const resumeLater =
    ctx.resumeInvoiceAfterCustomerCreate === true ||
    ctx.draft.resumeInvoiceAfterCustomerCreate === true;
  const canAdd =
    hasPermission(ctx.role, 'create_customer') || hasPermission(ctx.role, 'manage_customers');
  if (!canAdd) {
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: ['You don’t have permission to add customers here. Ask an admin.'],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }

  const hint = ctx.structuredQuery?.filters?.customerNameHint?.trim() ?? '';
  if (!hint) {
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: ['What’s the company or client name?'],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: resumeLater
        ? { kind: 'awaiting_create_customer_name', resume_invoice_after: true }
        : { kind: 'awaiting_create_customer_name' },
      customer_edit_session: null,
    });
  }

  const exactRows = await findCustomerRecordsExactNameMatch(ctx.supabase, ctx.businessId, hint);
  const canEdit = hasPermission(ctx.role, 'manage_customers');

  if (exactRows.length >= 1) {
    const row = exactRows[0]!;
    const full = await fetchCustomerInlineRow(ctx.supabase, ctx.businessId, row.id);
    if (!full) {
      return buildWizardShellResponse({
        sessionId: ctx.sessionId,
        draft: ctx.draft,
        customerMatch: ctx.customerMatch,
        customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
        assistant_lines: [assistantBoldLine(CUSTOMER_ASSISTANT_NOT_FOUND_TITLE), CUSTOMER_ASSISTANT_NOT_FOUND],
        chat_cards: null,
        pending_invoice_lookup: null,
        pending_customer_context: null,
        customer_edit_session: null,
      });
    }
    const dupNote =
      exactRows.length > 1
        ? [
            '',
            'Heads up — more than one record uses that exact name. You may want to merge duplicates in your customer list.',
          ]
        : [];
    const lines = [
      ...formatCustomerConversationalSnapshot(full),
      '',
      'That customer is already in your directory.',
      ...(canEdit
        ? ['Do you want to edit it?', 'Reply **yes** to update their details in chat.']
        : [
            'You don’t have permission to edit customers here. Open **Customers** in the sidebar for the full record.',
          ]),
      ...dupNote,
    ];
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: lines,
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: canEdit
        ? {
            kind: 'single_confirm',
            customer_id: full.id,
            display_name: displayNameFromRow(full),
            default_action: 'edit_customer',
            can_edit_customer: true,
            confirmation_state: {
              pendingQuestionType: 'confirm_duplicate_customer',
              activeWorkflow: 'create_customer',
              targetEntityType: 'customer',
              targetEntityId: full.id,
              defaultYesAction: 'edit_customer',
              defaultNoAction: null,
            },
          }
        : null,
      customer_edit_session: null,
    });
  }

  const nextDraft: InvoiceWizardDraft = {
    ...ctx.draft,
    isNewCustomer: true,
    customerId: null,
    customerName: hint,
    customerEmail: '',
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
    resumeInvoiceAfterCustomerCreate: resumeLater,
  };

  return buildWizardShellResponse({
    sessionId: ctx.sessionId,
    draft: nextDraft,
    customerMatch: null,
    customerNeedsDisambiguation: false,
    assistant_lines: wizardCreateCustomerEmailLines(hint),
    chat_cards: null,
    pending_invoice_lookup: null,
    pending_customer_context: null,
    customer_edit_session: null,
  });
}

/** Customer domain: list stubs + record find / edit / view (conversational, no action cards). */
export async function handleCustomerAssistantTurn(ctx: AssistantRouterContext) {
  if (ctx.structuredQuery?.handlerHint === 'customer_create') {
    return handleCustomerCreateTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'customer_email_update') {
    return handleCustomerEmailUpdateTurn(ctx);
  }
  if (ctx.structuredQuery?.handlerHint === 'bare_edit_clarify') {
    const hint = ctx.structuredQuery.filters.customerNameHint?.trim() || '';
    const label = hint ? `**${hint}**` : 'that name';
    return buildWizardShellResponse({
      sessionId: ctx.sessionId,
      draft: ctx.draft,
      customerMatch: ctx.customerMatch,
      customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
      assistant_lines: [
        `I couldn’t match ${label} to a customer.`,
        '',
        hint
          ? `Say **edit customer ${hint}**, **create customer ${hint}**, or **create invoice** if you meant a bill.`
          : 'Say **edit customer …**, **create customer …**, or **create invoice** if you meant a bill.',
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
      pending_customer_context: null,
      customer_edit_session: null,
    });
  }
  if (ctx.structuredQuery?.handlerHint === 'customer_record') {
    return handleCustomerRecordTurn(ctx);
  }

  return buildWizardShellResponse({
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    assistant_lines: [],
    assistant_structured: {
      title: assistantBoldLine('Customers'),
      lines: [
        'Say **create customer Acme** to add someone new in chat.',
        'Say **edit Acme customer** or **view customer Basir Limited** to look someone up.',
      ],
    },
    chat_cards: null,
    pending_invoice_lookup: null,
    pending_customer_context: null,
  });
}
