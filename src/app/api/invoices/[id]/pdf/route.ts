import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildInvoicePdfBase64ForInvoiceId } from '@/lib/invoices/invoice-pdf-data';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const { base64, invoiceNumber, templateId, renderer } = await buildInvoicePdfBase64ForInvoiceId(
      supabase,
      {
        invoiceId: id,
        ownerUserId: user.id,
        paymentUrl: null,
        requestOrigin: new URL(req.url).origin,
      }
    );

    const buf = Buffer.from(base64, 'base64');
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoiceNumber}.pdf"`,
        'X-Invoice-Template-Id': templateId,
        'X-Invoice-Renderer': renderer === 'puppeteer-shared' ? 'shared' : 'pdf-lib-legacy',
        'X-Invoice-Pdf-Mode': renderer,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate PDF';
    const status =
      message === 'Forbidden' ? 403 : message === 'Invoice not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
