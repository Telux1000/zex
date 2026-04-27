import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { inferLineTypeFromUnitLabel } from '@/lib/saved-line-items/infer-line-type';
import { normalizeLineItemName } from '@/lib/saved-line-items/names';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { recordLineItemFeatureUse } from '@/lib/saved-line-items/record-line-item-usage-analytics';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId } = await params;
  const perm = await assertBusinessPermission(supabase, businessId, user.id, 'view_data');
  if (!perm.ok) return perm.response;

  const { searchParams } = new URL(req.url);
  const search = String(searchParams.get('search') ?? '').trim().toLowerCase();
  const includeArchived = searchParams.get('include_archived') === '1';
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 100) || 100));

  let listQuery = supabase
    .from('saved_line_items')
    .select(
      'id, name, normalized_name, description, unit_label, unit_price, tax_percent, currency, line_type, usage_count, last_used_at, archived_at, created_at, updated_at'
    )
    .eq('business_id', businessId)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (!includeArchived) listQuery = listQuery.is('archived_at', null);

  const { data, error } = await listQuery;
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ items: [], _migrationPending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const rows = (data ?? []) as Array<{
    name: string;
    normalized_name: string;
  }>;
  const filtered = search
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          String((r as { description?: string | null }).description ?? '')
            .toLowerCase()
            .includes(search)
      )
    : rows;

  return NextResponse.json({ items: filtered });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId } = await params;
  const perm = await assertBusinessPermission(supabase, businessId, user.id, 'create_invoice');
  if (!perm.ok) return perm.response;

  const body = (await req.json()) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const cur = String(body.currency ?? 'USD')
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const unitLabel = normalizeInvoiceUnitLabel(String(body.unit_label ?? 'item'));
  const normalizedName = normalizeLineItemName(name);
  if (!normalizedName) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  const unitPrice = Math.min(1e10, Math.max(0, Number(body.unit_price) || 0));
  const taxPercent = Math.min(100, Math.max(0, Number(body.tax_percent) || 0));
  const lineType =
    String(body.line_type) === 'service' || String(body.line_type) === 'product' || String(body.line_type) === 'custom'
      ? String(body.line_type)
      : inferLineTypeFromUnitLabel(unitLabel);
  const now = new Date().toISOString();

  const { data: created, error } = await supabase
    .from('saved_line_items')
    .insert({
      business_id: businessId,
      name,
      normalized_name: normalizedName,
      description: body.description != null ? String(body.description).trim() || null : null,
      unit_label: unitLabel,
      unit_price: unitPrice,
      tax_percent: taxPercent,
      currency: cur,
      line_type: lineType,
      usage_count: 1,
      last_used_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A saved item with the same name, unit, and currency already exists.' },
        { status: 409 }
      );
    }
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Run database migrations' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await recordLineItemFeatureUse(supabase, {
    userId: user.id,
    businessId,
    targetKey: 'saved_line_item_created',
  });
  return NextResponse.json({ id: (created as { id: string }).id });
}
