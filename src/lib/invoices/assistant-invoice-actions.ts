import type { SupabaseClient } from '@supabase/supabase-js';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { paymentAmountInBase } from '@/lib/invoices/fx-snapshot';
import { createActivity, createPaymentActivity } from '@/lib/activity';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import { autoSendInvoiceIfEligible } from '@/lib/invoices/auto-send';
import { deliverInvoicePaymentReminder } from '@/lib/invoices/reminder-delivery';
import { buildInvoiceFxRow, resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { normalizeInvoiceAssignee } from '@/lib/invoices/invoice-time-summary';
import { normalizeInvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';
import { isLocked } from '@/lib/invoices/edit-rules';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import type {
  AssistantQuickReply,
  InvoiceAssistantChatCard,
} from '@/lib/invoices/conversational-invoice-wizard/types';

export type ActionResult =
  | {
      ok: true;
      message: string;
      chat_cards?: InvoiceAssistantChatCard[];
      quick_replies?: AssistantQuickReply[];
      newInvoiceId?: string;
      newInvoiceNumber?: string;
    }
  | { ok: false; message: string };

async function loadInvoiceRow(supabase: SupabaseClient, id: string, businessId: string) {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, status, total, amount_paid, balance_due, currency, exchange_rate_to_base, use_payment_schedule, customer_id, customer_name, customer_email'
    )
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

export async function assistantMarkInvoicePaid(
  supabase: SupabaseClient,
  opts: { businessId: string; userId: string; invoiceId: string }
): Promise<ActionResult> {
  const gate = await assertBusinessPermission(supabase, opts.businessId, opts.userId, 'manage_payments');
  if (!gate.ok) return { ok: false, message: 'You don’t have permission to record payments.' };

  const invoice = await loadInvoiceRow(supabase, opts.invoiceId, opts.businessId);
  if (!invoice) return { ok: false, message: 'I couldn’t find that invoice.' };

  if (Boolean(invoice.use_payment_schedule)) {
    return {
      ok: false,
      message:
        'This invoice uses a payment schedule. Open it in the app to record payments on each installment.',
    };
  }

  const status = String(invoice.status ?? '');
  if (status === 'voided' || status === 'paid') {
    return { ok: false, message: 'This invoice is already paid or voided.' };
  }

  const total = Number(invoice.total ?? 0);
  const prevPaid = Number(invoice.amount_paid ?? 0);
  const prevBalance = resolveInvoiceBalanceDue({
    status: String(invoice.status ?? ''),
    total,
    amount_paid: prevPaid,
  });
  if (prevBalance <= 0.02) {
    return { ok: false, message: 'This invoice has no remaining balance.' };
  }

  const amount = prevBalance;
  const invCur = String(invoice.currency ?? 'USD').toUpperCase();
  const invRate = Number(invoice.exchange_rate_to_base ?? 1);
  const payFx = paymentAmountInBase(amount, invCur, invCur, invRate > 0 ? invRate : 1, 1);
  const actorName = (await resolveActorDisplayName(supabase, opts.userId)) ?? 'User';
  const paidAtIso = new Date().toISOString();

  const { error: paymentInsertError } = await supabase.from('payments').insert({
    invoice_id: opts.invoiceId,
    business_id: opts.businessId,
    amount,
    currency: invCur,
    amount_in_base: payFx.amount_in_base,
    exchange_rate_to_base: invRate > 0 ? invRate : 1,
    amount_in_invoice_currency: payFx.amount_in_invoice_currency,
    exchange_rate_to_invoice: payFx.exchange_rate_to_invoice,
    method: 'other',
    status: 'succeeded',
    paid_at: paidAtIso,
    metadata: { source: 'assistant_mark_paid', note: 'Marked paid via Assistant' },
  });
  if (paymentInsertError) {
    console.error('[assistant-invoice-actions] payment insert', paymentInsertError);
    return { ok: false, message: 'Something went wrong while recording payment. Try again from the invoice page.' };
  }
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      amount_paid: prevPaid + amount,
      balance_due: 0,
      status: 'paid',
      paid_at: paidAtIso,
    })
    .eq('id', opts.invoiceId);
  if (updateError) {
    console.error('[assistant-invoice-actions] invoice update', updateError);
    return { ok: false, message: 'Couldn’t update the invoice. Please try from the invoice page.' };
  }

  const invoiceNumber = String(invoice.invoice_number ?? opts.invoiceId);
  await createPaymentActivity(supabase, {
    business_id: opts.businessId,
    invoice_id: opts.invoiceId,
    invoice_number: invoiceNumber,
    amount,
    currency: invCur,
    remaining_balance: 0,
    timestamp: paidAtIso,
    source_payment_id: `assistant:${opts.invoiceId}:${paidAtIso}`,
  });
  await createActivity(supabase, {
    business_id: opts.businessId,
    eventType: 'payment_received',
    title: `Invoice ${invoiceNumber} marked paid (Assistant)`,
    description: 'Full balance recorded via Assistant',
    entityType: 'invoice',
    entityId: opts.invoiceId,
    amount,
    currencyCode: invCur,
    metadata: { invoiceId: opts.invoiceId },
  });
  await logAuditEvent(supabase, {
    businessId: opts.businessId,
    entityType: 'invoice',
    entityId: opts.invoiceId,
    action: 'marked_paid',
    performedByUserId: opts.userId,
    performedByName: actorName,
    metadata: { invoice_number: invoiceNumber, source: 'assistant' },
  });

  return { ok: true, message: `Marked **${invoiceNumber}** as paid.` };
}

