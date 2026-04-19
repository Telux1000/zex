import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, business_id, invoice_number, customer_name, customer_email, total, currency, status, created_at, due_date, paid_at'
    )
    .order('created_at', { ascending: false })
    .limit(150);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_invoices',
    metadata: { count: data?.length ?? 0 },
  });

  return NextResponse.json({
    invoices:
      data?.map((inv) => ({
        ...inv,
        customer_email: null,
      })) ?? [],
  });
}
