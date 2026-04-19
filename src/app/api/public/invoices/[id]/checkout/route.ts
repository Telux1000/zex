import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createPaymentLink } from '@/lib/stripe';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Create Stripe Checkout session for a public invoice (no auth).
 * Allowed only when invoice is sent, viewed, or overdue and not paid.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('id, business_id, invoice_number, total, currency, customer_email, status, issue_date, amount_paid, balance_due')
    .eq('id', id)
    .single();

  if (invError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'This invoice is already paid' }, { status: 400 });
  }

  if (invoice.status === 'draft') {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  try {
    const { data: business } = await supabase
      .from('businesses')
      .select('id, payment_settings')
      .eq('id', invoice.business_id)
      .single();

    const amountPaid = Number(invoice.amount_paid ?? 0);
    const balanceDue = resolveInvoiceBalanceDue({
      status: String(invoice.status ?? ''),
      total: invoice.total,
      amount_paid: amountPaid,
    });

    const epd = computeEarlyPaymentDiscount({
      settings: (business?.payment_settings as any) ?? null,
      issue_date: invoice.issue_date ?? null,
      now: new Date(),
      balance_due: balanceDue,
    });

    const payable = epd.enabled && epd.eligible ? epd.payable_now : balanceDue;
    const { url } = await createPaymentLink({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      businessId: invoice.business_id,
      amount: payable,
      currency: invoice.currency,
      customerEmail: invoice.customer_email,
      successUrl: `${APP_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_URL}/i/${invoice.id}`,
    });

    if (!url) {
      return NextResponse.json({ error: 'Could not create payment link' }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Payment unavailable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
