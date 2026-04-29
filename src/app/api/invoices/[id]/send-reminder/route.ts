import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deliverInvoicePaymentReminder } from '@/lib/invoices/reminder-delivery';
import { isLocked } from '@/lib/invoices/edit-rules';
import { deriveInvoiceStatus } from '@/lib/invoices/status';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, business_id, status, total, amount_paid, balance_due')
    .eq('id', id)
    .single();

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', (invoice as { business_id: string }).business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = deriveInvoiceStatus({
    status: (invoice as { status: string }).status,
    total: Number((invoice as { total?: number }).total ?? 0),
    amount_paid: Number((invoice as { amount_paid?: number }).amount_paid ?? 0),
    balance_due:
      (invoice as { balance_due?: number | null }).balance_due != null
        ? Number((invoice as { balance_due?: number }).balance_due)
        : null,
  });

  if (isLocked(status) || String(status).toLowerCase() === 'draft') {
    return NextResponse.json({ error: 'This invoice cannot receive reminders.' }, { status: 400 });
  }

  const result = await deliverInvoicePaymentReminder(supabase, {
    invoiceId: id,
    ownerUserId: user.id,
    kind: 'manual',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Failed' }, { status: result.error === 'Forbidden' ? 403 : 400 });
  }
  if (result.skipped) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reminder_type: result.reminder_type ?? null,
      reminder_type_label: result.reminder_type_label ?? null,
    });
  }
  return NextResponse.json({
    ok: true,
    skipped: false,
    reminder_type: result.reminder_type,
    reminder_type_label: result.reminder_type_label,
  });
}
