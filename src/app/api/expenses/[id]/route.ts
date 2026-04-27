import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createActivity, getChangedExpenseFields } from '@/lib/activity';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import {
  buildExpenseFxColumns,
  expenseAmountInBase,
  expenseOriginalCurrency,
} from '@/lib/expenses/expense-base-amount';
import { resolveExchangeRateToBase } from '@/lib/invoices/fx-snapshot';

type Ctx = { params: Promise<{ id: string }> };

async function assertExpenseOwner(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: string) {
  const { data: row, error } = await supabase
    .from('expenses')
    .select(
      'id, business_id, attachment_url, description, category, amount, currency, base_currency, base_amount, exchange_rate'
    )
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
    if (body.currency !== undefined) {
      updates.currency =
        body.currency != null && String(body.currency).trim() !== ''
          ? String(body.currency).trim().toUpperCase()
          : null;
    }
    if (body.exchange_rate !== undefined) {
      const r = Number(body.exchange_rate);
      if (body.exchange_rate != null && (!Number.isFinite(r) || r <= 0)) {
        return NextResponse.json({ error: 'Invalid exchange rate' }, { status: 400 });
      }
      updates.exchange_rate = body.exchange_rate != null ? r : null;
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

    const prev = check.row as Record<string, unknown>;
    const { data: biz } = await supabase
      .from('businesses')
      .select('currency')
      .eq('id', prev.business_id as string)
      .single();
    const baseCur = String((biz as { currency?: string } | null)?.currency ?? 'USD')
      .trim()
      .toUpperCase() || 'USD';

    const fxTouched =
      updates.amount !== undefined || updates.currency !== undefined || updates.exchange_rate !== undefined;
    if (fxTouched) {
      const amt = Number(updates.amount !== undefined ? updates.amount : prev.amount);
      if (!Number.isFinite(amt)) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
      }
      const mergedCurrency =
        updates.currency !== undefined ? (updates.currency as string | null) : (prev.currency as string | null);
      const curFx = (
        mergedCurrency != null && String(mergedCurrency).trim() !== '' ? String(mergedCurrency).trim() : baseCur
      ).toUpperCase();
      let rate =
        updates.exchange_rate !== undefined
          ? (updates.exchange_rate as number | null)
          : (prev.exchange_rate as number | null);
      let rateN = rate != null ? Number(rate) : NaN;
      if (curFx === baseCur) {
        rateN = 1;
      } else if (!Number.isFinite(rateN) || rateN <= 0) {
        try {
          rateN = await resolveExchangeRateToBase(curFx, baseCur, null);
        } catch {
          return NextResponse.json(
            { error: 'Could not resolve exchange rate. Enter an exchange rate or try again.' },
            { status: 400 }
          );
        }
      }
      let fxCols: ReturnType<typeof buildExpenseFxColumns>;
      try {
        fxCols = buildExpenseFxColumns(amt, curFx, baseCur, rateN);
      } catch {
        return NextResponse.json({ error: 'Invalid exchange rate' }, { status: 400 });
      }
      updates.currency = fxCols.currency;
      updates.base_currency = fxCols.base_currency;
      updates.base_amount = fxCols.base_amount;
      updates.exchange_rate = fxCols.exchange_rate;
    }

    const { data: row, error } = await supabase.from('expenses').update(updates).eq('id', id).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const cur = baseCur;
    const hadAtt = Boolean(String(prev.attachment_url ?? '').trim());
    const nowAtt = Boolean(String((row as { attachment_url?: string }).attachment_url ?? '').trim());
    const changed = getChangedExpenseFields(
      prev as unknown as Record<string, unknown>,
      row as unknown as Record<string, unknown>
    );
    if (!hadAtt && nowAtt) {
      await createActivity(supabase, {
        business_id: prev.business_id as string,
        eventType: 'expense_attachment_added',
        title: 'Expense attachment added',
        description: String((row as { description?: string }).description ?? prev.description ?? ''),
        entityType: 'expense',
        entityId: id,
      });
    }
    if (changed.length > 0) {
      const rowRec = row as Record<string, unknown>;
      const dispCur = expenseOriginalCurrency(rowRec, cur);
      await createActivity(supabase, {
        business_id: prev.business_id as string,
        eventType: 'expense_updated',
        title: 'Expense updated',
        description: `${formatCurrencyAmount(Number((row as { amount?: number }).amount ?? prev.amount), dispCur)} — ${String((row as { description?: string }).description ?? prev.description)}`,
        entityType: 'expense',
        entityId: id,
        amount: expenseAmountInBase(rowRec, cur),
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

  const snap = check.row as Record<string, unknown>;
  const { data: biz } = await supabase
    .from('businesses')
    .select('currency')
    .eq('id', snap.business_id as string)
    .single();
  const cur = String((biz as { currency?: string } | null)?.currency ?? 'USD')
    .trim()
    .toUpperCase() || 'USD';
  const dispCur = expenseOriginalCurrency(snap, cur);
  await createActivity(supabase, {
    business_id: snap.business_id as string,
    eventType: 'expense_deleted',
    title: 'Expense deleted',
    description: `${formatCurrencyAmount(Number(snap.amount), dispCur)} — ${String(snap.description ?? '')}`,
    entityType: 'expense',
    entityId: id,
    amount: expenseAmountInBase(snap, cur),
    currencyCode: cur,
  });
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
