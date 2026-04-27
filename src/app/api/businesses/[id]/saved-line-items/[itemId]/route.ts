import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { inferLineTypeFromUnitLabel } from '@/lib/saved-line-items/infer-line-type';
import { normalizeLineItemName } from '@/lib/saved-line-items/names';
import { recordLineItemFeatureUse } from '@/lib/saved-line-items/record-line-item-usage-analytics';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: businessId, itemId } = await params;
  const perm = await assertBusinessPermission(supabase, businessId, user.id, 'edit_invoice');
  if (!perm.ok) return perm.response;

  const { data: row, error: fetchErr } = await supabase
    .from('saved_line_items')
    .select('id, business_id, currency')
    .eq('id', itemId)
    .single();
  if (fetchErr || !row || String((row as { business_id: string }).business_id) !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name != null) {
    const n = String(body.name).trim();
    if (!n) return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    updates.name = n;
    updates.normalized_name = normalizeLineItemName(n);
  }
  if (body.description !== undefined) {
    updates.description = body.description == null || String(body.description).trim() === '' ? null : String(body.description).trim();
  }
  if (body.unit_label != null) {
    updates.unit_label = normalizeInvoiceUnitLabel(String(body.unit_label));
    if (body.line_type === undefined) updates.line_type = inferLineTypeFromUnitLabel(String(updates.unit_label));
  }
  if (body.unit_price != null) {
    const up = Math.min(1e10, Math.max(0, Number(body.unit_price) || 0));
    updates.unit_price = up;
  }
  if (body.currency != null) {
    const c = String(body.currency)
      .trim()
      .toUpperCase()
      .slice(0, 3);
    if (c.length === 3) updates.currency = c;
  }
  if (body.tax_percent != null) {
    updates.tax_percent = Math.min(100, Math.max(0, Number(body.tax_percent) || 0));
  }
  if (body.line_type != null) {
    const t = String(body.line_type);
    if (t === 'service' || t === 'product' || t === 'custom') updates.line_type = t;
  }
  if (body.archived === true) {
    updates.archived_at = new Date().toISOString();
  } else if (body.archived === false) {
    updates.archived_at = null;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { error } = await supabase.from('saved_line_items').update(updates).eq('id', itemId);

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Another item already uses this name, unit, and currency.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'archived_at') && updates.archived_at) {
    await recordLineItemFeatureUse(supabase, {
      userId: user.id,
      businessId,
      targetKey: 'saved_line_item_archived',
    });
  } else if (Object.keys(updates).length > 1) {
    await recordLineItemFeatureUse(supabase, {
      userId: user.id,
      businessId,
      targetKey: 'saved_line_item_updated',
    });
  }
  return NextResponse.json({ ok: true });
}
