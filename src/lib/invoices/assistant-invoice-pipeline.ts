import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { BusinessRole } from '@/lib/rbac/types';
import {
  assistantListMatchesLine,
  ASSISTANT_ALREADY_CREATING_INVOICE,
  INVOICE_MULTI_REF_CLARIFY,
  INVOICE_NOT_FOUND_HELP,
  INVOICE_REF_PROMPT,
  invoiceRefPromptForPendingAction,
  INVOICE_SINGLE_REF_MISMATCH,
  WIZARD_CONFIRM_LINE,
  wizardSingleMissingPrompt,
} from '@/lib/business-assistant/assistant-tone';
import { assistantBoldLine } from '@/lib/assistant/assistant-bold-line';
import { buildWizardShellResponse } from '@/lib/business-assistant/wizard-shell';
import { assistantRevenueScopePhraseForMessage } from '@/lib/business-assistant/financial-date-range-resolver';
import {
  COLLECTED_INVOICE_LIST_FOLLOW_UP_QUESTION,
  revenueCollectedSummaryStructured,
  revenuePeriodInvoiceListPrompt,
} from '@/lib/business-assistant/financial-assistant-copy';
import { paidUtcToResolvedPaymentsShape } from '@/lib/business-assistant/financial-metric-queries';
import { metricContextForRevenueWindow } from '@/lib/business-assistant/metric-session-context';
import {
  detectInvoiceLookupIntent,
  extractInvoiceRefForLookup,
  shouldResetDraftForNewInvoiceIntent,
  textLooksLikeCreateInvoiceFlow,
} from '@/lib/invoices/invoice-chat-intent';
import { parseInvoiceReferenceFromText } from '@/lib/invoices/invoice-reference';
import { buildInvoiceLookupChatCards } from '@/lib/invoices/assistant-invoice-lookup-card';
import type { AssistantRouterContext } from '@/lib/business-assistant/router-context';
import {
  fetchInvoiceLookupRowById,
  findInvoicesByReference,
  type InvoiceLookupRow,
} from '@/lib/invoices/resolve-invoices-by-reference';
import { resolveInvoiceAssistantIntent } from '@/lib/invoices/assistant-invoice-resolve-intent';
import {
  resolveAssistantInvoicePeriodContext,
  resolveAssistantPaidUtcWindow,
} from '@/lib/invoices/assistant-invoice-paid-bounds';
import {
  fetchRankedOverdueFollowUps,
  type RankedOverdueFollowUpResult,
} from '@/lib/invoices/assistant-overdue-priority';
import {
  aggregateAssistantBalanceInDueWindow,
  aggregateAssistantDailyBusinessPriorityCounts,
  aggregateAssistantInvoiceInsights,
  aggregateAssistantInvoiceStatus,
  aggregatePaidInUtcWindow,
  assistantInvoiceListRowToChatItem,
  fetchAssistantInvoiceList,
  fetchAssistantInvoicesByDateRange,
  fetchCollectedInvoicesBreakdownInUtcWindow,
  searchAssistantInvoicesByCustomerName,
  type AssistantInvoiceListFilter,
  type AssistantInvoiceStatusFilter,
} from '@/lib/invoices/assistant-invoice-queries';
import {
  assistantDuplicateInvoice,
  assistantResendInvoiceReminder,
  assistantSendInvoice,
  assistantVoidInvoice,
} from '@/lib/invoices/assistant-invoice-actions';
import {
  collectedMetricFetchStartIso,
  dashboardPresetForRevenueSpec,
  loadCollectedRevenueMetricForBusiness,
} from '@/lib/payments/collected-revenue-metric';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import {
  computeMissingFields,
  getNextMissingInvoiceField,
  resolveWizardStep,
} from '@/lib/invoices/conversational-invoice-wizard/state-machine';
import type {
  AssistantClientNavigate,
  AssistantOpenRecordPayment,
  AssistantQuickReply,
  AssistantStructuredBody,
  InvoiceAssistantChatCard,
  InvoiceWizardDraft,
  InvoiceWizardResponse,
  PendingAssistantInvoice,
} from '@/lib/invoices/conversational-invoice-wizard/types';

export type InvoiceAssistantPipelineParams = {
  supabase: SupabaseClient;
  user: User;
  businessId: string;
  sessionId: string;
  draft: InvoiceWizardDraft;
  userText: string;
  pending: PendingAssistantInvoice | null;
  customerMatch: InvoiceWizardResponse['customer_match'];
  customerNeedsDisambiguation: boolean;
  role: BusinessRole;
  reportingCurrency: string;
  /** Dashboard / browser IANA zone for calendar weeks and payment windows */
  workspaceTimezone?: string | null;
};

/**
 * Short follow-ups after invoice creation (“send it”, “view it”) — matched before generic routing fallback.
 */
export function parseRecentInvoicePronounFollowUp(text: string): 'send' | 'view' | 'edit' | null {
  const t = text.trim();
  if (!t || t.length > 48) return null;
  if (/^(send|ship|mail)\s+it\.?$/i.test(t)) return 'send';
  if (/^email\s+it\.?$/i.test(t)) return 'send';
  if (/^(view|open|show)\s+it\.?$/i.test(t)) return 'view';
  if (/^edit\s+it\.?$/i.test(t)) return 'edit';
  return null;
}

function fmtMoney(n: number, currency: string) {
  return formatCurrencyAmount(Number(n) || 0, currency);
}

function dailyBriefStatusSentences(opts: {
  dueToday: number;
  unpaid: number;
  drafts: number;
  paymentsTodayBase: number;
  baseCur: string;
}): string[] {
  const { dueToday, unpaid, drafts, paymentsTodayBase, baseCur } = opts;
  const lines: string[] = [];
  lines.push(
    dueToday === 0
      ? "Nothing is due today — you're clear on deadlines."
      : dueToday === 1
        ? 'You have **1 invoice** due today.'
        : `You have **${dueToday} invoices** due today.`
  );
  lines.push(
    unpaid === 0
      ? 'No unpaid invoices showing — nice work staying on top of balances.'
      : unpaid === 1
        ? 'You have **1 unpaid invoice** that needs attention.'
        : `You have **${unpaid} unpaid invoices** that need attention.`
  );
  lines.push(
    drafts === 0
      ? 'No draft invoices sitting in the queue.'
      : drafts === 1
        ? 'You have **1 draft invoice** ready to send.'
        : `You have **${drafts} draft invoices** ready to send.`
  );
  if (paymentsTodayBase > 0.0001) {
    lines.push(`You've collected **${fmtMoney(paymentsTodayBase, baseCur)}** today.`);
  } else {
    lines.push('Nothing new landed in collections today — quiet on incoming payments.');
  }
  return lines;
}

