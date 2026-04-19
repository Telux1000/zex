import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createActivity } from '@/lib/activity';
import { findInvoiceByPublicToken } from '@/lib/invoices/public-token';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createServiceClient();
  const resolved = await findInvoiceByPublicToken(supabase as any, token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (resolved.linkExpired) return NextResponse.json({ error: 'This link has expired' }, { status: 410 });

  const invoice = resolved.invoices as Record<string, any>;
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const invoiceId = String(invoice.id);
  const status = String(invoice.status ?? '');
  if (status !== 'sent') return NextResponse.json({ ok: true });

  await supabase
    .from('invoices')
    .update({
      status: 'viewed',
      viewed_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  await createActivity(supabase, {
    business_id: String(invoice.business_id ?? ''),
    eventType: 'invoice_viewed',
    title: 'Invoice viewed by client',
    entityType: 'invoice',
    entityId: invoiceId,
  });

  return NextResponse.json({ ok: true });
}
