import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { canAccessSupportInbox } from '@/lib/support/support-access';
import { markSupportTicketReadForUser } from '@/lib/support/support-ticket-read';

export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const primary = await getPrimaryBusinessForUser(user.id);
  if (!primary?.id) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  const role = await getEffectiveBusinessRole(supabase, primary.id, user.id);
  if (!canAccessSupportInbox(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: ticket, error: tErr } = await supabase
    .from('support_tickets')
    .select(
      'id, subject, details, status, priority, created_at, updated_at, target_business_id, ticket_number'
    )
    .eq('id', ticketId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!ticket || String(ticket.target_business_id) !== primary.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: messages, error: mErr } = await supabase
    .from('support_ticket_messages')
    .select(
      'id, author_user_id, body, is_staff, created_at, attachment_storage_path, attachment_content_type, attachment_original_name, attachment_size_bytes'
    )
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  await markSupportTicketReadForUser(supabase, user.id, ticketId);

  return NextResponse.json({ ticket, messages: messages ?? [] });
}