function dailyBriefTopActionsLines(
  ranked: RankedOverdueFollowUpResult | null,
  overdueAggregate: number
): string[] {
  const out: string[] = ['**Top actions**'];
  if (overdueAggregate === 0) {
    out.push('• No overdue invoices to chase today.');
    return out;
  }
  out.push(
    overdueAggregate === 1
      ? '• **1 overdue invoice** needs follow-up.'
      : `• **${overdueAggregate} overdue invoices** need follow-up.`
  );
  if (!ranked || ranked.lines.length === 0) {
    out.push(
      '• Say **show all overdue invoices** to pull up the full list.'
    );
    return out;
  }
  for (const l of ranked.lines) {
    out.push(`• Follow up on **${l.label}** — ${l.reason}`);
  }
  if (ranked.hiddenCount > 0) {
    out.push(`• **${ranked.hiddenCount}** more overdue ${ranked.hiddenCount === 1 ? 'invoice' : 'invoices'} not listed here.`);
  } else if (ranked.invoiceScanTruncated) {
    out.push('• Some older rows may sit outside this snapshot.');
  }
  return out;
}

/** Dashboard-equivalent “Collected” for the workspace calendar day (payment ledger; stored FX). */
async function loadPaymentsReceivedTodayInBase(
  supabase: SupabaseClient,
  businessId: string,
  reportingCurrency: string,
  workspaceTimezone?: string | null
): Promise<number> {
  const utc = resolveAssistantPaidUtcWindow('today', new Date(), workspaceTimezone);
  if (!utc) return 0;
  const paymentsRange = paidUtcToResolvedPaymentsShape(utc);
  const fetchStartIso = collectedMetricFetchStartIso(
    { kind: 'today' },
    workspaceTimezone,
    new Date()
  );
  const baseCur = reportingCurrency.trim().toUpperCase() || 'USD';
  const collected = await loadCollectedRevenueMetricForBusiness(supabase, businessId, baseCur, {
    fetchStartIso,
    paymentsWindow: paymentsRange,
    surface: 'assistant',
    timezone: workspaceTimezone,
    dashboardPreset: null,
  });
  if ('error' in collected) {
    console.warn('[assistant-invoice] daily_briefing_payments_today', collected.error);
    return 0;
  }
  return collected.totalBase;
}

async function loadAssistantOpenRecordPayment(
  supabase: SupabaseClient,
  businessId: string,
  invoiceId: string
): Promise<{ ok: true; payload: AssistantOpenRecordPayment } | { ok: false; message: string }> {
  const { data: row, error } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, customer_name, status, total, amount_paid, balance_due, currency, issue_date, use_payment_schedule, total_refunded'
    )
    .eq('id', invoiceId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, message: 'I couldn’t find that invoice.' };
  }

  const r = row as Record<string, unknown>;
  const status = String(r.status ?? '');
  if (status === 'voided') {
    return { ok: false, message: 'This invoice is voided and can’t receive payments.' };
  }
  if (status === 'paid') {
    return { ok: false, message: 'This invoice is already paid.' };
  }

  const total = Number(r.total ?? 0);
  const amountPaid = Number(r.amount_paid ?? 0);
  const totalRefunded = Number(r.total_refunded ?? 0);
  const prevBalance = resolveInvoiceBalanceDue({
    status,
    total,
    amount_paid: amountPaid,
    total_refunded: totalRefunded,
  });

  if (prevBalance <= 0.02) {
    return { ok: false, message: 'This invoice has no remaining balance.' };
  }

  const issueYmd =
    r.issue_date != null && String(r.issue_date).trim().length >= 10
      ? String(r.issue_date).trim().slice(0, 10)
      : null;

  const invNum =
    r.invoice_number != null && String(r.invoice_number).trim()
      ? String(r.invoice_number).trim()
      : null;
  const cust =
    r.customer_name != null && String(r.customer_name).trim()
      ? String(r.customer_name).trim()
      : null;
  const cur = r.currency != null ? String(r.currency).trim().toUpperCase() : null;

  const useSchedule = Boolean(r.use_payment_schedule);

  if (useSchedule) {
    const { data: schedRows, error: se } = await supabase
      .from('invoice_payment_schedule_items')
      .select('id, amount, status, due_date')
      .eq('invoice_id', invoiceId)
      .order('due_date', { ascending: true });

    if (se || !schedRows?.length) {
      return {
        ok: false,
        message:
          'This invoice uses a payment schedule but installments aren’t available here. Open it from **Invoices** to record a payment.',
      };
    }

    const pending = schedRows.find(
      (x) => String((x as { status?: string }).status ?? 'pending').toLowerCase() !== 'paid'
    );
    if (!pending) {
      return { ok: false, message: 'All installments are already recorded as paid.' };
    }

    const rowAmt = Number((pending as { amount?: number }).amount ?? 0);
    const sid = String((pending as { id: string }).id);

    return {
      ok: true,
      payload: {
        invoice_id: invoiceId,
        invoice_number: invNum,
        customer_name: cust,
        currency: cur,
        issue_date: issueYmd,
        mode: 'installment',
        amount: rowAmt,
        remaining_balance: prevBalance,
        schedule_item_id: sid,
      },
    };
  }

  return {
    ok: true,
    payload: {
      invoice_id: invoiceId,
      invoice_number: invNum,
      customer_name: cust,
      currency: cur,
      issue_date: issueYmd,
      mode: 'full',
      amount: prevBalance,
      remaining_balance: prevBalance,
      schedule_item_id: null,
    },
  };
}

