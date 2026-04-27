import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadInvoiceDetailSecondaryData } from '@/lib/invoices/invoice-secondary.server';
import { invoiceSaveTimingEnabled } from '@/lib/dev/invoice-save-timing';

/**
 * After first paint: activity, next-reminder line, recurring summary, refund-accurate status.
 * Same auth/RLS as the dashboard invoice page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = invoiceSaveTimingEnabled() ? performance.now() : 0;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const result = await loadInvoiceDetailSecondaryData(supabase, user.id, id);
  if ('error' in result) {
    if (result.error === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (t0) {
    const ms = performance.now() - t0;
    const suf = id.length >= 4 ? id.slice(-4) : '****';
    console.log(
      `[invoice-save] server GET secondary-panels +${ms.toFixed(1)}ms id:…${suf}`
    );
  }
  return NextResponse.json(result);
}
