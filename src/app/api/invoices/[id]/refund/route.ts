import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripeOrNull } from '@/lib/stripe';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { createActivity } from '@/lib/activity';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import {
  succeededPaymentGrossInInvoiceCurrency,
  normalizeCurrencyForRefund,
  availableRefundableAmount as computeAvailableRefundableAmount,
  roundRefundMoney,
} from '@/lib/invoices/refund-display';
import {
  sumRefundedSucceededAndPendingForInvoice,
} from '@/lib/invoices/invoice-payment-summary';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { deriveInvoiceStatus } from '@/lib/invoices/status';

export const dynamic = 'force-dynamic';

const REFUND_REASONS = new Set([
  'duplicate_payment',
  'customer_request',
  'service_issue',
  'billing_correction',
  'other',
]);

type PaymentRow = {
  id: string;
  amount: number;
  amount_in_invoice_currency: number | null;
  amount_in_base: number | null;
  currency: string;
  exchange_rate_to_base: number | null;
  method: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  paid_at: string | null;
  created_at?: string | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Load succeeded captures; service mode loads all invoice payment rows then filters in JS (avoids missing rows). */
async function fetchSucceededPaymentsForInvoiceRefund(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ledgerDb: any,
  invoiceId: string,
  selectCols: string,
  serviceMode: boolean
): Promise<PaymentRow[]> {
  let q = ledgerDb.from('payments').select(selectCols).eq('invoice_id', invoiceId);
  if (!serviceMode) {
    q = q.eq('status', 'succeeded');
  }
  const { data } = await q.order('paid_at', { ascending: false }).range(0, 9999);
  const raw = (data ?? []) as Array<PaymentRow & { status?: string | null }>;
  if (!serviceMode) return raw as PaymentRow[];
  return raw.filter((p) => String(p.status ?? '').trim().toLowerCase() === 'succeeded') as PaymentRow[];
}

function latestSucceededPaymentIso(
  rows: Array<{ paid_at: string | null; created_at?: string | null }>
): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const p of rows) {
    const raw = p.paid_at ?? p.created_at ?? null;
    if (raw == null || String(raw).trim() === '') continue;
    const ms = Date.parse(String(raw));
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = String(raw);
    }
  }
  return best;
}

function invoicePaymentAmount(payment: PaymentRow, invoiceCurrency: string): number {
  return roundMoney(
    succeededPaymentGrossInInvoiceCurrency(
      {
        amount: payment.amount,
        amount_in_invoice_currency: payment.amount_in_invoice_currency,
        currency: payment.currency,
      },
      invoiceCurrency
    )
  );
}

function refundsSucceededPendingByPaymentId(
  rows: Array<{ payment_id?: string | null; amount?: number | null; status?: string | null }> | null | undefined
): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of rows ?? []) {
    const st = String(row.status ?? '').toLowerCase();
    if (st !== 'succeeded' && st !== 'pending') continue;
    const pid = String(row.payment_id ?? '');
    if (!pid) continue;
    const amt = roundMoney(Math.max(0, Number(row.amount ?? 0)));
    m.set(pid, roundMoney((m.get(pid) ?? 0) + amt));
  }
  return m;
}

/** Max refund that can be executed against current payment rows (after per-payment refunds). */
function sumAllocatableAcrossPayments(
  paymentRows: PaymentRow[],
  invoiceCurrency: string,
  refundedByPayment: Map<string, number>
): number {
  let sum = 0;
  for (const p of paymentRows) {
    const gross = invoicePaymentAmount(p, invoiceCurrency);
    const already = roundMoney(refundedByPayment.get(String(p.id)) ?? 0);
    sum += roundMoney(Math.max(0, gross - already));
  }
  return roundMoney(sum);
}

/**
 * Prefer DB RPC (service role) so every succeeded capture is visible for allocation (matches ledger).
 * Falls back to table query if RPC is unavailable.
 */
