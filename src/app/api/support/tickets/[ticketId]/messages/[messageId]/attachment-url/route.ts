import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { canAccessSupportInbox } from '@/lib/support/support-access';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  createSignedUrlForSupportAttachment,
  isAttachmentPathForTicket,
} from '@/lib/support/support-attachments';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string; messageId: string }> }
) {
  const { ticketId, messageId } = await params;
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
    .select('id, target_business_id')
    .eq('id', ticketId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!ticket || String(ticket.target_business_id) !== primary.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: msg, error: mErr } = await supabase
    .from('support_ticket_messages')
    .select('id, attachment_storage_path')
    .eq('id', messageId)
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  const path = msg?.attachment_storage_path ? String(msg.attachment_storage_path).trim() : '';
  if (!msg || !path || !isAttachmentPathForTicket(path, ticketId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const service = getSupabaseServiceAdmin();
  if (!service) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const signed = await createSignedUrlForSupportAttachment(service, path, 3600);
  if ('error' in signed) return NextResponse.json({ error: signed.error }, { status: 500 });

  return NextResponse.json({ url: signed.url });
}