function shell(
  p: InvoiceAssistantPipelineParams,
  partial: {
    assistant_lines?: string[];
    assistant_post_card_lines?: string[] | null;
    assistant_structured?: AssistantStructuredBody | null;
    chat_cards: InvoiceAssistantChatCard[] | null;
    pending_invoice_lookup: PendingAssistantInvoice | null;
    error?: string | null;
    quick_replies?: AssistantQuickReply[] | null;
    metric_session_context?: AssistantMetricSessionContext | null;
    client_navigate?: AssistantClientNavigate | null;
    open_record_payment?: AssistantOpenRecordPayment | null;
  }
): InvoiceWizardResponse {
  const assistant_structured = partial.assistant_structured ?? null;
  const assistant_lines = assistant_structured ? [] : (partial.assistant_lines ?? []);
  return buildWizardShellResponse({
    sessionId: p.sessionId,
    draft: p.draft,
    customerMatch: p.customerMatch,
    customerNeedsDisambiguation: p.customerNeedsDisambiguation,
    assistant_lines,
    assistant_post_card_lines: partial.assistant_post_card_lines,
    assistant_structured,
    error: partial.error ?? null,
    chat_cards: partial.chat_cards,
    quick_replies: partial.quick_replies ?? null,
    pending_invoice_lookup: partial.pending_invoice_lookup,
    metric_session_context: partial.metric_session_context ?? null,
    client_navigate: partial.client_navigate ?? null,
    open_record_payment: partial.open_record_payment ?? null,
  });
}

function statusFilterListTitle(f: AssistantInvoiceListFilter): string {
  switch (f) {
    case 'partially_paid':
      return 'Partially paid invoices';
    case 'unpaid':
      return 'Unpaid invoices';
    case 'overdue':
      return 'Overdue invoices';
    case 'due_today':
      return 'Invoices due today';
    case 'draft':
      return 'Draft invoices';
    default:
      return 'Paid invoices';
  }
}

function listThemChipMessage(f: AssistantInvoiceStatusFilter): string {
  switch (f) {
    case 'partially_paid':
      return 'List my partially paid invoices';
    case 'unpaid':
      return 'List my unpaid invoices';
    case 'overdue':
      return 'List my overdue invoices';
    default:
      return 'List my paid invoices';
  }
}

async function resolveSingleInvoiceId(
  supabase: SupabaseClient,
  businessId: string,
  ref: NonNullable<ReturnType<typeof parseInvoiceReferenceFromText>>
): Promise<string | null> {
  const matches = await findInvoicesByReference(supabase, businessId, ref);
  if (matches.length === 1) return matches[0]!.id;
  return null;
}

async function handleViewEdit(
  p: InvoiceAssistantPipelineParams,
  intent: 'edit_invoice' | 'view_invoice',
  ref: ReturnType<typeof parseInvoiceReferenceFromText>
): Promise<InvoiceWizardResponse> {
  if (!ref) {
    return shell(p, {
      assistant_lines: [INVOICE_REF_PROMPT],
      chat_cards: null,
      pending_invoice_lookup: { kind: 'invoice_ref', subkind: 'view_edit', intent },
    });
  }

  const matches = await findInvoicesByReference(p.supabase, p.businessId, ref);

  if (matches.length === 0) {
    return shell(p, {
      assistant_lines: [INVOICE_NOT_FOUND_HELP],
      chat_cards: null,
      pending_invoice_lookup: null,
    });
  }

  return handleViewEditForRows(p, intent, matches);
}

async function handleViewEditForRows(
  p: InvoiceAssistantPipelineParams,
  intent: 'edit_invoice' | 'view_invoice',
  matches: InvoiceLookupRow[]
): Promise<InvoiceWizardResponse> {
  const cards = buildInvoiceLookupChatCards(matches, p.role, { intentOverride: intent });
  if (!cards) {
    return shell(p, {
      assistant_lines: [INVOICE_NOT_FOUND_HELP],
      chat_cards: null,
      pending_invoice_lookup: null,
    });
  }

  const lines = matches.length > 1 ? [INVOICE_MULTI_REF_CLARIFY] : [];

  return shell(p, {
    assistant_lines: lines,
    chat_cards: cards,
    pending_invoice_lookup: null,
  });
}

