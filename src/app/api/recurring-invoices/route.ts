import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { assertWorkspaceCoreWriteAccess } from '@/lib/billing/subscription-access';
import { resolveActorDisplayName } from '@/lib/audit-log';
import { buildTemplateSnapshotFromInvoiceSource } from '@/lib/recurring-invoice/template-snapshot';
import { computeInitialNextRun } from '@/lib/recurring-invoice/schedule';
import { recurringTemplateSnapshotSchema } from '@/lib/recurring-invoice/types';

const createBodySchema = z
  .object({
    business_id: z.string().uuid(),
    source_invoice_id: z.string().uuid(),
    frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_condition_type: z.enum(['never', 'end_date', 'count']),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    end_after_count: z.number().int().min(1).max(500).optional().nullable(),
    automation_mode: z.enum(['draft', 'auto_send']).optional().default('draft'),
  })
  .superRefine((data, ctx) => {
    if (data.end_condition_type === 'end_date' && !data.end_date) {
      ctx.addIssue({ code: 'custom', message: 'end_date required when end condition is end date', path: ['end_date'] });
    }
    if (data.end_condition_type === 'count' && (data.end_after_count == null || data.end_after_count < 1)) {
      ctx.addIssue({
        code: 'custom',
        message: 'end_after_count required when end condition is count',
        path: ['end_after_count'],
      });
    }
  });

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

  const gate = await assertBusinessPermission(supabase, businessId, user.id, 'view_data');
  if (!gate.ok) return gate.response;

  const { data: rows, error } = await supabase
    .from('recurring_invoice_rules')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rules = (rows ?? []).map((row) => {
    const snap = recurringTemplateSnapshotSchema.safeParse(row.template_snapshot);
    const customerLabel = snap.success ? snap.data.customer_name || 'Customer' : '—';
    return {
      id: row.id,
      business_id: row.business_id,
      source_invoice_id: row.source_invoice_id,
      frequency: row.frequency,
      start_date: row.start_date,
      next_run_date: row.next_run_date,
      end_condition_type: row.end_condition_type,
      end_date: row.end_date,
      end_after_count: row.end_after_count,
      automation_mode: row.automation_mode,
      status: row.status,
      invoices_generated_count: row.invoices_generated_count,
      last_generated_invoice_id: row.last_generated_invoice_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      customer_label: customerLabel,
    };
  });

  return NextResponse.json({ rules });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.json();
  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;

  const gate = await assertBusinessPermission(supabase, p.business_id, user.id, 'create_invoice');
  if (!gate.ok) {
    const manageGate = await assertBusinessPermission(supabase, p.business_id, user.id, 'manage_invoices');
    if (!manageGate.ok) return manageGate.response;
  }

  const { data: bOwner } = await supabase
    .from('businesses')
    .select('owner_id')
    .eq('id', p.business_id)
    .maybeSingle();
  if (bOwner) {
    const subGate = await assertWorkspaceCoreWriteAccess(
      supabase,
      String((bOwner as { owner_id: string }).owner_id)
    );
    if (!subGate.ok) return subGate.response;
  }

  const { data: source } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), invoice_payment_schedule_items(*)')
    .eq('id', p.source_invoice_id)
    .single();

  if (!source || String(source.business_id) !== p.business_id) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (String(source.status).toLowerCase() === 'voided') {
    return NextResponse.json({ error: 'Cannot use a voided invoice as a template' }, { status: 400 });
  }

  const items = (source.invoice_items ?? []) as unknown[];
  if (items.length < 1) {
    return NextResponse.json({ error: 'Invoice must have at least one line item' }, { status: 400 });
  }

  const template_snapshot = buildTemplateSnapshotFromInvoiceSource(source);

  const snapParsed = recurringTemplateSnapshotSchema.safeParse(template_snapshot);
  if (!snapParsed.success) {
    return NextResponse.json({ error: 'Could not build template from invoice' }, { status: 400 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const next_run_date = computeInitialNextRun(p.start_date, todayIso);

  if (p.end_condition_type === 'end_date' && p.end_date && next_run_date > p.end_date) {
    return NextResponse.json({ error: 'Start schedule is after the end date' }, { status: 400 });
  }

  const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';

  const { data: inserted, error: insErr } = await supabase
    .from('recurring_invoice_rules')
    .insert({
      business_id: p.business_id,
      source_invoice_id: p.source_invoice_id,
      template_snapshot: snapParsed.data,
      frequency: p.frequency,
      start_date: p.start_date,
      next_run_date,
      end_condition_type: p.end_condition_type,
      end_date: p.end_condition_type === 'end_date' ? p.end_date : null,
      end_after_count: p.end_condition_type === 'count' ? p.end_after_count : null,
      automation_mode: p.automation_mode,
      status: 'active',
      created_by: user.id,
    })
    .select('id, next_run_date, start_date, frequency, automation_mode, status')
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? 'Failed to save recurring rule' }, { status: 500 });
  }

  return NextResponse.json({
    id: inserted.id,
    next_invoice_date: inserted.next_run_date,
    next_run_date: inserted.next_run_date,
    message: 'Recurring invoice created',
    actorName,
  });
}
