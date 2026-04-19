import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isLocked } from '@/lib/invoices/edit-rules';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { createPaymentActivity } from '@/lib/activity';
import { paymentAmountInBase } from '@/lib/invoices/fx-snapshot';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: invoiceId, scheduleId } = await params;

  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      'id, business_id, status, currency, exchange_rate_to_base, total, amount_paid, balance_due, total_refunded, invoice_number'
    )
    .eq('id', invoiceId)
    .single();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', invoice.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (isLocked(invoice.status)) {
    return NextResponse.json({ error: 'Paid and voided invoices cannot be modified.' }, { status: 403 });
  }

  const { data: row } = await supabase
    .from('invoice_payment_schedule_items')
    .select('*')
    .eq('id', scheduleId)
    .eq('invoice_id', invoiceId)
    .single();
  if (!row) return NextResponse.json({ error: 'Schedule row not found' }, { status: 404 });
  if (row.status === 'paid') return NextResponse.json({ ok: true });

  const rowAmount = Number(row.amount ?? 0);
  const amountPaid = Number(invoice.amount_paid ?? 0);
  const total = Number(invoice.total ?? 0);
  const totalRefunded = Number((invoice as { total_refunded?: number }).total_refunded ?? 0);
  const balanceDue = resolveInvoiceBalanceDue({
    status: String(invoice.status ?? ''),
    total,
    amount_paid: amountPaid,
    total_refunded: totalRefunded,
  });
  if (rowAmount <= 0) return NextResponse.json({ error: 'Invalid schedule amount.' }, { status: 400 });
  if (rowAmount - balanceDue > 0.02) {
    return NextResponse.json({ error: 'Cannot mark paid: would overpay invoice.' }, { status: 400 });
  }

  const invCur = String((invoice as { currency?: string }).currency ?? 'USD');
  const invRate = Number((invoice as { exchange_rate_to_base?: number }).exchange_rate_to_base ?? 1);
  const payFx = paymentAmountInBase(rowAmount, invCur, invCur, invRate, 1);
  const now = new Date().toISOString();

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      invoice_id: invoiceId,
      business_id: invoice.business_id,
      amount: rowAmount,
      currency: invCur,
      amount_in_base: payFx.amount_in_base,
      exchange_rate_to_base: invRate,
      amount_in_invoice_currency: payFx.amount_in_invoice_currency,
      exchange_rate_to_invoice: payFx.exchange_rate_to_invoice,
      method: 'schedule',
      status: 'succeeded',
      paid_at: now,
      metadata: { schedule_row_id: row.id },
    })
    .select()
    .single();
  if (payErr || !payment) return NextResponse.json({ error: payErr?.message ?? 'Failed to record payment' }, { status: 500 });
  const nextAmountPaid = Math.round((amountPaid + rowAmount) * 100) / 100;
  const nextBalance = resolveInvoiceBalanceDue({
    status: String(invoice.status ?? ''),
    total,
    amount_paid: nextAmountPaid,
    total_refunded: totalRefunded,
  });
  const nextStatus = String(
    deriveInvoiceStatus({
      status: String(invoice.status ?? ''),
      total,
      amount_paid: nextAmountPaid,
      balance_due: nextBalance,
      total_refunded: totalRefunded,
    })
  );

  const { error: rowErr } = await supabase
    .from('invoice_payment_schedule_items')
    .update({
      status: 'paid',
      paid_at: now,
      payment_id: payment.id,
    })
    .eq('id', row.id)
    .eq('invoice_id', invoiceId);
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });

  const { error: invErr } = await supabase
    .from('invoices')
    .update({
      amount_paid: nextAmountPaid,
      balance_due: nextBalance,
      status: nextStatus,
      paid_at: nextStatus === 'paid' ? now : null,
    })
    .eq('id', invoiceId);
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  const invoiceNumber = String(invoice.invoice_number || invoiceId);
  await createPaymentActivity(supabase, {
    business_id: invoice.business_id,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    amount: rowAmount,
    currency: invCur,
    remaining_balance: nextBalance,
    timestamp: now,
    source_payment_id: String((payment as { id?: string }).id ?? ''),
  });

  const { data: updated } = await supabase
    .from('invoices')
    .select('*, invoice_payment_schedule_items(*)')
    .eq('id', invoiceId)
    .single();

  return NextResponse.json({ ok: true, invoice: updated });
}

