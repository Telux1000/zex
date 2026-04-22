import { NextResponse } from 'next/server';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';
import { createServiceClient } from '@/lib/supabase/server';
import { createPaymentLink } from '@/lib/stripe';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { findInvoiceByPublicToken } from '@/lib/invoices/public-token';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const appUrl = resolveAppBaseUrl(new URL(req.url).origin) ?? 'http://localhost:3000';
  const { token } = await params;
  const supabase = await createServiceClient();
  const resolved = await findInvoiceByPublicToken(supabase as any, token);
  if (!resolved) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (resolved.linkExpired) return NextResponse.json({ error: 'This link has expired' }, { status: 410 });

  const invoice = resolved.invoices as Record<string, any>;
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (String(invoice.status ?? '') === 'paid') {
    return NextResponse.json({ error: 'This invoice is already paid' }, { status: 400 });
  }

  try {
    const { data: business } = await supabase
      .from('businesses')
      .select('id, payment_settings')
      .eq('id', String(invoice.business_id))
      .single();

    const amountPaid = Number(invoice.amount_paid ?? 0);
    const balanceDue = resolveInvoiceBalanceDue({
      status: String(invoice.status ?? ''),
      total: invoice.total,
      amount_paid: amountPaid,
    });

    const epd = computeEarlyPaymentDiscount({
      settings: (business?.payment_settings as any) ?? null,
      issue_date: String(invoice.issue_date ?? '') || null,
      now: new Date(),
      balance_due: balanceDue,
    });

    const payable = epd.enabled && epd.eligible ? epd.payable_now : balanceDue;
    const { url } = await createPaymentLink({
      invoiceId: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number ?? ''),
      businessId: String(invoice.business_id),
      amount: payable,
      currency: String(invoice.currency ?? 'USD'),
      customerEmail: String(invoice.customer_email ?? '') || null,
      successUrl: `${appUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/invoice/view/${encodeURIComponent(token)}`,
    });

    if (!url) return NextResponse.json({ error: 'Could not create payment link' }, { status: 500 });
    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Payment unavailable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
