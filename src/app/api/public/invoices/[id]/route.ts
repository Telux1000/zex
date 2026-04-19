import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildPublicCustomerSnapshotFromInvoiceRow } from '@/lib/invoices/invoice-public-customer';

/**
 * Public invoice fetch by ID. Only returns non-draft invoices.
 * Used by the public invoice page /i/[id].
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();

  if (invError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.status === 'draft') {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const [itemsRes, businessRes, themeRes] = await Promise.all([
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('businesses').select('id, name, logo_url, currency, address_line1, city, state, postal_code, country').eq('id', invoice.business_id).single(),
    invoice.theme_id
      ? supabase.from('invoice_themes').select('*').eq('id', invoice.theme_id).single()
      : supabase.from('invoice_themes').select('*').eq('business_id', invoice.business_id).eq('is_default', true).single(),
  ]);

  const customerSnapshot = buildPublicCustomerSnapshotFromInvoiceRow(invoice);

  return NextResponse.json({
    invoice: { ...invoice, customerSnapshot },
    items: itemsRes.data ?? [],
    business: businessRes.data ?? null,
    theme: themeRes.data ?? null,
  });
}
