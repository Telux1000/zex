import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createActivity } from '@/lib/activity';
import { createQuoteBodySchema } from '@/lib/validations/quote';
import { customerLabelFromSnapshot } from '@/lib/quotes/customer-label';
import { notifyBusinessEvent } from '@/services/notifications';
import { assertInvoiceCreationReadiness } from '@/lib/onboarding/invoice-readiness-server';
import { assertWorkspaceCoreWriteAccess } from '@/lib/billing/subscription-access';

function calculateTotals(items: Array<{ quantity: number; unit_price: number; tax_percent?: number }>) {
  let subtotal = 0;
  let tax = 0;
  for (const item of items) {
    const line = Number(item.quantity) * Number(item.unit_price);
    subtotal += line;
    tax += line * (Number(item.tax_percent ?? 0) / 100);
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round((subtotal + tax) * 100) / 100,
  };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('quotes')
    .select('id, quote_number, customer_snapshot, issue_date, expiry_date, status, total, currency, confirmation_channel, created_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ quotes: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const businessId = String(body.business_id ?? '').trim();
  if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

  const parsed = createQuoteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('id', businessId)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const subGate = await assertWorkspaceCoreWriteAccess(
    supabase,
    String((business as { owner_id: string }).owner_id)
  );
  if (!subGate.ok) return subGate.response;

  const readiness = await assertInvoiceCreationReadiness(supabase, businessId);
  if (!readiness.ok) return readiness.response;

  const p = parsed.data;
  const totals = calculateTotals(p.items);
  if (totals.total <= 0) {
    return NextResponse.json({ error: 'Quote total must be greater than zero.' }, { status: 400 });
  }

  const { data: quoteNum } = await supabase.rpc('next_quote_number', { p_business_id: business.id });
  const quoteNumber = String(quoteNum ?? 'QT-0001');

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      business_id: business.id,
      quote_number: quoteNumber,
      customer_id: p.customer_id ?? null,
      customer_snapshot: p.customer_snapshot,
      subtotal: totals.subtotal,
      tax_amount: totals.tax,
      total: totals.total,
      currency: p.currency,
      issue_date: p.issue_date,
      expiry_date: p.expiry_date ?? null,
      notes: p.notes ?? null,
      status: 'draft',
    })
    .select('id')
    .single();

  if (quoteError || !quote) return NextResponse.json({ error: quoteError?.message ?? 'Create failed' }, { status: 500 });

  for (let i = 0; i < p.items.length; i++) {
    const item = p.items[i];
    const amount = Number(item.quantity) * Number(item.unit_price);
    await supabase.from('quote_items').insert({
      quote_id: quote.id,
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount,
      tax_percent: item.tax_percent ?? 0,
      sort_order: i,
    });
  }

  const custLabel = customerLabelFromSnapshot(p.customer_snapshot);
  const createdLine = `Quote ${quoteNumber} created for ${custLabel}`;
  await createActivity(supabase, {
    business_id: business.id,
    eventType: 'quote_created',
    title: createdLine,
    description: createdLine,
    entityType: 'quote',
    entityId: quote.id,
    amount: totals.total,
    currencyCode: p.currency,
    metadata: { quote_number: quoteNumber },
  });

  await notifyBusinessEvent(supabase, {
    businessId: business.id,
    eventType: 'quote_created',
    title: createdLine,
    message: createdLine,
    entityType: 'quote',
    entityId: quote.id,
    severity: 'info',
    groupKey: `quote_created:${quote.id}`,
  });

  return NextResponse.json({ id: quote.id, quote_number: quoteNumber });
}

