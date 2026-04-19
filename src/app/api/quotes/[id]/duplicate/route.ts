import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createActivity } from '@/lib/activity';
import { customerLabelFromSnapshot } from '@/lib/quotes/customer-label';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', id)
    .single();
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', quote.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: quoteNum } = await supabase.rpc('next_quote_number', { p_business_id: business.id });
  const quoteNumber = String(quoteNum ?? 'QT-0001');

  const { data: created, error: insertErr } = await supabase
    .from('quotes')
    .insert({
      business_id: quote.business_id,
      quote_number: quoteNumber,
      customer_id: quote.customer_id ?? null,
      customer_snapshot: quote.customer_snapshot ?? {},
      subtotal: quote.subtotal,
      tax_amount: quote.tax_amount,
      total: quote.total,
      currency: quote.currency,
      issue_date: quote.issue_date,
      expiry_date: quote.expiry_date ?? null,
      notes: quote.notes ?? null,
      status: 'draft',
      converted_invoice_id: null,
      converted_invoice_number: null,
      converted_at: null,
    })
    .select('id')
    .single();

  if (insertErr || !created) {
    return NextResponse.json({ error: insertErr?.message ?? 'Duplicate failed' }, { status: 500 });
  }

  const items = (quote.quote_items ?? []) as Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    tax_percent?: number | null;
  }>;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const amount = Number(item.quantity) * Number(item.unit_price);
    await supabase.from('quote_items').insert({
      quote_id: created.id,
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount,
      tax_percent: Number(item.tax_percent ?? 0),
      sort_order: i,
    });
  }

  const cust = customerLabelFromSnapshot(quote.customer_snapshot);
  const createdLine = `Quote ${quoteNumber} created for ${cust}`;
  await createActivity(supabase, {
    business_id: business.id,
    eventType: 'quote_created',
    title: createdLine,
    description: `${createdLine} (from ${quote.quote_number})`,
    entityType: 'quote',
    entityId: created.id,
    amount: Number(quote.total ?? 0),
    currencyCode: String(quote.currency ?? 'USD'),
    metadata: { quote_number: quoteNumber, copied_from: quote.id },
  });

  return NextResponse.json({ id: created.id, quote_number: quoteNumber });
}
