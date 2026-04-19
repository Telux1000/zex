import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';

const patchSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  end_condition_type: z.enum(['never', 'end_date', 'count']).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_after_count: z.number().int().min(1).max(500).nullable().optional(),
  automation_mode: z.enum(['draft', 'auto_send']).optional(),
  next_run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  const { data: row, error } = await supabase.from('recurring_invoice_rules').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const gate = await assertBusinessPermission(supabase, row.business_id, user.id, 'view_data');
  if (!gate.ok) return gate.response;

  return NextResponse.json({ rule: row });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const { data: row } = await supabase.from('recurring_invoice_rules').select('*').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const gate = await assertBusinessPermission(supabase, row.business_id, user.id, 'create_invoice');
  if (!gate.ok) {
    const manageGate = await assertBusinessPermission(supabase, row.business_id, user.id, 'manage_invoices');
    if (!manageGate.ok) return manageGate.response;
  }

  const raw = await req.json();
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;

  const updates: Record<string, unknown> = {};

  if (p.status !== undefined) updates.status = p.status;
  if (p.frequency !== undefined) updates.frequency = p.frequency;
  if (p.automation_mode !== undefined) updates.automation_mode = p.automation_mode;
  if (p.next_run_date !== undefined) updates.next_run_date = p.next_run_date;

  if (p.end_condition_type !== undefined) {
    updates.end_condition_type = p.end_condition_type;
    if (p.end_condition_type === 'never') {
      updates.end_date = null;
      updates.end_after_count = null;
    } else if (p.end_condition_type === 'end_date') {
      const endD = p.end_date !== undefined ? p.end_date : row.end_date;
      if (!endD) {
        return NextResponse.json({ error: 'end_date is required for end date condition' }, { status: 400 });
      }
      updates.end_date = endD;
      updates.end_after_count = null;
    } else if (p.end_condition_type === 'count') {
      const cnt = p.end_after_count !== undefined ? p.end_after_count : row.end_after_count;
      if (cnt == null || cnt < 1) {
        return NextResponse.json({ error: 'end_after_count is required for count condition' }, { status: 400 });
      }
      updates.end_after_count = cnt;
      updates.end_date = null;
    }
  } else {
    if (p.end_date !== undefined) updates.end_date = p.end_date;
    if (p.end_after_count !== undefined) updates.end_after_count = p.end_after_count;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from('recurring_invoice_rules')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (upErr || !updated) {
    return NextResponse.json({ error: upErr?.message ?? 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ rule: updated });
}