export async function assistantVoidInvoice(
  supabase: SupabaseClient,
  opts: { businessId: string; userId: string; invoiceId: string }
): Promise<ActionResult> {
  const gate = await assertBusinessPermission(supabase, opts.businessId, opts.userId, 'manage_invoices');
  if (!gate.ok) return { ok: false, message: 'You don’t have permission to void invoices.' };

  const invoice = await loadInvoiceRow(supabase, opts.invoiceId, opts.businessId);
  if (!invoice) return { ok: false, message: 'I couldn’t find that invoice.' };

  const status = String(invoice.status ?? '');
  if (status === 'voided' || status === 'paid') {
    return { ok: false, message: 'This invoice can’t be voided in its current state.' };
  }

  const { data: metaRow } = await supabase.from('invoices').select('metadata').eq('id', opts.invoiceId).single();
  const existingMeta = (metaRow?.metadata as Record<string, unknown>) ?? {};

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'voided',
      balance_due: 0,
      metadata: {
        ...existingMeta,
        voided_at: new Date().toISOString(),
        void_reason: 'Voided via Assistant',
      },
    })
    .eq('id', opts.invoiceId);
  if (error) {
    console.error('[assistant-invoice-actions] void', error);
    return { ok: false, message: 'Couldn’t void this invoice. Open it in the app to try again.' };
  }

  const actorName = (await resolveActorDisplayName(supabase, opts.userId)) ?? 'User';
  await logAuditEvent(supabase, {
    businessId: opts.businessId,
    entityType: 'invoice',
    entityId: opts.invoiceId,
    action: 'voided',
    performedByUserId: opts.userId,
    performedByName: actorName,
    metadata: { invoice_number: String(invoice.invoice_number ?? ''), source: 'assistant' },
  });

  return { ok: true, message: `**${String(invoice.invoice_number ?? '')}** has been voided.` };
}

