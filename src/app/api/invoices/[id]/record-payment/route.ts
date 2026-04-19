import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deriveInvoiceStatus } from '@/lib/invoices/status';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { paymentAmountInBase } from '@/lib/invoices/fx-snapshot';
import { createActivity, createPaymentActivity } from '@/lib/activity';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import { assertBusinessPermission } from '@/lib/rbac/server';

const ALLOWED_METHODS = new Set([
  'cash',
  'pos',
  'bank_transfer',
  'bank_deposit',
  'card',
  'mobile_money',
  'other',
] as const);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = (await req.json()) as {
      amount?: number;
      paymentMethod?: string;
      note?: string | null;
      scheduleItemId?: string | null;
      /** Calendar date yyyy-MM-dd (payment received date). */
      paymentDate?: string | null;
    };

    const amount = Number(body.amount ?? 0);
    const scheduleItemIdRaw = body.scheduleItemId != null ? String(body.scheduleItemId).trim() : '';
    const paymentMethod = String(body.paymentMethod ?? '').trim();
    const note = String(body.note ?? '').trim();

    if (!(amount > 0)) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }
    if (!ALLOWED_METHODS.has(paymentMethod as any)) {
      return NextResponse.json({ error: 'Payment method is required' }, { status: 400 });
    }

    const rawPaymentDate =
      body.paymentDate != null && String(body.paymentDate).trim() !== ''
        ? String(body.paymentDate).trim().slice(0, 10)
        : '';
    let paymentYmd: string;
    if (rawPaymentDate === '') {
      paymentYmd = new Date().toISOString().slice(0, 10);
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(rawPaymentDate)) {
      return NextResponse.json({ error: 'Invalid payment date.' }, { status: 400 });
    } else {
      paymentYmd = rawPaymentDate;
    }

    const { data: invoice } = await supabase
      .from('invoices')
      .select(
        'id, business_id, invoice_number, status, total, amount_paid, balance_due, total_refunded, currency, exchange_rate_to_base, use_payment_schedule, issue_date'
      )
      .eq('id', id)
      .single();
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const issueYmd = String((invoice as { issue_date?: string | null }).issue_date ?? '')
      .trim()
      .slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(issueYmd) && paymentYmd < issueYmd) {
      return NextResponse.json(
        { error: 'Payment date cannot be before the invoice issue date.' },
        { status: 400 }
      );
    }
    const todayYmd = new Date().toISOString().slice(0, 10);
    if (paymentYmd > todayYmd) {
      return NextResponse.json({ error: 'Payment date cannot be in the future.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const paidAtIso =
      paymentYmd === nowIso.slice(0, 10) ? nowIso : `${paymentYmd}T12:00:00.000Z`;

    const useSchedule = Boolean((invoice as any).use_payment_schedule);
    if (scheduleItemIdRaw && !useSchedule) {
      return NextResponse.json({ error: 'This invoice does not use a payment schedule.' }, { status: 400 });
    }

    const bizId = String((invoice as any).business_id);
    const payGate = await assertBusinessPermission(supabase, bizId, user.id, 'manage_payments');
    if (!payGate.ok) return payGate.response;

    const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';

    const status = String((invoice as any).status ?? '');
    if (status === 'voided' || status === 'paid') {
      return NextResponse.json({ error: 'This invoice cannot receive new payments.' }, { status: 400 });
    }

    const total = Number((invoice as any).total ?? 0);
    const prevPaid = Number((invoice as any).amount_paid ?? 0);
    const totalRefunded = Number((invoice as any).total_refunded ?? 0);
    const prevBalance = resolveInvoiceBalanceDue({
      status,
      total,
      amount_paid: prevPaid,
      total_refunded: totalRefunded,
      balance_due:
        (invoice as any).balance_due != null ? Number((invoice as any).balance_due) : null,
    });
    if (amount - prevBalance > 0.0001) {
      return NextResponse.json({ error: 'Amount cannot exceed remaining balance' }, { status: 400 });
    }

    const nextAmountPaid = Math.max(0, prevPaid + amount);
    const nextBalance = resolveInvoiceBalanceDue({
      status,
      total,
      amount_paid: nextAmountPaid,
      total_refunded: totalRefunded,
    });
    const nextStatus = deriveInvoiceStatus({
      status,
      total,
      amount_paid: nextAmountPaid,
      balance_due: nextBalance,
      total_refunded: totalRefunded,
    });

    let prevalidatedScheduleRowId: string | null = null;
    if (useSchedule && scheduleItemIdRaw) {
      const { data: targetRow } = await supabase
        .from('invoice_payment_schedule_items')
        .select('id, amount, status, invoice_id')
        .eq('id', scheduleItemIdRaw)
        .eq('invoice_id', id)
        .single();
      if (!targetRow) {
        return NextResponse.json({ error: 'Schedule installment not found.' }, { status: 400 });
      }
      if (String((targetRow as { status?: string }).status ?? 'pending') === 'paid') {
        return NextResponse.json({ error: 'This installment is already paid.' }, { status: 400 });
      }
      const rowAmt = Number((targetRow as { amount?: number }).amount ?? 0);
      if (Math.abs(rowAmt - amount) > 0.02) {
        return NextResponse.json(
          { error: 'Amount must match the selected installment.' },
          { status: 400 }
        );
      }
      prevalidatedScheduleRowId = String((targetRow as { id: string }).id);
    }

    const invCur = String((invoice as any).currency ?? 'USD').toUpperCase();
    const invRate = Number((invoice as any).exchange_rate_to_base ?? 1);
    const payFx = paymentAmountInBase(amount, invCur, invCur, invRate > 0 ? invRate : 1, 1);

    const { error: paymentInsertError } = await supabase.from('payments').insert({
      invoice_id: id,
      business_id: bizId,
      amount,
      currency: invCur,
      amount_in_base: payFx.amount_in_base,
      exchange_rate_to_base: invRate > 0 ? invRate : 1,
      amount_in_invoice_currency: payFx.amount_in_invoice_currency,
      exchange_rate_to_invoice: payFx.exchange_rate_to_invoice,
      method: paymentMethod,
      status: 'succeeded',
      paid_at: paidAtIso,
      metadata: {
        source: 'manual_record_payment',
        note: note || null,
      },
    });
    if (paymentInsertError) {
      return NextResponse.json({ error: paymentInsertError.message }, { status: 500 });
    }

    const invoicePaidAtIso = nextStatus === 'paid' ? paidAtIso : undefined;
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        amount_paid: nextAmountPaid,
        balance_due: nextBalance,
        status: nextStatus,
        ...(invoicePaidAtIso ? { paid_at: invoicePaidAtIso } : {}),
      })
      .eq('id', id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (useSchedule) {
      if (prevalidatedScheduleRowId) {
        const { error: rowUpdErr } = await supabase
          .from('invoice_payment_schedule_items')
          .update({ status: 'paid', paid_at: paidAtIso })
          .eq('id', prevalidatedScheduleRowId)
          .eq('invoice_id', id);
        if (rowUpdErr) return NextResponse.json({ error: rowUpdErr.message }, { status: 500 });
      } else {
        const { data: scheduleRows } = await supabase
          .from('invoice_payment_schedule_items')
          .select('id, amount, status')
          .eq('invoice_id', id)
          .order('due_date', { ascending: true });

        let remaining = amount;
        for (const row of scheduleRows ?? []) {
          if (remaining <= 0.0001) break;
          const rowStatus = String((row as any).status ?? 'pending');
          if (rowStatus === 'paid') continue;
          const rowAmount = Number((row as any).amount ?? 0);
          if (remaining + 0.0001 >= rowAmount) {
            await supabase
              .from('invoice_payment_schedule_items')
              .update({ status: 'paid', paid_at: paidAtIso })
              .eq('id', String((row as any).id));
            remaining -= rowAmount;
          }
        }
      }
    }

    const invoiceNumber = String((invoice as any).invoice_number ?? id);
    const currency = invCur;
    const methodLabelMap: Record<string, string> = {
      cash: 'Cash',
      pos: 'POS',
      bank_transfer: 'Bank Transfer',
      bank_deposit: 'Bank Deposit',
      card: 'Card',
      mobile_money: 'Mobile Money',
      other: 'Other',
    };
    const methodLabel = methodLabelMap[paymentMethod] ?? 'Other';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const sourcePaymentId = `manual:${String(id)}:${uniqueSuffix}:${Math.round(amount * 100)}:${paymentMethod}`;

    await createPaymentActivity(supabase, {
      business_id: String((invoice as any).business_id),
      invoice_id: String(id),
      invoice_number: invoiceNumber,
      amount,
      currency,
      remaining_balance: nextBalance,
      timestamp: paidAtIso,
      source_payment_id: sourcePaymentId,
    });

    await createActivity(supabase, {
      business_id: String((invoice as any).business_id),
      eventType: 'payment_received',
      title: `Payment of ${amount.toFixed(2)} received via ${methodLabel} for Invoice ${invoiceNumber}`,
      description: note || `Payment recorded for Invoice ${invoiceNumber}`,
      entityType: 'invoice',
      entityId: String(id),
      amount,
      currencyCode: currency,
      metadata: {
        invoiceId: String(id),
        invoiceNumber,
        amount,
        paymentMethod,
        paymentMethodLabel: methodLabel,
        note: note || null,
        createdAt: paidAtIso,
        source_payment_id: sourcePaymentId,
        scheduleItemId: scheduleItemIdRaw || null,
      },
    });

    await logAuditEvent(supabase, {
      businessId: String((invoice as any).business_id),
      entityType: 'invoice',
      entityId: String(id),
      action: 'payment_recorded',
      performedByUserId: user.id,
      performedByName: actorName,
      metadata: {
        invoice_number: invoiceNumber,
        amount,
        currency,
        payment_method: paymentMethod,
        note: note || null,
      },
    });
    if (nextStatus === 'paid') {
      await logAuditEvent(supabase, {
        businessId: String((invoice as any).business_id),
        entityType: 'invoice',
        entityId: String(id),
        action: 'marked_paid',
        performedByUserId: user.id,
        performedByName: actorName,
        metadata: { invoice_number: invoiceNumber },
      });
    } else if (nextStatus === 'partially_paid') {
      await logAuditEvent(supabase, {
        businessId: String((invoice as any).business_id),
        entityType: 'invoice',
        entityId: String(id),
        action: 'partially_paid',
        performedByUserId: user.id,
        performedByName: actorName,
        metadata: { invoice_number: invoiceNumber },
      });
    }

    const { data: updated } = await supabase
      .from('invoices')
      .select('*, invoice_payment_schedule_items(*)')
      .eq('id', id)
      .single();

    return NextResponse.json({ invoice: updated, payment_recorded_at: paidAtIso });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to record payment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

