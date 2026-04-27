import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { buildInvoiceListCsvString, MAX_INVOICE_CSV_EXPORT_ROWS } from '@/lib/invoices/invoice-csv-list';
import { runInvoiceListDataPipeline } from '@/lib/invoices/invoice-list-data-pipeline.server';
import {
  INVOICE_LIST_LEAN_CSV_EXPORT_COLS,
  INVOICE_LIST_LEAN_CSV_EXPORT_COLS_LEGACY,
  parseInvoiceListRequestParams,
} from '@/lib/invoices/invoice-list-sql-path';

/**
 * GET /api/invoices/export-csv?business_id=…& same query params as GET /api/invoices
 * (filters, search, sort, order). No pagination — exports up to {@link MAX_INVOICE_CSV_EXPORT_ROWS} rows.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
  }

  const listPerm = await assertBusinessPermission(supabase, businessId, user.id, 'view_data');
  if (!listPerm.ok) return listPerm.response;

  const { data: business } = await supabase
    .from('businesses')
    .select('id, currency')
    .eq('id', businessId)
    .single();
  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  const { listParams } = parseInvoiceListRequestParams(searchParams);
  const pipeline = await runInvoiceListDataPipeline({
    supabase,
    business: business as { id: string; currency?: string | null },
    listParams,
    mode: {
      kind: 'export_csv',
      maxRows: MAX_INVOICE_CSV_EXPORT_ROWS,
      selectPrimary: INVOICE_LIST_LEAN_CSV_EXPORT_COLS,
      selectLegacy: INVOICE_LIST_LEAN_CSV_EXPORT_COLS_LEGACY,
      perf: null,
    },
  });

  if (!pipeline.ok) {
    return NextResponse.json({ error: pipeline.error.message }, { status: 500 });
  }
  const { body } = buildInvoiceListCsvString(pipeline.invoices);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `zenzex-invoices-${dateStr}.csv`;

  const enc = new TextEncoder();
  const u8 = enc.encode('\uFEFF' + body);
  return new NextResponse(u8, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      ...(pipeline.exportCapped
        ? { 'X-Zenzex-Export-Row-Cap-Applied': '1' }
        : {}),
    },
  });
}
