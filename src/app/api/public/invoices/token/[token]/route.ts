import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { findInvoiceByPublicToken } from '@/lib/invoices/public-token';
import { buildPublicCustomerSnapshotFromInvoiceRow } from '@/lib/invoices/invoice-public-customer';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createServiceClient();
  const resolved = await findInvoiceByPublicToken(supabase as any, token);
  if (!resolved) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (resolved.linkExpired) return NextResponse.json({ error: 'This link has expired' }, { status: 410 });

  const invoice = resolved.invoices as Record<string, any>;
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const invoiceId = String(invoice.id);
  const [itemsRes, businessRes, themeRes] = await Promise.all([
    supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
    supabase
      .from('businesses')
      .select('id, name, logo_url, currency, address_line1, city, state, postal_code, country')
      .eq('id', String(invoice.business_id))
      .single(),
    invoice.theme_id
      ? supabase.from('invoice_themes').select('*').eq('id', String(invoice.theme_id)).single()
      : supabase
          .from('invoice_themes')
          .select('*')
          .eq('business_id', String(invoice.business_id))
          .eq('is_default', true)
          .single(),
  ]);

  const customerSnapshot = buildPublicCustomerSnapshotFromInvoiceRow(invoice);

  return NextResponse.json({
    invoice: {
      ...invoice,
      customerSnapshot,
    },
    items: itemsRes.data ?? [],
    business: businessRes.data ?? null,
    theme: themeRes.data ?? null,
  });
}