async function loadSucceededPaymentsForRefund(
  admin: ReturnType<typeof getSupabaseServiceAdmin>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ledgerDb: any,
  invoiceId: string,
  selectCols: string,
  serviceMode: boolean
): Promise<PaymentRow[]> {
  if (admin) {
    const { data, error } = await admin.rpc('invoice_refund_succeeded_payments', {
      p_invoice_id: invoiceId,
    });
    if (!error && Array.isArray(data)) {
      return data as PaymentRow[];
    }
  }
  return fetchSucceededPaymentsForInvoiceRefund(ledgerDb, invoiceId, selectCols, serviceMode);
}

type RefundModalAvailability = {
  refundedSoFar: number;
  grossPaid: number;
  allocatableFromPaymentRows: number;
  refundableRemaining: number;
  availableRefundableAmount: number;
};

/**
 * Modal + POST refund cap: gross from visible succeeded rows, allocatable after per-payment refunds,
 * then canonical remainder. Falls back to `invoice_refund_modal_summary` (service role) when row
 * visibility is incomplete so "Available to refund" never spuriously reads 0.
 */
async function resolveRefundModalAvailability(input: {
  admin: ReturnType<typeof getSupabaseServiceAdmin>;
  invoiceId: string;
  invoiceCurrency: string;
  paymentRows: PaymentRow[];
  refundRows: Array<{ payment_id?: string | null; amount?: number | null; status?: string | null }> | null;
  invoiceAmountPaidRow?: number | null;
}): Promise<RefundModalAvailability> {
  let refundedSoFar = sumRefundedSucceededAndPendingForInvoice(input.refundRows);
  let grossPaidFromRows = 0;
  for (const p of input.paymentRows) grossPaidFromRows += invoicePaymentAmount(p, input.invoiceCurrency);
  let grossPaid = roundMoney(grossPaidFromRows);
  const refundedByPayment = refundsSucceededPendingByPaymentId(input.refundRows);
  let allocatableFromPaymentRows = sumAllocatableAcrossPayments(
    input.paymentRows,
    input.invoiceCurrency,
    refundedByPayment
  );
  const rowFromInvoice = roundMoney(Math.max(0, Number(input.invoiceAmountPaidRow ?? 0)));
  if (grossPaid <= 0.0001 && rowFromInvoice > 0.0001) {
    grossPaid = rowFromInvoice;
  }

  if (
    input.admin &&
    (grossPaidFromRows <= 0.0001 || grossPaid <= 0.0001) &&
    (rowFromInvoice > 0.0001 || refundedSoFar > 0.0001)
  ) {
    const { data, error } = await input.admin.rpc('invoice_refund_modal_summary', {
      p_invoice_id: input.invoiceId,
    });
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    if (!error && row) {
      const ap = Number(row.amount_paid ?? 0);
      const rf = Number(row.refunded_so_far ?? 0);
      if (Number.isFinite(ap) && ap > 0.0001) grossPaid = roundMoney(Math.max(0, ap));
      if (Number.isFinite(rf) && rf > 0.0001) refundedSoFar = roundRefundMoney(Math.max(0, rf));
    }
  }

  allocatableFromPaymentRows = sumAllocatableAcrossPayments(
    input.paymentRows,
    input.invoiceCurrency,
    refundedByPayment
  );

  let refundableRemaining = roundMoney(computeAvailableRefundableAmount(grossPaid, refundedSoFar));
  let availableRefundableAmount = roundMoney(
    Math.min(refundableRemaining, allocatableFromPaymentRows)
  );

  if (
    refundableRemaining > 0.0001 &&
    allocatableFromPaymentRows <= 0.0001 &&
    grossPaid > 0.0001
  ) {
    allocatableFromPaymentRows = refundableRemaining;
    availableRefundableAmount = refundableRemaining;
  }

  if (input.admin && availableRefundableAmount <= 0.0001) {
    const { data, error } = await input.admin.rpc('invoice_refund_modal_summary', {
      p_invoice_id: input.invoiceId,
    });
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    if (!error && row) {
      const rpcAvail = Number(row.available_refundable_amount ?? 0);
      if (Number.isFinite(rpcAvail) && rpcAvail > 0.0001) {
        const rpcAp = Number(row.amount_paid ?? 0);
        const rpcRf = Number(row.refunded_so_far ?? 0);
        if (Number.isFinite(rpcAp) && rpcAp > 0.0001) grossPaid = roundMoney(Math.max(0, rpcAp));
        if (Number.isFinite(rpcRf) && rpcRf > 0.0001) refundedSoFar = roundRefundMoney(Math.max(0, rpcRf));
        refundableRemaining = roundMoney(computeAvailableRefundableAmount(grossPaid, refundedSoFar));
        allocatableFromPaymentRows = roundMoney(Math.max(allocatableFromPaymentRows, rpcAvail));
        availableRefundableAmount = roundMoney(
          Math.min(refundableRemaining, allocatableFromPaymentRows)
        );
      }
    }
  }

  return {
    refundedSoFar,
    grossPaid,
    allocatableFromPaymentRows,
    refundableRemaining,
    availableRefundableAmount,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, business_id, invoice_number, customer_name, status, total, currency, paid_at, amount_paid')
    .eq('id', id)
    .single();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const payGate = await assertBusinessPermission(
    supabase,
    String(invoice.business_id),
    user.id,
    'manage_payments'
  );
  if (!payGate.ok) return payGate.response;

  const status = String(invoice.status ?? '').toLowerCase();
  if (!['paid', 'partially_paid', 'partially_refunded', 'refunded'].includes(status)) {
    return NextResponse.json(
      { error: 'Refunds are only available for paid invoices.' },
      { status: 400 }
    );
  }

  const invoiceCurrency = normalizeCurrencyForRefund(String((invoice as { currency?: string }).currency));

  // Payment rows for dates/count; gross + refundable use ledger rows and `payment_refunds`, with
  // service-role RPC fallback when RLS hides captures but refunds are visible.
  const admin = getSupabaseServiceAdmin();
  const ledgerDb = admin ?? supabase;
  const paymentRows = await loadSucceededPaymentsForRefund(
    admin,
    ledgerDb,
    id,
    'id, amount, amount_in_invoice_currency, currency, status, method, stripe_payment_intent_id, paid_at, created_at',
    Boolean(admin)
  );

  const { data: refundRowsForInvoice } = await ledgerDb
    .from('payment_refunds')
    .select('payment_id, amount, status')
    .eq('invoice_id', id);

  const avail = await resolveRefundModalAvailability({
    admin,
    invoiceId: id,
    invoiceCurrency,
    paymentRows,
    refundRows: refundRowsForInvoice,
    invoiceAmountPaidRow: (invoice as { amount_paid?: number | null }).amount_paid,
  });
  const paidAtForModal =
    latestSucceededPaymentIso(paymentRows) ?? ((invoice as { paid_at?: string | null }).paid_at ?? null);

  return NextResponse.json(
    {
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        currency: invoice.currency,
        paid_at: paidAtForModal,
        amount_paid: avail.grossPaid,
        refunded_so_far: avail.refundedSoFar,
        available_refundable_amount: avail.availableRefundableAmount,
        succeeded_payment_count: paymentRows.length,
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as {
    mode?: 'full' | 'partial';
    amount?: number;
    reason?: string;
    note?: string | null;
  };

  const mode = body.mode === 'partial' ? 'partial' : 'full';
  const requestedAmount = Number(body.amount ?? 0);
  const reason = String(body.reason ?? '').trim();
  const note = String(body.note ?? '').trim();
  if (!REFUND_REASONS.has(reason)) {
    return NextResponse.json({ error: 'Refund reason is required.' }, { status: 400 });
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, status, currency, amount_paid, total, total_refunded, use_payment_schedule, paid_at'
    )
    .eq('id', id)
    .single();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const payGate = await assertBusinessPermission(
    supabase,
    String(invoice.business_id),
    user.id,
    'manage_payments'
  );
  if (!payGate.ok) return payGate.response;

  const invoiceStatus = String(invoice.status ?? '').toLowerCase();
  if (!['paid', 'partially_paid', 'partially_refunded', 'refunded'].includes(invoiceStatus)) {
    return NextResponse.json(
      { error: 'Refunds are only available for paid invoices.' },
      { status: 400 }
    );
  }

  const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';
  const invoiceCurrency = normalizeCurrencyForRefund(String((invoice as { currency?: string }).currency));
  const nowIso = new Date().toISOString();

  await logAuditEvent(supabase, {
    businessId: String(invoice.business_id),
    entityType: 'invoice',
    entityId: String(id),
    action: mode === 'partial' ? 'refund_partial_initiated' : 'refund_initiated',
    performedByUserId: user.id,
    performedByName: actorName,
    metadata: {
      invoice_number: String(invoice.invoice_number ?? id),
      requested_amount: mode === 'partial' ? requestedAmount : null,
      currency: invoiceCurrency,
      refund_reason: reason,
      source: 'invoice_refund',
    },
  });

  try {
    const stripe = getStripeOrNull();
    const admin = getSupabaseServiceAdmin();
    const ledgerDb = admin ?? supabase;
    const paymentRows = await loadSucceededPaymentsForRefund(
      admin,
      ledgerDb,
      id,
      'id, amount, amount_in_base, amount_in_invoice_currency, currency, exchange_rate_to_base, method, stripe_payment_intent_id, status, paid_at',
      Boolean(admin)
    );

    if (paymentRows.length === 0) {
      return NextResponse.json({ error: 'No captured payments found to refund.' }, { status: 400 });
    }

    const { data: refundRows } = await ledgerDb
      .from('payment_refunds')
      .select('payment_id, amount, status')
      .eq('invoice_id', id);

    const refundedByPayment = refundsSucceededPendingByPaymentId(refundRows);

    const avail = await resolveRefundModalAvailability({
      admin,
      invoiceId: id,
      invoiceCurrency,
      paymentRows,
      refundRows,
      invoiceAmountPaidRow: (invoice as { amount_paid?: number | null }).amount_paid,
    });
    const refundedSoFar = avail.refundedSoFar;
    const originalPaidAmount = avail.grossPaid;
    const availableRefundableAmount = avail.availableRefundableAmount;
    const refundableRemaining = avail.refundableRemaining;
    const allocatableFromRows = avail.allocatableFromPaymentRows;

    if (availableRefundableAmount <= 0.0001) {
      if (refundableRemaining > 0.0001 && allocatableFromRows <= 0.0001) {
        return NextResponse.json(
          {
            error:
              'No refundable amount remains on recorded payment captures. If the invoice shows an amount paid, reconcile missing payment rows or configure SUPABASE_SERVICE_ROLE_KEY so all captures are visible.',
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: 'This invoice has no refundable amount left.' }, { status: 400 });
    }

    const refundAmount = mode === 'full' ? availableRefundableAmount : requestedAmount;
    if (!(refundAmount > 0)) {
      return NextResponse.json({ error: 'Refund amount must be greater than 0.' }, { status: 400 });
    }
    if (refundAmount - availableRefundableAmount > 0.0001) {
      return NextResponse.json(
        { error: 'Refund amount cannot exceed available refundable amount.' },
        { status: 400 }
      );
    }

    let remaining = roundMoney(refundAmount);
    for (const payment of paymentRows) {
      if (remaining <= 0.0001) break;
      const paymentTotal = invoicePaymentAmount(payment, invoiceCurrency);
      const alreadyRefunded = roundMoney(refundedByPayment.get(String(payment.id)) ?? 0);
      const paymentAvailable = roundMoney(Math.max(0, paymentTotal - alreadyRefunded));
      if (paymentAvailable <= 0.0001) continue;

      const chunk = roundMoney(Math.min(remaining, paymentAvailable));
      if (!(chunk > 0)) continue;

      let stripeRefundId: string | null = null;
      const paymentMethod = String(payment.method ?? '').toLowerCase();
      if (paymentMethod === 'card' && payment.stripe_payment_intent_id) {
        if (!stripe) {
          return NextResponse.json(
            { error: 'Stripe is not configured for refunds in this environment.' },
            { status: 500 }
          );
        }
        if (normalizeCurrencyForRefund(payment.currency) !== invoiceCurrency) {
          return NextResponse.json(
            { error: 'Cannot auto-refund cross-currency Stripe payments safely.' },
            { status: 400 }
          );
        }
        const stripeAmount = Math.round(chunk * 100);
        const stripeRefund = await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          amount: stripeAmount,
          reason: 'requested_by_customer',
          metadata: {
            invoice_id: String(id),
            business_id: String(invoice.business_id),
            reason,
            source: 'invoice_refund_flow',
          },
        });
        stripeRefundId = stripeRefund.id;
      }

      const fxRate = Number(payment.exchange_rate_to_base ?? 1);
      const refundAmountInBase =
        payment.amount_in_base != null && paymentTotal > 0.0001
          ? roundMoney((chunk / paymentTotal) * Number(payment.amount_in_base))
          : roundMoney(chunk * (Number.isFinite(fxRate) && fxRate > 0 ? fxRate : 1));

      const { error: refundInsertErr } = await supabase.from('payment_refunds').insert({
        payment_id: payment.id,
        invoice_id: id,
        business_id: String(invoice.business_id),
        amount: chunk,
        currency: invoiceCurrency,
        reason,
        note: note || null,
        status: 'succeeded',
        stripe_refund_id: stripeRefundId,
        refunded_at: nowIso,
        metadata: {
          source: 'invoice_refund_modal',
          original_payment_currency: payment.currency,
        },
      });
      if (refundInsertErr) {
        return NextResponse.json({ error: refundInsertErr.message }, { status: 500 });
      }

      const { error: paymentLedgerErr } = await supabase.from('payments').insert({
        invoice_id: id,
        business_id: String(invoice.business_id),
        amount: -chunk,
        currency: invoiceCurrency,
        amount_in_base: -Math.abs(refundAmountInBase),
        exchange_rate_to_base: payment.exchange_rate_to_base ?? null,
        amount_in_invoice_currency: -chunk,
        exchange_rate_to_invoice: 1,
        method: payment.method ?? 'card',
        status: 'refunded',
        paid_at: nowIso,
        metadata: {
          source: 'invoice_refund',
          refund_for_payment_id: payment.id,
          payment_refund_reason: reason,
          note: note || null,
          stripe_refund_id: stripeRefundId,
        },
      });
      if (paymentLedgerErr) {
        return NextResponse.json({ error: paymentLedgerErr.message }, { status: 500 });
      }

      refundedByPayment.set(String(payment.id), roundMoney(alreadyRefunded + chunk));
      remaining = roundMoney(Math.max(0, remaining - chunk));
    }

    if (remaining > 0.0001) {
      return NextResponse.json(
        {
          error:
            `Unable to allocate ${remaining.toFixed(2)} ${invoiceCurrency} across payment records. ` +
            `Recorded captures are ${allocatableFromRows.toFixed(2)} ${invoiceCurrency} refundable; check Stripe payment intents and payment row status.`,
        },
        { status: 400 }
      );
    }

    const newRefundedTotal = roundMoney(refundedSoFar + refundAmount);
    const available = roundMoney(
      computeAvailableRefundableAmount(originalPaidAmount, newRefundedTotal)
    );

    const invRow = invoice as {
      total?: number | null;
      total_refunded?: number | null;
      use_payment_schedule?: boolean | null;
      amount_paid?: number | null;
    };
    const invoiceTotal = roundMoney(Number(invRow.total ?? 0));
    const paidBefore = roundMoney(Number(invRow.amount_paid ?? 0));
    const prevTotalRefunded = roundMoney(Number(invRow.total_refunded ?? 0));
    const nextTotalRefunded = roundMoney(prevTotalRefunded + refundAmount);
    const nextBalanceDue = resolveInvoiceBalanceDue({
      status: String(invoice.status ?? ''),
      total: invoiceTotal,
      amount_paid: paidBefore,
      total_refunded: nextTotalRefunded,
    });
    const nextStatus = String(
      deriveInvoiceStatus({
        status: String(invoice.status ?? ''),
        total: invoiceTotal,
        amount_paid: paidBefore,
        balance_due: nextBalanceDue,
        total_refunded: nextTotalRefunded,
      })
    );

    const { error: invUpdateErr } = await supabase
      .from('invoices')
      .update({
        balance_due: nextBalanceDue,
        total_refunded: nextTotalRefunded,
        status: nextStatus,
        ...(nextStatus === 'paid' ? {} : { paid_at: null }),
      })
      .eq('id', id);
    if (invUpdateErr) {
      return NextResponse.json({ error: invUpdateErr.message }, { status: 500 });
    }

    if (invRow.use_payment_schedule) {
      const refundDay = nowIso.slice(0, 10);
      const { error: schedErr } = await supabase.from('invoice_payment_schedule_items').insert({
        invoice_id: id,
        description: 'Refund',
        amount: roundMoney(-refundAmount),
        due_date: refundDay,
        status: 'refund',
        paid_at: nowIso,
      });
      if (schedErr) {
        return NextResponse.json({ error: schedErr.message }, { status: 500 });
      }
    }

    await createActivity(supabase, {
      business_id: String(invoice.business_id),
      eventType: 'payment_received',
      title: `Refund issued for ${String(invoice.invoice_number ?? id)}`,
      description: `Refunded ${invoiceCurrency} ${refundAmount.toFixed(2)}.`,
      entityType: 'invoice',
      entityId: String(id),
      amount: -refundAmount,
      currencyCode: invoiceCurrency,
      metadata: {
        event_kind: 'payment_refund',
        refund_amount: refundAmount,
        refund_reason: reason,
        timestamp: nowIso,
      },
    });

    await logAuditEvent(supabase, {
      businessId: String(invoice.business_id),
      entityType: 'invoice',
      entityId: String(id),
      action: 'refund_completed',
      performedByUserId: user.id,
      performedByName: actorName,
      metadata: {
        invoice_number: String(invoice.invoice_number ?? id),
        refund_amount: refundAmount,
        currency: invoiceCurrency,
        refund_reason: reason,
        source: 'invoice_refund',
      },
    });

    return NextResponse.json({
      refund: {
        amount: refundAmount,
        currency: invoiceCurrency,
        refunded_so_far: newRefundedTotal,
        available_refundable_amount: available,
      },
      invoice: {
        amount_paid: paidBefore,
        balance_due: nextBalanceDue,
        total_refunded: nextTotalRefunded,
        status: nextStatus,
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Refund failed';
    await logAuditEvent(supabase, {
      businessId: String(invoice.business_id),
      entityType: 'invoice',
      entityId: String(id),
      action: 'refund_failed',
      performedByUserId: user.id,
      performedByName: actorName,
      metadata: {
        invoice_number: String(invoice.invoice_number ?? id),
        currency: invoiceCurrency,
        refund_reason: reason,
        source: 'invoice_refund',
        error: errorMessage,
      },
    });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