export async function assistantDuplicateInvoice(
  supabase: SupabaseClient,
  opts: { businessId: string; userId: string; sourceInvoiceId: string }
): Promise<ActionResult & { newInvoiceId?: string; newInvoiceNumber?: string }> {
  const gate = await assertBusinessPermission(supabase, opts.businessId, opts.userId, 'create_invoice');
  if (!gate.ok) return { ok: false, message: 'You don’t have permission to create invoices.' };

  const { data: source } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), invoice_payment_schedule_items(*)')
    .eq('id', opts.sourceInvoiceId)
    .eq('business_id', opts.businessId)
    .single();

  if (!source) return { ok: false, message: 'I couldn’t find that invoice to duplicate.' };

  const actorName = (await resolveActorDisplayName(supabase, opts.userId)) ?? 'User';

  const { data: business } = await supabase.from('businesses').select('id, currency').eq('id', opts.businessId).single();
  if (!business) return { ok: false, message: 'Business not found.' };

  const baseCur = String((business as { currency?: string }).currency ?? 'USD').toUpperCase();
  const invCur = String((source as { currency?: string }).currency ?? baseCur).toUpperCase();
  const sub = Number((source as { subtotal?: number }).subtotal ?? 0);
  const tax = Number((source as { tax_amount?: number }).tax_amount ?? 0);
  const tot = Number((source as { total?: number }).total ?? 0);
  let fxRate = 1;
  try {
    fxRate = await resolveExchangeRateToBase(invCur, baseCur, null);
  } catch {
    if (invCur !== baseCur) {
      return { ok: false, message: 'Couldn’t resolve exchange rate for this currency.' };
    }
  }
  const fxRow = buildInvoiceFxRow(baseCur, fxRate, sub, tax, tot);

  const { data: invNum } = await supabase.rpc('next_invoice_number', { p_business_id: opts.businessId });
  const invoiceNumber = (invNum as string) ?? 'INV-00001';

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const sourceIssue = source.issue_date ? new Date(String(source.issue_date)) : null;
  const sourceDue = source.due_date ? new Date(String(source.due_date)) : null;
  let dayOffset = 30;
  if (sourceIssue && sourceDue && !Number.isNaN(sourceIssue.getTime()) && !Number.isNaN(sourceDue.getTime())) {
    dayOffset = Math.max(
      0,
      Math.round((sourceDue.getTime() - sourceIssue.getTime()) / (24 * 60 * 60 * 1000))
    );
  }
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + dayOffset);
  const dueIso = dueDate.toISOString().slice(0, 10);

  const { data: newInvoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      business_id: source.business_id,
      customer_id: source.customer_id,
      customer_name: source.customer_name,
      customer_email: source.customer_email,
      status: 'draft',
      invoice_number: invoiceNumber,
      issue_date: todayIso,
      due_date: dueIso,
      currency: invCur,
      ...fxRow,
      subtotal: source.subtotal,
      tax_amount: source.tax_amount,
      total: source.total,
      use_payment_schedule: !!source.use_payment_schedule,
      amount_paid: 0,
      balance_due: Number(source.total ?? 0),
      discount_amount: source.discount_amount ?? 0,
      reference_po: source.reference_po,
      notes: source.notes,
      terms: source.terms,
      theme_id: source.theme_id,
      template_id: normalizeInvoiceTemplateId((source as { template_id?: string | null }).template_id),
      metadata: source.metadata,
      use_customer_reminder_defaults:
        (source as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false,
      reminder_settings: (source as { reminder_settings?: unknown }).reminder_settings ?? null,
      show_time_summary: !!(source as { show_time_summary?: boolean }).show_time_summary,
    })
    .select()
    .single();

  if (invErr || !newInvoice) {
    console.error('[assistant-invoice-actions] duplicate insert', invErr);
    return { ok: false, message: 'Couldn’t duplicate the invoice. Try from the invoice menu.' };
  }

  const newId = String((newInvoice as { id: string }).id);
  const items = (source.invoice_items ?? []) as {
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    amount: number;
    unit_label?: string | null;
    tax_percent?: number;
    assignee?: string | null;
  }[];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await supabase.from('invoice_items').insert({
      invoice_id: newId,
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.amount,
      unit_label: normalizeInvoiceUnitLabel(item.unit_label ?? 'item'),
      sort_order: i,
      tax_percent: item.tax_percent ?? 0,
      assignee: normalizeInvoiceAssignee(item.assignee),
    });
  }

  const scheduleRows = (source.invoice_payment_schedule_items ?? []) as {
    description: string;
    amount: number;
    due_date: string;
  }[];
  for (const row of scheduleRows) {
    let duplicatedDueDate = row.due_date;
    if (row.due_date && sourceIssue && !Number.isNaN(sourceIssue.getTime())) {
      const sourceRowDue = new Date(row.due_date);
      if (!Number.isNaN(sourceRowDue.getTime())) {
        const diffDays = Math.round(
          (sourceRowDue.getTime() - sourceIssue.getTime()) / (24 * 60 * 60 * 1000)
        );
        const shifted = new Date(today);
        shifted.setDate(shifted.getDate() + Math.max(0, diffDays));
        duplicatedDueDate = shifted.toISOString().slice(0, 10);
      }
    }
    await supabase.from('invoice_payment_schedule_items').insert({
      invoice_id: newId,
      description: row.description,
      amount: Number(row.amount ?? 0),
      due_date: duplicatedDueDate,
      status: 'pending',
      paid_at: null,
    });
  }

  await createActivity(supabase, {
    business_id: opts.businessId,
    eventType: 'invoice_created',
    title: `Invoice ${invoiceNumber} created (duplicate)`,
    description: `Duplicated via Assistant from ${String(source.invoice_number ?? '')}`,
    entityType: 'invoice',
    entityId: newId,
    amount: Number(source.total ?? 0),
    currencyCode: invCur,
  });
  await logAuditEvent(supabase, {
    businessId: opts.businessId,
    entityType: 'invoice',
    entityId: newId,
    action: 'duplicated',
    performedByUserId: opts.userId,
    performedByName: actorName,
    metadata: {
      invoice_number: invoiceNumber,
      source_invoice_number: String(source.invoice_number ?? ''),
      source: 'assistant',
    },
  });

  return {
    ok: true,
    message: `Created duplicate **${invoiceNumber}** (draft).`,
    newInvoiceId: newId,
    newInvoiceNumber: invoiceNumber,
  };
}

