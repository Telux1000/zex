import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { findQuoteByPublicToken } from '@/lib/quotes/public-token';
import { resolveInvoicePublicTokenForQuote } from '@/lib/quotes/public-quote-invoice-token';
import { PublicQuoteViewClient } from '@/components/quotes/PublicQuoteViewClient';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = getSupabaseServiceAdmin();
  if (!admin) notFound();

  const resolved = await findQuoteByPublicToken(admin, token);
  if (!resolved) notFound();
  if (resolved.linkExpired) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto max-w-xl px-4 py-20">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center">
            <h1 className="text-2xl font-semibold">This link has expired</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Please request a new quote link from the sender.
            </p>
          </div>
        </div>
      </div>
    );
  }
  const resolvedQuote = resolved.quotes as Record<string, unknown>;
  const quoteId = String(resolvedQuote.id ?? '');
  const { data: quote } = await admin
    .from('quotes')
    .select(
      'id, business_id, quote_number, issue_date, expiry_date, status, currency, subtotal, tax_amount, total, notes, customer_snapshot, accepted_at, accepted_via, accepted_note, rejected_at, rejected_via, rejection_reason, confirmation_channel, converted_invoice_id, invoice_public_token'
    )
    .eq('id', quoteId)
    .maybeSingle();
  if (!quote) notFound();
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
  const convertedInvoiceId = String(quote.converted_invoice_id ?? '').trim();
  let invoicePublicToken: string | null = null;
  if (convertedInvoiceId) {
    invoicePublicToken = await resolveInvoicePublicTokenForQuote(
      admin as any,
      String(quote.id),
      convertedInvoiceId,
      (quote as { invoice_public_token?: string | null }).invoice_public_token
    );
  }

  const payload = {
    id: String(quote.id),
    quote_number: String(quote.quote_number ?? ''),
    issue_date: String(quote.issue_date ?? ''),
    expiry_date: (quote.expiry_date as string | null) ?? null,
    status: String(quote.status ?? ''),
    currency: String(quote.currency ?? 'USD'),
    subtotal: Number(quote.subtotal ?? 0),
    tax_amount: Number(quote.tax_amount ?? 0),
    total: Number(quote.total ?? 0),
    notes: (quote.notes as string | null) ?? null,
    customer_snapshot: (quote.customer_snapshot as Record<string, unknown> | null) ?? null,
    accepted_at: (quote.accepted_at as string | null) ?? null,
    accepted_via: (quote.accepted_via as string | null) ?? null,
    accepted_note: (quote.accepted_note as string | null) ?? null,
    rejected_at: (quote.rejected_at as string | null) ?? null,
    rejected_via: (quote.rejected_via as string | null) ?? null,
    rejection_reason: (quote.rejection_reason as string | null) ?? null,
    confirmation_channel: (quote.confirmation_channel as 'email' | 'phone' | 'in_person' | null) ?? null,
    converted_invoice_id: (quote.converted_invoice_id as string | null) ?? null,
    invoicePublicToken,
    business: (business as Record<string, unknown> | null) ?? null,
    items: (items as Array<Record<string, unknown>> | null) ?? [],
  };

  return <PublicQuoteViewClient token={token} initialQuote={payload} />;
}
