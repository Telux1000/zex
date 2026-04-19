import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { markSupportTicketReadForUser } from '@/lib/support/support-ticket-read';

/** Mark the current staff member caught up on subscriber messages for this ticket. */
export async function POST(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { ticketId } = await params;
  const { data: ticket, error: tErr } = await gate.supabase
    .from('support_tickets')
    .select('id')
    .eq('id', ticketId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await markSupportTicketReadForUser(gate.supabase, gate.user.id, ticketId);
  return NextResponse.json({ ok: true });
}
