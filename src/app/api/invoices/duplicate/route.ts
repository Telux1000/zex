import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createActivity } from '@/lib/activity';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import { buildInvoiceFxRow, resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { normalizeInvoiceAssignee } from '@/lib/invoices/invoice-time-summary';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const sourceId = body.source_id ?? body.source_invoice_id;
  if (!sourceId) return NextResponse.json({ error: 'Missing source_id' }, { status: 400 });

  const { data: source } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), invoice_payment_schedule_items(*)')
    .eq('id', sourceId)
    .single();

  if (!source) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('id', source.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';

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
      return NextResponse.json(
        { error: 'Could not resolve exchange rate for duplicated currency.' },
        { status: 400 }
      );
    }
  }
  const fxRow = buildInvoiceFxRow(baseCur, fxRate, sub, tax, tot);

  const { data: invNum } = await supabase.rpc('next_invoice_number', {
    p_business_id: business.id,
  });
  const invoiceNumber = (invNum as string) ?? 'INV-00001';

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const sourceIssue = source.issue_date ? new Date(source.issue_date) : null;
  const sourceDue = source.due_date ? new Date(source.due_date) : null;
  let dayOffset = 30;
  if (sourceIssue && sourceDue && !Number.isNaN(sourceIssue.getTime()) && !Number.isNaN(sourceDue.getTime())) {
    const msPerDay = 24 * 60 * 60 * 1000;
    dayOffset = Math.max(0, Math.round((sourceDue.getTime() - sourceIssue.getTime()) / msPerDay));
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
      metadata: source.metadata,
      use_customer_reminder_defaults:
        (source as { use_customer_reminder_defaults?: boolean }).use_customer_reminder_defaults !== false,
      reminder_settings: (source as { reminder_settings?: unknown }).reminder_settings ?? null,
      show_time_summary: !!(source as { show_time_summary?: boolean }).show_time_summary,
    })
    .select()
    .single();

  if (invErr || !newInvoice) {
    return NextResponse.json({ error: invErr?.message ?? 'Failed to create duplicate' }, { status: 500 });
  }

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
      invoice_id: newInvoice.id,
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
  if (scheduleRows.length > 0) {
    for (const row of scheduleRows) {
      let duplicatedDueDate = row.due_date;
      if (row.due_date) {
        const sourceRowDue = new Date(row.due_date);
        const sourceIssueDate = sourceIssue && !Number.isNaN(sourceIssue.getTime()) ? sourceIssue : null;
        if (sourceIssueDate && !Number.isNaN(sourceRowDue.getTime())) {
          const diffDays = Math.round((sourceRowDue.getTime() - sourceIssueDate.getTime()) / (24 * 60 * 60 * 1000));
          const shifted = new Date(today);
          shifted.setDate(shifted.getDate() + Math.max(0, diffDays));
          duplicatedDueDate = shifted.toISOString().slice(0, 10);
        }
      }

      await supabase.from('invoice_payment_schedule_items').insert({
        invoice_id: newInvoice.id,
        description: row.description,
        amount: Number(row.amount ?? 0),
        due_date: duplicatedDueDate,
        status: 'pending',
        paid_at: null,
      });
    }
  }

  await createActivity(supabase, {
    business_id: business.id,
    eventType: 'invoice_created',
    title: `Invoice ${invoiceNumber} created (duplicate of ${source.invoice_number})`,
    description: `Duplicated from ${String(source.invoice_number)}`,
    entityType: 'invoice',
    entityId: newInvoice.id,
    amount: Number(source.total ?? 0),
    currencyCode: invCur,
  });

  await logAuditEvent(supabase, {
    businessId: business.id,
    entityType: 'invoice',
    entityId: String(newInvoice.id),
    action: 'duplicated',
    performedByUserId: user.id,
    performedByName: actorName,
    metadata: {
      invoice_number: invoiceNumber,
      source_invoice_number: String(source.invoice_number ?? ''),
    },
  });

  if (scheduleRows.length > 0) {
    await logAuditEvent(supabase, {
      businessId: business.id,
      entityType: 'invoice',
      entityId: String(newInvoice.id),
      action: 'payment_plan_created',
      performedByUserId: user.id,
      performedByName: actorName,
      metadata: { invoice_number: invoiceNumber, source: 'duplicate' },
    });
  }

  return NextResponse.json({ id: newInvoice.id, invoice_number: invoiceNumber });
}
