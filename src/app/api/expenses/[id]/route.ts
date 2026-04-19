import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createActivity, getChangedExpenseFields } from '@/lib/activity';
import { formatCurrencyAmount } from '@/lib/utils/currency';

type Ctx = { params: Promise<{ id: string }> };

async function assertExpenseOwner(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: string) {
  const { data: row, error } = await supabase
    .from('expenses')
    .select('id, business_id, attachment_url, description, category, amount')
    .eq('id', id)
    .single();
  if (error || !row) return { error: 'Not found' as const, status: 404 as const };
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', row.business_id)
    .eq('owner_id', userId)
    .single();
  if (!biz) return { error: 'Not found' as const, status: 404 as const };
  return { row };
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const check = await assertExpenseOwner(supabase, user.id, id);
    if ('error' in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.description != null) updates.description = String(body.description).trim();
    if (body.category != null) updates.category = String(body.category).trim() || 'General';
    if (body.amount != null) {
      const n = Number(body.amount);
      if (!Number.isFinite(n)) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
      updates.amount = n;
    }
    if (body.expense_date != null) {
      updates.expense_date = String(body.expense_date).slice(0, 10);
    }
    if (body.attachment_url !== undefined) {
      updates.attachment_url =
        body.attachment_url != null && String(body.attachment_url).trim() !== ''
          ? String(body.attachment_url).trim()
          : null;
    }
    if (body.attachment_name !== undefined) {
      updates.attachment_name =
        body.attachment_name != null && String(body.attachment_name).trim() !== ''
          ? String(body.attachment_name).trim()
          : null;
    }
    if (body.attachment_type !== undefined) {
      updates.attachment_type =
        body.attachment_type != null && String(body.attachment_type).trim() !== ''
          ? String(body.attachment_type).trim()
          : null;
    }
    if (body.attachment_size !== undefined) {
      updates.attachment_size =
        body.attachment_size != null && Number.isFinite(Number(body.attachment_size))
          ? Number(body.attachment_size)
          : null;
    }
    if (body.notes !== undefined) {
      updates.notes =
        body.notes != null && String(body.notes).trim() !== '' ? String(body.notes).trim() : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const prev = check.row;
    const { data: row, error } = await supabase.from('expenses').update(updates).eq('id', id).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: biz } = await supabase
      .from('businesses')
      .select('currency')
      .eq('id', prev.business_id)
      .single();
    const cur = (biz as { currency?: string } | null)?.currency ?? 'USD';
    const hadAtt = Boolean(String(prev.attachment_url ?? '').trim());
    const nowAtt = Boolean(String((row as { attachment_url?: string }).attachment_url ?? '').trim());
    const changed = getChangedExpenseFields(
      prev as unknown as Record<string, unknown>,
      row as unknown as Record<string, unknown>
    );
    if (!hadAtt && nowAtt) {
      await createActivity(supabase, {
        business_id: prev.business_id,
        eventType: 'expense_attachment_added',
        title: 'Expense attachment added',
        description: String((row as { description?: string }).description ?? prev.description ?? ''),
        entityType: 'expense',
        entityId: id,
      });
    }
    if (changed.length > 0) {
      await createActivity(supabase, {
        business_id: prev.business_id,
        eventType: 'expense_updated',
        title: 'Expense updated',
        description: `${formatCurrencyAmount(Number((row as { amount?: number }).amount ?? prev.amount), cur)} — ${String((row as { description?: string }).description ?? prev.description)}`,
        entityType: 'expense',
        entityId: id,
        amount: Number((row as { amount?: number }).amount ?? prev.amount),
        currencyCode: cur,
        metadata: { changed_fields: changed },
      });
    }
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const check = await assertExpenseOwner(supabase, user.id, id);
  if ('error' in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const snap = check.row;
  const { data: biz } = await supabase
    .from('businesses')
    .select('currency')
    .eq('id', snap.business_id)
    .single();
  const cur = (biz as { currency?: string } | null)?.currency ?? 'USD';
  await createActivity(supabase, {
    business_id: snap.business_id,
    eventType: 'expense_deleted',
    title: 'Expense deleted',
    description: `${formatCurrencyAmount(Number(snap.amount), cur)} — ${String(snap.description ?? '')}`,
    entityType: 'expense',
    entityId: id,
    amount: Number(snap.amount),
    currencyCode: cur,
  });
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