export async function assistantSendInvoice(
  supabase: SupabaseClient,
  opts: { businessId: string; invoiceId: string }
): Promise<ActionResult> {
  const r = await autoSendInvoiceIfEligible(supabase, {
    invoiceId: opts.invoiceId,
    businessId: opts.businessId,
  });
  if (r.ok && !r.skipped) {
    const inv = await loadInvoiceRow(supabase, opts.invoiceId, opts.businessId);
    const invNum = String(inv?.invoice_number ?? '').trim() || 'Draft';
    const cust = String(inv?.customer_name ?? '').trim() || 'your customer';
    const card: InvoiceAssistantChatCard = {
      card_type: 'invoice_sent_success',
      invoice_id: opts.invoiceId,
      invoice_number: inv?.invoice_number != null ? String(inv.invoice_number) : null,
      customer_name: inv?.customer_name != null ? String(inv.customer_name) : null,
      reminder_followup_message: `Resend invoice ${invNum}`,
    };
    return {
      ok: true,
      message: '',
      chat_cards: [card],
    };
  }
  if (r.ok && r.skipped) {
    if (r.reason === 'already_sent') {
      return {
        ok: false,
        message:
          'That invoice was already sent. Say **resend invoice** with the number, or open it in the app.',
      };
    }
    if (r.reason === 'missing_customer_fields') {
      return { ok: false, message: 'Add a customer with email on the invoice before sending.' };
    }
    if (r.reason === 'invalid_total') {
      return { ok: false, message: 'Invoice total must be greater than zero to send.' };
    }
    return {
      ok: false,
      message: 'This invoice can’t be sent automatically. Open it and use Send from the invoice page.',
    };
  }
  return { ok: false, message: 'Couldn’t send the invoice. Try from the invoice page.' };
}

export async function assistantResendInvoiceReminder(
  supabase: SupabaseClient,
  opts: { businessId: string; invoiceId: string }
): Promise<ActionResult> {
  const invoice = await loadInvoiceRow(supabase, opts.invoiceId, opts.businessId);
  if (!invoice) return { ok: false, message: 'I couldn’t find that invoice.' };

  const status = deriveInvoiceStatus({
    status: String(invoice.status ?? ''),
    total: Number(invoice.total ?? 0),
    amount_paid: Number(invoice.amount_paid ?? 0),
    balance_due: resolveInvoiceBalanceDue({
      status: String(invoice.status ?? ''),
      total: Number(invoice.total ?? 0),
      amount_paid: Number(invoice.amount_paid ?? 0),
    }),
  });

  if (isLocked(status) || String(status).toLowerCase() === 'draft') {
    return { ok: false, message: 'This invoice can’t receive a payment reminder in its current state.' };
  }

  const result = await deliverInvoicePaymentReminder(supabase, {
    invoiceId: opts.invoiceId,
    ownerUserId: null,
    kind: 'manual',
  });

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.error === 'Customer email is required'
          ? 'Add a customer email on the invoice before resending.'
          : 'Couldn’t send the reminder. Try from the invoice page.',
    };
  }
  if (result.skipped) {
    if (result.reminder_type_label) {
      return {
        ok: true,
        message: `A “${result.reminder_type_label}” reminder was just sent. Try again in a moment if you need to resend.`,
      };
    }
    return { ok: true, message: 'Nothing to send — the balance may already be cleared, or payment reminders are off in settings.' };
  }
  const copyHint = result.reminder_type_label
    ? ` (using the “${result.reminder_type_label}” copy from Reminder emails settings).`
    : '.';
  return { ok: true, message: `Payment reminder sent to the customer${copyHint}` };
}
