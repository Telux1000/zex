import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { labelForSupportTicketTargetUserId } from '@/lib/admin/support-ticket-target-user-label';

export async function POST(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { ticketId } = await params;
  let body: { body?: string };
  try {
    body = (await req.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = String(body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  const { data: ticket, error: tErr } = await gate.supabase
    .from('support_tickets')
    .select('id, target_user_id, ticket_number')
    .eq('id', ticketId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();
  const { data: inserted, error: nErr } = await gate.supabase
    .from('support_ticket_internal_notes')
    .insert({
      ticket_id: ticketId,
      author_user_id: gate.user.id,
      body: text,
    })
    .select('id, author_user_id, body, created_at')
    .single();

  if (nErr || !inserted) return NextResponse.json({ error: nErr?.message ?? 'Insert failed' }, { status: 400 });

  await gate.supabase.from('support_tickets').update({ updated_at: now }).eq('id', ticketId);

  const adminSvc = getSupabaseServiceAdmin();
  const targetUserLabel =
    adminSvc && ticket.target_user_id
      ? await labelForSupportTicketTargetUserId(adminSvc, ticket.target_user_id)
      : null;
  const ticketNo = (ticket as { ticket_number?: number }).ticket_number;

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'admin_ticket_internal_note_added',
    targetType: 'support_ticket',
    targetId: ticketId,
    metadata: {
      ...(typeof ticketNo === 'number' ? { ticket_number: ticketNo } : {}),
      ...(targetUserLabel ? { target_user_display: targetUserLabel } : {}),
    },
  });

  return NextResponse.json({ ok: true, note: inserted });
}
