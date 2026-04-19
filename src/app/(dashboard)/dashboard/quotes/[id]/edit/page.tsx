import { notFound } from 'next/navigation';
import { QuoteForm } from '@/components/quotes/QuoteForm';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import type { QuoteIssuerInfo } from '@/lib/quotes/issuer';
import type { CustomerSnapshotInput } from '@/lib/quotes/address-format';

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
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
    .eq('id', business.id)
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

  const { data: customerRows } = await supabase
    .from('customers')
    .select('id, name, company, email, address_line1, address_line2, city, state, postal_code, country')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const customers = (customerRows ?? []).map((c) => {
    const label = String(c.company || c.name || 'Customer').trim();
    return {
      id: String(c.id),
      label,
      company: c.company ?? null,
      email: c.email ?? null,
      address_line1: c.address_line1 ?? null,
      address_line2: c.address_line2 ?? null,
      city: c.city ?? null,
      state: c.state ?? null,
      postal_code: c.postal_code ?? null,
      country: c.country ?? null,
    };
  });

  const snap = (quote.customer_snapshot as CustomerSnapshotInput | null) ?? {};

  const initialQuote = {
    id: quote.id as string,
    quote_number: String(quote.quote_number),
    customer_id: (quote.customer_id as string | null) ?? null,
    customer_snapshot: {
      name: String(snap.name ?? '').trim() || '',
      email: snap.email ?? null,
      address: snap.address ?? null,
      company: snap.company ?? null,
      address_line1: snap.address_line1 ?? null,
      address_line2: snap.address_line2 ?? null,
      city: snap.city ?? null,
      state: snap.state ?? null,
      postal_code: snap.postal_code ?? null,
      country: snap.country ?? null,
      use_delivery_address: !!snap.use_delivery_address,
      delivery_address_line1: snap.delivery_address_line1 ?? null,
      delivery_address_line2: snap.delivery_address_line2 ?? null,
      delivery_city: snap.delivery_city ?? null,
      delivery_state: snap.delivery_state ?? null,
      delivery_postal_code: snap.delivery_postal_code ?? null,
      delivery_country: snap.delivery_country ?? null,
    },
    issue_date: String(quote.issue_date),
    expiry_date: (quote.expiry_date as string | null) ?? null,
    notes: (quote.notes as string | null) ?? null,
    currency: String(quote.currency ?? 'USD'),
    quote_items: ((quote.quote_items as Array<{
      name: string;
      description?: string | null;
      quantity: number;
      unit_price: number;
      tax_percent?: number;
      sort_order?: number;
    }> | null) ?? [])
      .slice()
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
      .map((item) => ({
        name: item.name,
        description: item.description ?? '',
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        tax_percent: Number(item.tax_percent ?? 0),
      })),
  };

  return (
    <QuoteForm
      businessId={business.id}
      customers={customers}
      issuer={issuer}
      mode="edit"
      initialQuote={initialQuote}
    />
  );
}
