import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildInvoicePdfBase64ForInvoiceId } from '@/lib/invoices/invoice-pdf-data';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const { base64, invoiceNumber } = await buildInvoicePdfBase64ForInvoiceId(supabase, {
      invoiceId: id,
      ownerUserId: user.id,
      paymentUrl: null,
    });

    const buf = Buffer.from(base64, 'base64');
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoiceNumber}.pdf"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate PDF';
    const status =
      message === 'Forbidden' ? 403 : message === 'Invoice not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