async function runInvoiceAction(
  p: InvoiceAssistantPipelineParams,
  action: 'mark_paid' | 'send' | 'resend' | 'duplicate' | 'void',
  invoiceId: string
): Promise<InvoiceWizardResponse> {
  const uid = p.user.id;
  let result: {
    ok: boolean;
    message: string;
    newInvoiceId?: string;
    newInvoiceNumber?: string;
    chat_cards?: InvoiceAssistantChatCard[];
    quick_replies?: AssistantQuickReply[];
  };

  switch (action) {
    case 'mark_paid': {
      const loaded = await loadAssistantOpenRecordPayment(p.supabase, p.businessId, invoiceId);
      if (!loaded.ok) {
        return shell(p, {
          assistant_lines: [loaded.message],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const { payload } = loaded;
      const invLabel = payload.invoice_number?.trim() || 'this invoice';
      const line =
        payload.mode === 'installment'
          ? `Record the next installment for **${invLabel}** — confirm details in the form below.`
          : `Record payment for **${invLabel}** — confirm amount, payment date, and method in the form below.`;
      return shell(p, {
        assistant_lines: [line],
        chat_cards: null,
        pending_invoice_lookup: null,
        open_record_payment: payload,
      });
    }
    case 'void':
      result = await assistantVoidInvoice(p.supabase, {
        businessId: p.businessId,
        userId: uid,
        invoiceId,
      });
      break;
    case 'duplicate':
      result = await assistantDuplicateInvoice(p.supabase, {
        businessId: p.businessId,
        userId: uid,
        sourceInvoiceId: invoiceId,
      });
      break;
    case 'send':
      result = await assistantSendInvoice(p.supabase, { businessId: p.businessId, invoiceId });
      break;
    case 'resend':
      result = await assistantResendInvoiceReminder(p.supabase, {
        businessId: p.businessId,
        invoiceId,
      });
      break;
    default:
      result = { ok: false, message: 'That action isn’t available yet.' };
  }

  const mergedCards: InvoiceAssistantChatCard[] = [];
  if (result.ok && result.newInvoiceId) {
    mergedCards.push({
      card_type: 'invoice_single',
      intent: 'view_invoice',
      invoice_id: result.newInvoiceId,
      invoice_number: result.newInvoiceNumber ?? null,
      customer_name: null,
      total: null,
      currency: null,
      status: 'draft',
      primary_action: 'view_invoice',
      headline: 'Invoice found',
      helper_text: 'This invoice is still in draft, so you can edit it before sending.',
      display_edit_secondary: true,
    });
  }
  if (result.ok && result.chat_cards?.length) {
    mergedCards.push(...result.chat_cards);
  }
  const cards: InvoiceAssistantChatCard[] | null = mergedCards.length ? mergedCards : null;

  const assistant_lines =
    result.message.trim().length > 0 ? [result.message] : [];

  return shell(p, {
    assistant_lines,
    chat_cards: cards,
    quick_replies: result.ok ? result.quick_replies ?? null : null,
    pending_invoice_lookup: null,
  });
}

/**
 * When the client echoes `recentCreatedInvoice`, resolve “send/view/edit it” before structured fallback.
 */
export async function tryRecentCreatedInvoiceFollowUp(
  ctx: AssistantRouterContext
): Promise<InvoiceWizardResponse | null> {
  const rid = ctx.recentCreatedInvoice?.invoice_id?.trim();
  if (!rid) return null;
  const follow = parseRecentInvoicePronounFollowUp(ctx.userText);
  if (!follow) return null;

  const p: InvoiceAssistantPipelineParams = {
    supabase: ctx.supabase,
    user: ctx.user,
    businessId: ctx.businessId,
    sessionId: ctx.sessionId,
    draft: ctx.draft,
    userText: ctx.userText,
    pending: ctx.pendingInvoiceLookup,
    customerMatch: ctx.customerMatch,
    customerNeedsDisambiguation: ctx.customerNeedsDisambiguation,
    role: ctx.role,
    reportingCurrency: ctx.reportingCurrency,
    workspaceTimezone: ctx.workspaceTimezone,
  };

  const row = await fetchInvoiceLookupRowById(ctx.supabase, ctx.businessId, rid);
  if (!row) {
    return shell(p, {
      assistant_lines: [
        'I couldn’t find that invoice anymore—or your session moved on. Say **create invoice** to start a new one.',
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
    });
  }

  if (follow === 'send') {
    return runInvoiceAction(p, 'send', row.id);
  }
  return handleViewEditForRows(p, follow === 'view' ? 'view_invoice' : 'edit_invoice', [row]);
}

/**
 * Full invoice assistant: retrieval, lists, insights, actions, view/edit.
 * Returns null only when the message should fall through to create-invoice wizard extraction.
 */
export async function runInvoiceAssistantPipeline(
  p: InvoiceAssistantPipelineParams
): Promise<InvoiceWizardResponse | null> {
  const trimmed = p.userText.trim();
  if (!trimmed) return null;
  if (textLooksLikeCreateInvoiceFlow(trimmed)) {
    /** Route clears draft before this turn; let extraction parse the new customer + lines. */
    if (shouldResetDraftForNewInvoiceIntent(trimmed)) {
      return null;
    }
    const step = resolveWizardStep(p.draft, {
      customerNeedsDisambiguation: p.customerNeedsDisambiguation,
    });
    const missing = computeMissingFields(p.draft);
    const stillBuilding =
      step !== 'SUCCESS' && (missing.length > 0 || step !== 'CONFIRM');
    if (stillBuilding) {
      const lines: string[] = [ASSISTANT_ALREADY_CREATING_INVOICE];
      const next = getNextMissingInvoiceField(p.draft);
      if (next) lines.push(wizardSingleMissingPrompt(next));
      else if (step === 'CONFIRM') lines.push(WIZARD_CONFIRM_LINE);
      return shell(p, {
        assistant_lines: lines,
        chat_cards: null,
        pending_invoice_lookup: null,
      });
    }
    return null;
  }

  // Lock invoice sidebar intents while new-customer optional onboarding is in progress.
  if (
    p.draft.isNewCustomer &&
    p.draft.customerEmail.trim() &&
    !p.draft.newCustomerOptionalStepDone &&
    !p.draft.customerId
  ) {
    return null;
  }

  // Pending: finish view/edit or action with invoice ref from this message
  if (p.pending?.kind === 'invoice_ref') {
    const ref =
      extractInvoiceRefForLookup(trimmed) || parseInvoiceReferenceFromText(trimmed);

    if (p.pending.subkind === 'view_edit') {
      if (!ref) {
        return shell(p, {
          assistant_lines: [INVOICE_REF_PROMPT],
          chat_cards: null,
          pending_invoice_lookup: p.pending,
        });
      }
      return handleViewEdit(p, p.pending.intent, ref);
    }

    if (p.pending.subkind === 'action') {
      if (!ref) {
        return shell(p, {
          assistant_lines: [invoiceRefPromptForPendingAction(p.pending.action)],
          chat_cards: null,
          pending_invoice_lookup: p.pending,
        });
      }
      const id = await resolveSingleInvoiceId(p.supabase, p.businessId, ref);
      if (!id) {
        return shell(p, {
          assistant_lines: [INVOICE_SINGLE_REF_MISMATCH],
          chat_cards: null,
          pending_invoice_lookup: p.pending,
        });
      }
      return runInvoiceAction(p, p.pending.action, id);
    }
  }

  if (/^open\s+overdue\s+invoices?\s+in\s+the\s+app\.?$/i.test(trimmed)) {
    return shell(p, {
      assistant_lines: ['Opening your invoices (past due).'],
      chat_cards: null,
      pending_invoice_lookup: null,
      client_navigate: { href: '/dashboard/invoices?status=overdue' },
    });
  }
  if (
    /^draft\s+payment\s+reminders?\s+for\s+overdue\s+invoices?\.?$/i.test(trimmed) ||
    /^draft\s+reminders?\.?$/i.test(trimmed)
  ) {
    return shell(p, {
      assistant_lines: [
        'Use **Send reminder** on an invoice, or say **Resend invoice INV-001** here for a specific number.',
        'Say **Show all overdue invoices** when you want the full list.',
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
    });
  }
  if (/^help\s+send\s+drafts?\.?$/i.test(trimmed)) {
    return shell(p, {
      assistant_lines: [
        'Open a draft from **Invoices** (or say **Show drafts** here), review line items, then hit **Send**.',
        'Need a new invoice instead? Say **create invoice** to start fresh.',
      ],
      chat_cards: null,
      pending_invoice_lookup: null,
    });
  }

  const resolved = resolveInvoiceAssistantIntent(trimmed);
  if (!resolved) return null;
  console.info('[assistant-invoice] resolved_intent', { userText: trimmed, resolved });

  switch (resolved.type) {
    case 'view_edit':
      return handleViewEdit(p, resolved.intent, resolved.ref);

    case 'unpaid_snapshot': {
      const baseCur = p.reportingCurrency.trim().toUpperCase() || 'USD';
      const [counts, agg] = await Promise.all([
        aggregateAssistantDailyBusinessPriorityCounts(
          p.supabase,
          p.businessId,
          p.workspaceTimezone,
          baseCur
        ),
        aggregateAssistantInvoiceInsights(p.supabase, p.businessId, {
          metric: 'total_unpaid',
          reportingCurrency: p.reportingCurrency,
          workspaceTimezone: p.workspaceTimezone,
        }),
      ]);
      const { overdue, dueToday, truncated } = counts;
      const amountLabel =
        agg.currency === 'MIXED'
          ? 'Multiple currencies — use **Show unpaid invoices** for amounts per invoice.'
          : `${fmtMoney(agg.total, agg.currency)} outstanding`;
      const upcoming = Math.max(0, agg.count - overdue - dueToday);
      const lines: string[] = [
        assistantBoldLine(`${agg.count} invoice${agg.count === 1 ? '' : 's'} · ${amountLabel}`),
        assistantBoldLine(`Overdue — ${overdue}`),
        assistantBoldLine(`Due today — ${dueToday}`),
        assistantBoldLine(`Upcoming — ${upcoming}`),
      ];
      if (truncated) {
        lines.push(
          'Counts use your most recent invoices; totals may omit older open items until you open **Invoices**.'
        );
      }
      const chips: AssistantQuickReply[] = [
        { label: 'Show overdue', message: 'Show overdue invoices' },
        { label: 'Show unpaid', message: 'Show unpaid invoices' },
        { label: 'Due today', message: 'Show due today' },
      ];
      return shell(p, {
        assistant_structured: {
          title: assistantBoldLine('Unpaid invoices'),
          lines,
        },
        chat_cards: null,
        pending_invoice_lookup: null,
        quick_replies: chips,
      });
    }

    case 'daily_business_summary': {
      const baseCur = p.reportingCurrency.trim().toUpperCase() || 'USD';
      const [counts, paymentsTodayBase] = await Promise.all([
        aggregateAssistantDailyBusinessPriorityCounts(
          p.supabase,
          p.businessId,
          p.workspaceTimezone,
          baseCur
        ),
        loadPaymentsReceivedTodayInBase(p.supabase, p.businessId, p.reportingCurrency, p.workspaceTimezone),
      ]);
      const { overdue, dueToday, unpaid, drafts, truncated } = counts;
      const ranked =
        overdue > 0
          ? await fetchRankedOverdueFollowUps(
              p.supabase,
              p.businessId,
              p.reportingCurrency,
              p.workspaceTimezone
            )
          : null;

      const statusLines = dailyBriefStatusSentences({
        dueToday,
        unpaid,
        drafts,
        paymentsTodayBase,
        baseCur,
      });
      const topActionsLines = dailyBriefTopActionsLines(ranked, overdue);

      const teaserPending: PendingAssistantInvoice | null =
        ranked && ranked.hiddenCount > 0
          ? {
              kind: 'overdue_followup_teaser',
              totalOverdue: ranked.totalOverdue,
              hiddenCount: ranked.hiddenCount,
            }
          : null;

      const lines = [
        ...statusLines,
        ...topActionsLines,
        ...(truncated
          ? [
              'I’m working from your most recent invoices — say **show all overdue** or **show drafts** if you need the full picture.',
            ]
          : []),
        'Want me to open overdue invoices or help send drafts?',
      ];

      const priorityChips: AssistantQuickReply[] = [
        { label: 'Open overdue', message: 'Open overdue invoices in the app' },
        { label: 'Help send drafts', message: 'Help send drafts' },
        { label: 'Show all overdue', message: 'Show all overdue invoices' },
        { label: 'Show due today', message: 'Show due today' },
        { label: 'Show unpaid', message: 'Show unpaid invoices' },
        { label: 'Show drafts', message: 'Show drafts' },
      ];

      return shell(p, {
        assistant_structured: { title: "Today's priorities", lines },
        chat_cards: null,
        pending_invoice_lookup: teaserPending,
        quick_replies: priorityChips,
      });
    }

    case 'paid_in_period': {
      const pr = resolveAssistantInvoicePeriodContext(
        resolved.period,
        new Date(),
        p.workspaceTimezone
      );
      if (!pr.ok) {
        return shell(p, {
          assistant_lines: [
            'Couldn’t read that time range. Try “this month”, “past 30 days”, or “last week”.',
          ],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const { utcWindow, humanRange } = pr.value;
      const paymentsRange = paidUtcToResolvedPaymentsShape(utcWindow);
      const collectedMetricSession = metricContextForRevenueWindow(paymentsRange, {
        currentIntent: 'revenue_collected_total',
        currentResultType: 'currency_summary',
      });
      const baseCur = p.reportingCurrency.trim().toUpperCase() || 'USD';
      console.info('[assistant-invoice] paid_period_window', {
        presentation: resolved.presentation,
        ...utcWindow,
        humanRange,
        baseCur,
      });

      const collectedTitle = `Collected from invoices (${humanRange})`;
      const scopePhrase = assistantRevenueScopePhraseForMessage(paymentsRange);
      const totalDrillDownChips: AssistantQuickReply[] = [
        { label: 'By customer', message: `Break down revenue by customer for ${scopePhrase}` },
        { label: 'By day', message: `Break down revenue by day for ${scopePhrase}` },
        { label: 'By invoice', message: revenuePeriodInvoiceListPrompt(paymentsRange) },
      ];
      const listDrillDownChips: AssistantQuickReply[] = [
        { label: 'By customer', message: `Break down revenue by customer for ${scopePhrase}` },
        {
          label: 'By month',
          message: `Break down collected revenue by calendar month for ${scopePhrase}`,
        },
        { label: 'By currency', message: `Show collected amounts by currency for ${scopePhrase}` },
      ];

      if (resolved.presentation === 'count') {
        const agg = await aggregatePaidInUtcWindow(p.supabase, p.businessId, utcWindow, baseCur);
        if (agg.invoiceCount === 0) {
          return shell(p, {
            assistant_lines: [
              `No collections from invoices were recorded in ${humanRange}.`,
            ],
            chat_cards: null,
            pending_invoice_lookup: null,
            metric_session_context: collectedMetricSession,
          });
        }
        const card: InvoiceAssistantChatCard = {
          card_type: 'insight_summary',
          title: collectedTitle,
          rows: [
            { label: 'Date range', value: humanRange },
            { label: 'Invoices with collections', value: String(agg.invoiceCount) },
          ],
        };
        return shell(p, {
          assistant_lines: [`Invoices with collection activity (${humanRange}):`],
          chat_cards: [card],
          pending_invoice_lookup: null,
          metric_session_context: collectedMetricSession,
        });
      }

      if (resolved.presentation === 'total') {
        const fetchStartIso =
          collectedMetricFetchStartIso(resolved.period, p.workspaceTimezone, new Date()) ||
          paymentsRange.startIso;

        const collected = await loadCollectedRevenueMetricForBusiness(
          p.supabase,
          p.businessId,
          baseCur,
          {
            fetchStartIso,
            paymentsWindow: paymentsRange,
            surface: 'assistant',
            timezone: p.workspaceTimezone,
            dashboardPreset: dashboardPresetForRevenueSpec(resolved.period),
          }
        );

        if ('error' in collected) {
        return shell(p, {
          assistant_lines: [`Couldn’t load that for ${humanRange}. Try again in a moment.`],
            chat_cards: null,
            pending_invoice_lookup: null,
            metric_session_context: collectedMetricSession,
          });
        }

        if (collected.totalBase <= 0.0001 && collected.byCurrency.length === 0) {
          return shell(p, {
            assistant_lines: [
              `Nothing was collected from invoices in ${humanRange}.`,
            ],
            chat_cards: null,
            pending_invoice_lookup: null,
            metric_session_context: collectedMetricSession,
          });
        }

        return shell(p, {
          assistant_structured: revenueCollectedSummaryStructured(paymentsRange, {
            formatMoney: fmtMoney,
            totalAmount: collected.totalBase,
            displayCurrency: baseCur,
            baseCurrency: baseCur,
            byCurrency: collected.byCurrency,
          }),
          chat_cards: null,
          pending_invoice_lookup: null,
          quick_replies: totalDrillDownChips,
          metric_session_context: collectedMetricSession,
        });
      }

      const rows = await fetchCollectedInvoicesBreakdownInUtcWindow(
        p.supabase,
        p.businessId,
        utcWindow,
        baseCur,
        40
      );
      if (rows.length === 0) {
        return shell(p, {
          assistant_lines: [
            `No collections from invoices in ${humanRange}.`,
          ],
          chat_cards: null,
          pending_invoice_lookup: null,
          metric_session_context: collectedMetricSession,
        });
      }
      const agg = await aggregatePaidInUtcWindow(p.supabase, p.businessId, utcWindow, baseCur);
      const summaryLine =
        agg.totalCollectedInBase != null && agg.totalCollectedInBase > 0
          ? `Total collected (${baseCur}): ${fmtMoney(agg.totalCollectedInBase, baseCur)}`
          : null;

      const card: InvoiceAssistantChatCard = {
        card_type: 'invoice_list',
        title: collectedTitle,
        list_variant: 'paid_period',
        base_currency_code: baseCur,
        items: rows.map((m) => ({
          invoice_id: m.invoice_id,
          invoice_number: m.invoice_number,
          customer_name: m.customer_name,
          total: m.invoice_total,
          currency: m.invoice_currency,
          status: m.status,
          paid_at: m.paid_at,
          amount_in_base: m.receivedInBase,
          received_by_currency: m.receivedByCurrency,
          balance_due: m.balance_due,
        })),
      };
      const lines = [
        `Invoice collections (${humanRange}, by payment time — includes partial payments):`,
        ...(summaryLine ? [summaryLine] : []),
      ];
      return shell(p, {
        assistant_lines: lines,
        assistant_post_card_lines: [COLLECTED_INVOICE_LIST_FOLLOW_UP_QUESTION],
        chat_cards: [card],
        pending_invoice_lookup: null,
        quick_replies: listDrillDownChips,
        metric_session_context: collectedMetricSession,
      });
    }

    case 'unpaid_list':
    case 'list': {
      const listFilter: AssistantInvoiceListFilter =
        resolved.type === 'unpaid_list' ? 'unpaid' : resolved.filter;
      const listLimit = listFilter === 'overdue' ? 50 : 20;
      const rows = await fetchAssistantInvoiceList(p.supabase, p.businessId, {
        filter: listFilter,
        limit: listLimit,
        workspaceTimezone: p.workspaceTimezone,
        baseCurrencyCode: p.reportingCurrency,
      });
      if (rows.length === 0) {
        const empty =
          listFilter === 'overdue'
            ? 'No overdue invoices to chase today.'
            : listFilter === 'due_today'
              ? 'No invoices are due today with an open balance.'
              : listFilter === 'draft'
                ? 'No draft invoices right now.'
                : 'No unpaid invoices match that request.';
        return shell(p, {
          assistant_lines: [empty],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const card: InvoiceAssistantChatCard = {
        card_type: 'invoice_list',
        title: statusFilterListTitle(listFilter),
        list_variant: listFilter,
        base_currency_code: p.reportingCurrency.trim().toUpperCase() || 'USD',
        items: rows.map(assistantInvoiceListRowToChatItem),
      };
      return shell(p, {
        assistant_lines: [assistantListMatchesLine(rows.length)],
        chat_cards: [card],
        pending_invoice_lookup: null,
      });
    }

    case 'find_customer': {
      const rows = await searchAssistantInvoicesByCustomerName(
        p.supabase,
        p.businessId,
        resolved.query,
        20,
        { baseCurrencyCode: p.reportingCurrency }
      );
      if (rows.length === 0) {
        return shell(p, {
          assistant_lines: [
            `I couldn’t find invoices for “${resolved.query}”. Check the spelling or try the full customer name.`,
          ],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const card: InvoiceAssistantChatCard = {
        card_type: 'invoice_list',
        title: `Invoices for “${resolved.query}”`,
        list_variant: 'customer',
        base_currency_code: p.reportingCurrency.trim().toUpperCase() || 'USD',
        items: rows.map(assistantInvoiceListRowToChatItem),
      };
      return shell(p, {
        assistant_lines: [assistantListMatchesLine(rows.length)],
        chat_cards: [card],
        pending_invoice_lookup: null,
      });
    }

    case 'date_range': {
      const pr = resolveAssistantInvoicePeriodContext(
        resolved.period,
        new Date(),
        p.workspaceTimezone
      );
      if (!pr.ok) {
        return shell(p, {
          assistant_lines: ['Couldn’t read that date range. Try “this month” or “past 14 days”.'],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const { utcWindow, issueBounds, humanRange } = pr.value;

      if (resolved.field === 'paid') {
        console.info('[assistant-invoice] date_range_paid_window', {
          ...utcWindow,
          humanRange,
        });
        const drBase = p.reportingCurrency.trim().toUpperCase() || 'USD';
        const rows = await fetchCollectedInvoicesBreakdownInUtcWindow(
          p.supabase,
          p.businessId,
          utcWindow,
          drBase,
          40
        );
        if (rows.length === 0) {
          return shell(p, {
            assistant_lines: [
              `No collections from invoices in ${humanRange}.`,
            ],
            chat_cards: null,
            pending_invoice_lookup: null,
          });
        }
        const agg = await aggregatePaidInUtcWindow(p.supabase, p.businessId, utcWindow, drBase);
        const summaryLine =
          agg.totalCollectedInBase != null && agg.totalCollectedInBase > 0
            ? `Total collected (${drBase}): ${fmtMoney(agg.totalCollectedInBase, drBase)}`
            : null;
        const card: InvoiceAssistantChatCard = {
          card_type: 'invoice_list',
          title: `Collected from invoices (${humanRange})`,
          list_variant: 'paid_period',
          base_currency_code: drBase,
          items: rows.map((m) => ({
            invoice_id: m.invoice_id,
            invoice_number: m.invoice_number,
            customer_name: m.customer_name,
            total: m.invoice_total,
            currency: m.invoice_currency,
            status: m.status,
            paid_at: m.paid_at,
            amount_in_base: m.receivedInBase,
            received_by_currency: m.receivedByCurrency,
            balance_due: m.balance_due,
          })),
        };
        return shell(p, {
          assistant_lines: [
            `Invoice collections (${humanRange}, by payment time — includes partial payments):`,
            ...(summaryLine ? [summaryLine] : []),
          ],
          chat_cards: [card],
          pending_invoice_lookup: null,
        });
      }

      const rows = await fetchAssistantInvoicesByDateRange(
        p.supabase,
        p.businessId,
        issueBounds,
        resolved.field,
        25
      );
      if (rows.length === 0) {
        return shell(p, {
          assistant_lines: ['No invoices in that date range.'],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const card: InvoiceAssistantChatCard = {
        card_type: 'invoice_list',
        title: `Invoices (${humanRange})`,
        list_variant: 'date_range',
        items: rows.map((m) => ({
          invoice_id: m.id,
          invoice_number: m.invoice_number,
          customer_name: m.customer_name,
          total: m.total,
          currency: m.currency,
          status: m.status,
        })),
      };
      return shell(p, {
        assistant_lines: [
          `Invoices with ${resolved.field === 'issue' ? 'issue date' : 'created date'} in ${humanRange}:`,
        ],
        chat_cards: [card],
        pending_invoice_lookup: null,
      });
    }

    case 'balance_in_period': {
      const pr = resolveAssistantInvoicePeriodContext(
        resolved.period,
        new Date(),
        p.workspaceTimezone
      );
      if (!pr.ok) {
        return shell(p, {
          assistant_lines: ['Couldn’t read that time range. Try “this month” or “past 30 days”.'],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const { issueBounds, humanRange } = pr.value;
      const titleBase = resolved.filter === 'overdue' ? 'Overdue' : 'Unpaid';
      const periodTitle = `${titleBase} invoices due in ${humanRange}`;

      const agg = await aggregateAssistantBalanceInDueWindow(
        p.supabase,
        p.businessId,
        issueBounds,
        resolved.filter,
        undefined,
        {
          workspaceTimezone: p.workspaceTimezone,
          baseCurrencyCode: p.reportingCurrency,
        }
      );

      if (resolved.presentation === 'count') {
        if (agg.count === 0) {
          return shell(p, {
            assistant_lines: [
              resolved.filter === 'overdue'
                ? `No overdue invoices due in ${humanRange}.`
                : `No unpaid invoices due in ${humanRange}.`,
            ],
            chat_cards: null,
            pending_invoice_lookup: null,
          });
        }
        const card: InvoiceAssistantChatCard = {
          card_type: 'insight_summary',
          title: periodTitle,
          rows: [
            { label: 'Date range', value: humanRange },
            { label: 'Invoices', value: String(agg.count) },
            ...(agg.truncated ? [{ label: 'Note', value: 'Based on a limited sample of matching rows' }] : []),
          ],
        };
        return shell(p, {
          assistant_lines: [
            `${titleBase} invoices due in ${humanRange}`,
            `${agg.count} invoice${agg.count === 1 ? '' : 's'}`,
          ],
          chat_cards: [card],
          pending_invoice_lookup: null,
        });
      }

      if (resolved.presentation === 'total') {
        if (agg.count === 0 || agg.byCurrency.length === 0) {
          return shell(p, {
            assistant_lines: [
              resolved.filter === 'overdue'
                ? `No overdue balance found for invoices due in ${humanRange}.`
                : `No unpaid balance found for invoices due in ${humanRange}.`,
            ],
            chat_cards: null,
            pending_invoice_lookup: null,
          });
        }
        const rows = agg.byCurrency.map((x) => ({
          label: `Balance due (${x.currency})`,
          value: fmtMoney(x.amount, x.currency),
        }));
        rows.push(
          { label: 'Invoices counted', value: String(agg.count) },
          { label: 'Date range', value: humanRange }
        );
        if (agg.truncated) {
          rows.push({ label: 'Note', value: 'Based on recent matching rows' });
        }
        const card: InvoiceAssistantChatCard = {
          card_type: 'insight_summary',
          title: periodTitle,
          presentation: 'compact',
          rows,
        };
        return shell(p, {
          assistant_lines: [`Totals for invoices due in ${humanRange}:`],
          chat_cards: [card],
          pending_invoice_lookup: null,
        });
      }

      const listRows = agg.rows.slice(0, 40);
      if (listRows.length === 0) {
        return shell(p, {
          assistant_lines: [
            resolved.filter === 'overdue'
              ? `No overdue invoices due in ${humanRange}.`
              : `No unpaid invoices due in ${humanRange}.`,
          ],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const listCard: InvoiceAssistantChatCard = {
        card_type: 'invoice_list',
        title: periodTitle,
        list_variant: resolved.filter,
        base_currency_code: p.reportingCurrency.trim().toUpperCase() || 'USD',
        items: listRows.map(assistantInvoiceListRowToChatItem),
      };
        return shell(p, {
          assistant_lines: [
            `${titleBase} invoices due in ${humanRange}`,
            `${listRows.length} invoice${listRows.length === 1 ? '' : 's'}`,
          ],
        chat_cards: [listCard],
        pending_invoice_lookup: null,
      });
    }

    case 'insight': {
      const agg = await aggregateAssistantInvoiceInsights(p.supabase, p.businessId, {
        metric: resolved.metric,
        reportingCurrency: p.reportingCurrency,
        workspaceTimezone: p.workspaceTimezone,
      });
      const titles: Record<typeof resolved.metric, string> = {
        invoiced_today: 'Invoiced today',
        invoiced_this_week: 'Invoiced this week',
        invoiced_this_month: 'Invoiced this month',
        total_unpaid: 'Unpaid total',
        total_overdue: 'Overdue total',
      };
      const cur =
        agg.currency === 'MIXED'
          ? 'Multiple currencies — totals are not combined.'
          : fmtMoney(agg.total, agg.currency);
      const card: InvoiceAssistantChatCard = {
        card_type: 'insight_summary',
        title: titles[resolved.metric],
        rows: [
          { label: 'Amount', value: cur },
          { label: 'Invoices counted', value: String(agg.count) },
        ],
        ...(resolved.metric === 'total_overdue'
          ? { cta: { label: 'View Invoices', href: '/dashboard/invoices?status=overdue' } }
          : {}),
      };
      return shell(p, {
        assistant_lines: [`${titles[resolved.metric]}:`],
        chat_cards: [card],
        pending_invoice_lookup: null,
      });
    }

    case 'status_aggregate': {
      const f = resolved.filter;
      const agg = await aggregateAssistantInvoiceStatus(p.supabase, p.businessId, f, undefined, {
        workspaceTimezone: p.workspaceTimezone,
        baseCurrencyCode: p.reportingCurrency,
      });

      if (resolved.mode === 'count') {
        const n = agg.count;
        const adj =
          f === 'partially_paid'
            ? 'partially paid'
            : f === 'unpaid'
              ? 'unpaid'
              : f === 'overdue'
                ? 'overdue'
                : 'paid';
        const lines: string[] = [
          n === 0
            ? f === 'overdue'
              ? 'No overdue invoices to chase today.'
              : f === 'partially_paid'
                ? 'You don’t have any partially paid invoices right now.'
                : f === 'unpaid'
                  ? 'You don’t have any unpaid invoices with a balance right now.'
                  : 'You don’t have any paid invoices in the recent records I checked.'
            : `You have ${n} ${adj} invoice${n === 1 ? '' : 's'}.`,
        ];
        if (n > 0) lines.push('Want me to list them?');
        if (agg.truncated && n > 0) {
          lines.push('That count is from your most recent invoices; there may be more beyond that.');
        }
        const chips: AssistantQuickReply[] | null =
          n > 0 ? [{ label: 'List them', message: listThemChipMessage(f) }] : null;
        return shell(p, {
          assistant_lines: lines,
          chat_cards: null,
          pending_invoice_lookup: null,
          quick_replies: chips,
        });
      }

      if (resolved.mode === 'total') {
        if (agg.count === 0 || agg.byCurrency.length === 0) {
          return shell(p, {
            assistant_lines: ['Nothing matched that in recent invoices.'],
            chat_cards: null,
            pending_invoice_lookup: null,
          });
        }
        const valueLabel = f === 'paid' ? 'Invoice totals' : 'Balance due';
        const summaryRows = agg.byCurrency.map((x) => ({
          label: `${valueLabel} (${x.currency})`,
          value: fmtMoney(x.amount, x.currency),
        }));
        summaryRows.push({ label: 'Invoices counted', value: String(agg.count) });
        if (agg.truncated) {
          summaryRows.push({ label: 'Scope', value: 'Recent invoices only' });
        }
        const card: InvoiceAssistantChatCard = {
          card_type: 'insight_summary',
          title: statusFilterListTitle(f),
          presentation: 'compact',
          rows: summaryRows,
        };
        return shell(p, {
          assistant_lines: ['Totals across matching invoices:'],
          chat_cards: [card],
          pending_invoice_lookup: null,
        });
      }

      const rowsList = await fetchAssistantInvoiceList(p.supabase, p.businessId, {
        filter: f,
        limit: 20,
        workspaceTimezone: p.workspaceTimezone,
        baseCurrencyCode: p.reportingCurrency,
      });
      if (rowsList.length === 0) {
        const empty =
          f === 'overdue'
            ? 'No overdue invoices to chase today.'
            : f === 'partially_paid'
              ? 'No partially paid invoices right now.'
              : f === 'unpaid'
                ? 'No unpaid invoices match that request.'
                : 'No paid invoices match that request.';
        return shell(p, {
          assistant_lines: [empty],
          chat_cards: null,
          pending_invoice_lookup: null,
        });
      }
      const listCard: InvoiceAssistantChatCard = {
        card_type: 'invoice_list',
        title: statusFilterListTitle(f),
        list_variant: f,
        base_currency_code: p.reportingCurrency.trim().toUpperCase() || 'USD',
        items: rowsList.map(assistantInvoiceListRowToChatItem),
      };
      return shell(p, {
        assistant_lines: [assistantListMatchesLine(rowsList.length)],
        chat_cards: [listCard],
        pending_invoice_lookup: null,
      });
    }

    case 'action': {
      if (!resolved.ref) {
        return shell(p, {
          assistant_lines: [invoiceRefPromptForPendingAction(resolved.action)],
          chat_cards: null,
          pending_invoice_lookup: {
            kind: 'invoice_ref',
            subkind: 'action',
            action: resolved.action,
          },
        });
      }
      const id = await resolveSingleInvoiceId(p.supabase, p.businessId, resolved.ref);
      if (!id) {
        return shell(p, {
          assistant_lines: [INVOICE_SINGLE_REF_MISMATCH],
          chat_cards: null,
          pending_invoice_lookup: {
            kind: 'invoice_ref',
            subkind: 'action',
            action: resolved.action,
          },
        });
      }
      return runInvoiceAction(p, resolved.action, id);
    }

    default:
      return null;
  }
}
