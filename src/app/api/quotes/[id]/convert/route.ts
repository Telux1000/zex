import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { convertQuoteToInvoice } from '@/lib/quotes/convert-to-invoice';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, business_id')
    .eq('id', id)
    .single();
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('id', quote.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = await convertQuoteToInvoice(supabase, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.alreadyConverted) {
    return NextResponse.json(
      { error: 'This quote has already been converted.', invoice_id: result.invoice_id, invoice_number: result.invoice_number },
      { status: 400 }
    );
  }
  return NextResponse.json({ invoice_id: result.invoice_id, invoice_number: result.invoice_number });
}

