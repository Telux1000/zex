import { NextResponse } from 'next/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { findQuoteByPublicToken } from '@/lib/quotes/public-token';
import { createActivity } from '@/lib/activity';
import { convertQuoteToInvoice } from '@/lib/quotes/convert-to-invoice';
import { autoSendInvoiceIfEligible } from '@/lib/invoices/auto-send';
import { resolveInvoicePublicTokenForQuote } from '@/lib/quotes/public-quote-invoice-token';

function isQuotePastExpiry(expiryDate: string | null | undefined): boolean {
  if (!expiryDate) return false;
  const dateOnly = String(expiryDate).slice(0, 10);
  if (!dateOnly) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const exp = new Date(`${dateOnly}T00:00:00.000Z`);
  return Number.isFinite(exp.getTime()) && todayUtc > exp.getTime();
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const { token } = await params;
  const resolved = await findQuoteByPublicToken(admin, String(token));
  if (!resolved) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (resolved.linkExpired) return NextResponse.json({ error: 'This link has expired', linkExpired: true }, { status: 410 });

  const rawEmbed = resolved.quotes as unknown;
  const quote = (Array.isArray(rawEmbed) ? rawEmbed[0] : rawEmbed) as Record<string, unknown>;
  const quoteId = String(quote.id);
  const { data: quoteRow } = await admin
    .from('quotes')
    .select('status, expiry_date, converted_invoice_id, invoice_public_token')
    .eq('id', quoteId)
    .maybeSingle();
  const qr = quoteRow as {
    status?: string | null;
    expiry_date?: string | null;
    converted_invoice_id?: string | null;
    invoice_public_token?: string | null;
  } | null;
  const expiryDate = (qr?.expiry_date ?? (quote.expiry_date as string | null)) ?? null;
  let status = String(qr?.status ?? quote.status ?? '');
  const isPastExpiry = isQuotePastExpiry(expiryDate);
  if (status === 'sent' && isPastExpiry) {
    await admin
      .from('quotes')
      .update({ status: 'expired' })
      .eq('id', quoteId)
      .eq('status', 'sent');
    status = 'expired';
  }
  const businessId = String(quote.business_id ?? '');
  const { data: business } = await admin
    .from('businesses')
    .select('name, logo_url, email, phone, tax_id, address_line1, address_line2, city, state, postal_code, country')
    .eq('id', businessId)
    .maybeSingle();
  const { data: items } = await admin
    .from('quote_items')
    .select('id, name, description, quantity, unit_price, amount, tax_percent, sort_order')
    .eq('quote_id', String(quote.id))
    .order('sort_order', { ascending: true });
  const convertedInvoiceId = String(qr?.converted_invoice_id ?? quote.converted_invoice_id ?? '').trim();
  let invoicePublicToken: string | null = null;
  if (convertedInvoiceId) {
    invoicePublicToken = await resolveInvoicePublicTokenForQuote(
      admin as any,
      quoteId,
      convertedInvoiceId,
      qr?.invoice_public_token
    );
  }

  return NextResponse.json({
    quote: {
      id: String(quote.id),
      quote_number: String(quote.quote_number ?? ''),
      issue_date: String(quote.issue_date ?? ''),
      expiry_date: (qr?.expiry_date ?? quote.expiry_date) ?? null,
      status,
      currency: String(quote.currency ?? 'USD'),
      subtotal: Number(quote.subtotal ?? 0),
      tax_amount: Number(quote.tax_amount ?? 0),
      total: Number(quote.total ?? 0),
      notes: quote.notes ?? null,
      customer_snapshot: quote.customer_snapshot ?? {},
      accepted_at: quote.accepted_at ?? null,
      accepted_via: quote.accepted_via ?? null,
      accepted_note: quote.accepted_note ?? null,
      confirmation_channel: quote.confirmation_channel ?? null,
      rejected_at: quote.rejected_at ?? null,
      rejected_via: quote.rejected_via ?? null,
      rejection_reason: quote.rejection_reason ?? null,
      converted_invoice_id: convertedInvoiceId || null,
      invoicePublicToken,
      converted_invoice_number: quote.converted_invoice_number ?? null,
      business: business ?? null,
      items: items ?? [],
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const { token } = await params;
  const resolved = await findQuoteByPublicToken(admin, String(token));
  if (!resolved) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (resolved.linkExpired) return NextResponse.json({ error: 'This link has expired', linkExpired: true }, { status: 410 });

  const body = await req.json().catch(() => ({}));
  const action = String((body as { action?: string }).action ?? '').toLowerCase();
  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const quote = resolved.quotes as Record<string, unknown>;
  const quoteId = String(quote.id);
  const businessId = String(quote.business_id ?? '');
  const expiryDate = (quote.expiry_date as string | null) ?? null;
  const isPastExpiry = isQuotePastExpiry(expiryDate);
  let currentStatus = String(quote.status ?? '');
  const statusLower = currentStatus.toLowerCase();
  if (currentStatus === 'sent' && isPastExpiry) {
    await admin
      .from('quotes')
      .update({ status: 'expired' })
      .eq('id', quoteId)
      .eq('status', 'sent');
    currentStatus = 'expired';
  }
  if (statusLower === 'accepted_customer' || statusLower === 'accepted' || statusLower === 'accepted_manual') {
    return NextResponse.json({ ok: true, status: currentStatus, alreadyActioned: true });
  }
  if (statusLower === 'rejected_customer' || statusLower === 'rejected' || statusLower === 'rejected_manual') {
    return NextResponse.json({ ok: true, status: currentStatus, alreadyActioned: true });
  }
  if (currentStatus === 'expired') {
    return NextResponse.json({ error: 'Quote has expired and can no longer be actioned.', status: 'expired' }, { status: 400 });
  }
  if (!['sent'].includes(currentStatus)) {
    return NextResponse.json({ error: 'Quote can no longer be actioned.', status: currentStatus }, { status: 400 });
  }

  const now = new Date().toISOString();
  if (action === 'accept') {
    const note = String((body as { note?: string }).note ?? '').trim();
    const { error } = await admin
      .from('quotes')
      .update({
        status: 'accepted_customer',
        accepted_at: now,
        accepted_via: 'customer_portal',
        accepted_note: note || null,
        confirmation_channel: 'email',
        customer_actioned_at: now,
      })
      .eq('id', quoteId)
      .eq('status', 'sent');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await createActivity(admin as any, {
      business_id: businessId,
      eventType: 'quote_accepted',
      title: `Quote accepted by customer via email`,
      description: note ? `Quote accepted by customer via email. Note: ${note}` : 'Quote accepted by customer via email',
      entityType: 'quote',
      entityId: quoteId,
      amount: Number(quote.total ?? 0),
      currencyCode: String(quote.currency ?? 'USD'),
      metadata: { source: 'public_quote_page', timestamp: now, note: note || null },
    });

    await admin.from('quote_public_tokens').update({ consumed_at: now, updated_at: now }).eq('quote_id', quoteId);
    const converted = await convertQuoteToInvoice(admin as any, quoteId);
    if (!converted.ok && !('alreadyConverted' in converted && converted.alreadyConverted)) {
      return NextResponse.json({ error: converted.error }, { status: converted.status });
    }
    let invoicePublicToken: string | null = null;
    if (converted.ok) {
      invoicePublicToken =
        String((converted as { invoice_public_token?: string | null }).invoice_public_token ?? '').trim() || null;
      if (!invoicePublicToken && converted.invoice_id) {
        const { data: qAfter } = await admin
          .from('quotes')
          .select('invoice_public_token')
          .eq('id', quoteId)
          .maybeSingle();
        invoicePublicToken =
          String((qAfter as { invoice_public_token?: string | null } | null)?.invoice_public_token ?? '').trim() || null;
      }
      if (!invoicePublicToken && converted.invoice_id) {
        invoicePublicToken = await resolveInvoicePublicTokenForQuote(
          admin as any,
          quoteId,
          String(converted.invoice_id),
          null
        );
      }
    }
    let autoSent = false;
    const { data: biz } = await admin
      .from('businesses')
      .select('payment_settings')
      .eq('id', businessId)
      .maybeSingle();
    const shouldAutoSend = Boolean(
      ((biz as { payment_settings?: { auto_send_invoice_on_quote_accept?: boolean } } | null)?.payment_settings
        ?.auto_send_invoice_on_quote_accept) ?? false
    );
    if (shouldAutoSend && converted.ok) {
      const sent = await autoSendInvoiceIfEligible(admin as any, {
        invoiceId: String(converted.invoice_id),
        businessId,
      });
      autoSent = Boolean(sent.ok && !sent.skipped);
    }
    return NextResponse.json({
      ok: true,
      status: 'accepted_customer',
      converted: true,
      invoice_id: converted.invoice_id,
      invoiceId: converted.invoice_id,
      invoicePublicToken,
      auto_sent: autoSent,
    });
  }

  const reason = String((body as { reason?: string }).reason ?? '').trim();
  if (!reason) return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
  const { error } = await admin
    .from('quotes')
    .update({
      status: 'rejected_customer',
      rejected_at: now,
      rejected_via: 'customer_portal',
      rejection_reason: reason,
      confirmation_channel: 'email',
      customer_actioned_at: now,
    })
    .eq('id', quoteId)
    .eq('status', 'sent');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await createActivity(admin as any, {
    business_id: businessId,
    eventType: 'quote_rejected',
    title: `Quote rejected by customer via email`,
    description: `Quote rejected by customer via email. Reason: ${reason}`,
    entityType: 'quote',
    entityId: quoteId,
    amount: Number(quote.total ?? 0),
    currencyCode: String(quote.currency ?? 'USD'),
    metadata: { source: 'public_quote_page', timestamp: now, reason },
  });
  await admin.from('quote_public_tokens').update({ consumed_at: now, updated_at: now }).eq('quote_id', quoteId);
  return NextResponse.json({ ok: true, status: 'rejected_customer' });
}
