import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { QuoteDocumentPreview } from '@/components/quotes/QuoteDocumentPreview';
import type { QuoteIssuerInfo } from '@/lib/quotes/issuer';
import type { CustomerSnapshotInput } from '@/lib/quotes/address-format';
import { QuotePreviewActions } from '@/components/quotes/QuotePreviewActions';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;
  const { id } = await params;

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', id)
    .single();
  if (!quote) notFound();

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('id', quote.business_id)
    .single();
  if (!business || business.owner_id !== user.id) notFound();

  const { data: issuerRow } = await supabase
    .from('businesses')
    .select('name, logo_url, email, phone, tax_id, address_line1, address_line2, city, state, postal_code, country')
    .eq('id', quote.business_id)
    .single();

  const issuer: QuoteIssuerInfo = {
    name: String(issuerRow?.name ?? '').trim() || 'Business',
    logo_url: issuerRow?.logo_url ?? null,
    email: issuerRow?.email ?? null,
    phone: issuerRow?.phone ?? null,
    tax_id: issuerRow?.tax_id ?? null,
    address_line1: issuerRow?.address_line1 ?? null,
    address_line2: issuerRow?.address_line2 ?? null,
    city: issuerRow?.city ?? null,
    state: issuerRow?.state ?? null,
    postal_code: issuerRow?.postal_code ?? null,
    country: issuerRow?.country ?? null,
  };

  const snapshot = (quote.customer_snapshot as CustomerSnapshotInput | null) ?? {};
  const items = ((quote.quote_items ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    amount: number;
    tax_percent: number;
    sort_order?: number;
  }>)
    .slice()
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map((item) => ({
      name: item.name,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      amount: Number(item.amount ?? 0),
      tax_percent: Number(item.tax_percent ?? 0),
    }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/dashboard/quotes"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to quotes
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quote</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Saved document · {String(quote.quote_number)}
          </p>
          {quote.converted_invoice_id && quote.converted_invoice_number ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Converted to{' '}
              <Link
                href={`/dashboard/invoices/${quote.converted_invoice_id}`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Invoice {String(quote.converted_invoice_number)}
              </Link>
            </p>
          ) : null}
        </div>
        <QuotePreviewActions
          quoteId={quote.id}
          status={quote.status}
          convertedInvoiceId={(quote.converted_invoice_id as string | null) ?? null}
        />
      </div>

      <div className="invoice-print-container">
        <QuoteDocumentPreview
          issuer={issuer}
          quoteNumber={String(quote.quote_number)}
          issueDate={String(quote.issue_date)}
          expiryDate={quote.expiry_date ? String(quote.expiry_date) : null}
          currency={String(quote.currency ?? 'USD')}
          status={String(quote.status)}
          customerSnapshot={snapshot}
          items={items}
          subtotal={Number(quote.subtotal ?? 0)}
          tax={Number(quote.tax_amount ?? 0)}
          total={Number(quote.total ?? 0)}
          notes={(quote.notes as string | null) ?? null}
          acceptedAt={(quote as { accepted_at?: string | null }).accepted_at ?? null}
          acceptedVia={(quote as { accepted_via?: string | null }).accepted_via ?? null}
          acceptedNote={(quote as { accepted_note?: string | null }).accepted_note ?? null}
          rejectedAt={(quote as { rejected_at?: string | null }).rejected_at ?? null}
          rejectedVia={(quote as { rejected_via?: string | null }).rejected_via ?? null}
          rejectionReason={(quote as { rejection_reason?: string | null }).rejection_reason ?? null}
          confirmationChannel={(quote as { confirmation_channel?: 'email' | 'phone' | 'in_person' | null }).confirmation_channel ?? null}
        />
      </div>

    </div>
  );
}
