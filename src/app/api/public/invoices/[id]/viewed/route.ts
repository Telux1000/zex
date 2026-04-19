import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createActivity } from '@/lib/activity';

/**
 * Mark invoice as viewed (idempotent). Called when client loads the public invoice page.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServiceClient();

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status, business_id')
    .eq('id', id)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (invoice.status !== 'sent') {
    return NextResponse.json({ ok: true });
  }

  await supabase
    .from('invoices')
    .update({
      status: 'viewed',
      viewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  await createActivity(supabase, {
    business_id: invoice.business_id,
    eventType: 'invoice_viewed',
    title: 'Invoice viewed by client',
    entityType: 'invoice',
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
