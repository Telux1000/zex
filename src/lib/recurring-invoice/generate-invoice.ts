import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { normalizeInvoiceAssignee } from '@/lib/invoices/invoice-time-summary';
import { createActivity } from '@/lib/activity';
import { logAuditEvent } from '@/lib/audit-log';
import { buildInvoiceFxRow, resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';
import { recurringTemplateSnapshotSchema, type RecurringTemplateSnapshot } from '@/lib/recurring-invoice/types';
import { syncSavedLineItemsFromUsage } from '@/lib/saved-line-items/sync-saved-line-items';

function addDaysUtc(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseSnapshot(raw: unknown): RecurringTemplateSnapshot {
  const parsed = recurringTemplateSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Invalid recurring template snapshot');
  }
  return parsed.data;
}

export type CreateFromRecurringTemplateResult = {
  invoiceId: string;
  invoiceNumber: string;
};

/**
 * Inserts a new draft invoice (and items / optional payment schedule) from a frozen recurring template.
 * Mirrors `/api/invoices/duplicate` pricing and FX behaviour.
 */
export async function createInvoiceFromRecurringTemplate(
  supabase: SupabaseClient,
  input: {
    businessId: string;
    issueDateIso: string;
    templateSnapshot: unknown;
    recurringRuleId: string;
    actorUserId: string | null;
    actorName: string;
  }
): Promise<CreateFromRecurringTemplateResult> {
  const snap = parseSnapshot(input.templateSnapshot);

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('id', input.businessId)
    .single();
  if (!business) throw new Error('Business not found');

  if (snap.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('id')
      .eq('id', snap.customer_id)
      .eq('business_id', input.businessId)
      .maybeSingle();
    if (!cust) {
      throw new Error('Template customer no longer exists');
    }
  }

  const baseCur = String((business as { currency?: string }).currency ?? 'USD').toUpperCase();
  const invCur = snap.currency.toUpperCase();
  const sub = snap.subtotal;
  const tax = snap.tax_amount;
  const tot = snap.total;
  let fxRate = 1;
  try {
    fxRate = await resolveExchangeRateToBase(invCur, baseCur, null);
  } catch {
    if (invCur !== baseCur) {
      throw new Error('Could not resolve exchange rate for invoice currency');
    }
  }
  const fxRow = buildInvoiceFxRow(baseCur, fxRate, sub, tax, tot);

  const { data: invNum } = await supabase.rpc('next_invoice_number', {
    p_business_id: input.businessId,
  });
  const invoiceNumber = (invNum as string) ?? 'INV-00001';

  const issueDate = input.issueDateIso;
  const dueDate = addDaysUtc(issueDate, snap.issue_to_due_days);

  const { data: newInvoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      business_id: input.businessId,
      recurring_rule_id: input.recurringRuleId,
      customer_id: snap.customer_id,
      customer_name: snap.customer_id ? snap.customer_name : '',
      customer_email: snap.customer_email,
      status: 'draft',
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate,
      currency: invCur,
      ...fxRow,
      subtotal: snap.subtotal,
      tax_amount: snap.tax_amount,
      total: snap.total,
      use_payment_schedule: snap.use_payment_schedule && snap.payment_schedule_template.length > 0,
      amount_paid: 0,
      balance_due: snap.total,
      discount_amount: snap.discount_amount,
      reference_po: snap.reference_po ?? null,
      notes: snap.notes ?? null,
      terms: snap.terms ?? null,
      theme_id: snap.theme_id ?? null,
      template_id: snap.template_id ?? 'classic',
      metadata: snap.metadata ?? null,
      use_customer_reminder_defaults: snap.use_customer_reminder_defaults !== false,
      reminder_settings: snap.reminder_settings ?? null,
      show_time_summary: snap.show_time_summary ?? false,
    })
    .select()
    .single();

  if (invErr || !newInvoice) {
    throw new Error(invErr?.message ?? 'Failed to create invoice from recurring template');
  }

  for (let i = 0; i < snap.items.length; i++) {
    const item = snap.items[i];
    await supabase.from('invoice_items').insert({
      invoice_id: newInvoice.id,
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.amount,
      unit_label: normalizeInvoiceUnitLabel((item as { unit_label?: string }).unit_label ?? 'item'),
      sort_order: i,
      tax_percent: item.tax_percent ?? 0,
      assignee: normalizeInvoiceAssignee((item as { assignee?: unknown }).assignee),
    });
  }

  void syncSavedLineItemsFromUsage(supabase, {
    businessId: input.businessId,
    currency: invCur,
    items: snap.items.map((item) => ({
      name: item.name,
      description: item.description ?? null,
      unit_label: (item as { unit_label?: string | null }).unit_label,
      unit_price: item.unit_price,
      tax_percent: (item as { tax_percent?: number | null }).tax_percent ?? 0,
    })),
  }).catch((e) => console.error('[saved-line-items]', e));

  if (snap.use_payment_schedule && snap.payment_schedule_template.length > 0) {
    for (const row of snap.payment_schedule_template) {
      const rowDue = addDaysUtc(issueDate, row.days_from_issue);
      await supabase.from('invoice_payment_schedule_items').insert({
        invoice_id: newInvoice.id,
        description: row.description,
        amount: Number(row.amount ?? 0),
        due_date: rowDue,
        status: 'pending',
        paid_at: null,
      });
    }
  }

  await createActivity(supabase, {
    business_id: input.businessId,
    eventType: 'invoice_created',
    title: `Invoice ${invoiceNumber} created (recurring)`,
    description: `Generated from recurring rule`,
    entityType: 'invoice',
    entityId: newInvoice.id,
    amount: Number(snap.total ?? 0),
    currencyCode: invCur,
    metadata: { recurring_rule_id: input.recurringRuleId },
  });

  await logAuditEvent(supabase, {
    businessId: input.businessId,
    entityType: 'invoice',
    entityId: String(newInvoice.id),
    action: 'created',
    performedByUserId: input.actorUserId,
    performedByName: input.actorName,
    metadata: {
      invoice_number: invoiceNumber,
      source: 'recurring',
      recurring_rule_id: input.recurringRuleId,
    },
  });

  return { invoiceId: String(newInvoice.id), invoiceNumber };
}
