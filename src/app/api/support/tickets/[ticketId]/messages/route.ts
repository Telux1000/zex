import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { canAccessSupportInbox } from '@/lib/support/support-access';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  deleteSupportTicketObject,
  uploadSupportTicketImage,
} from '@/lib/support/support-attachments';
import { parseSupportMessagePostRequest } from '@/lib/support/support-message-post';
import { markSupportTicketReadForUser } from '@/lib/support/support-ticket-read';

const MESSAGE_SELECT =
  'id, author_user_id, body, is_staff, created_at, attachment_storage_path, attachment_content_type, attachment_original_name, attachment_size_bytes';

export async function POST(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
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
    .select('id, target_business_id, status')
    .eq('id', ticketId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!ticket || String(ticket.target_business_id) !== primary.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const closed = String(ticket.status ?? '').toLowerCase() === 'closed';
  if (closed) {
    return NextResponse.json({ error: 'This ticket is closed. Open a new ticket if you need more help.' }, { status: 400 });
  }

  const parsed = await parseSupportMessagePostRequest(req);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let attachmentPath: string | null = null;
  let attachmentContentType: string | null = null;
  let attachmentOriginalName: string | null = null;
  let attachmentSizeBytes: number | null = null;

  if (parsed.file) {
    const service = getSupabaseServiceAdmin();
    if (!service) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    const up = await uploadSupportTicketImage(service, ticketId, parsed.file);
    if ('error' in up) return NextResponse.json({ error: up.error }, { status: 400 });
    attachmentPath = up.path;
    attachmentContentType = up.contentType;
    attachmentOriginalName = up.originalName;
    attachmentSizeBytes = up.sizeBytes;
  }

  const now = new Date().toISOString();
  const { data: inserted, error: mErr } = await supabase
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      author_user_id: user.id,
      body: parsed.body || '',
      is_staff: false,
      attachment_storage_path: attachmentPath,
      attachment_content_type: attachmentContentType,
      attachment_original_name: attachmentOriginalName,
      attachment_size_bytes: attachmentSizeBytes,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (mErr || !inserted) {
    if (attachmentPath) {
      const service = getSupabaseServiceAdmin();
      if (service) await deleteSupportTicketObject(service, attachmentPath);
    }
    return NextResponse.json({ error: mErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  const st = String(ticket.status ?? '').toLowerCase();
  const ticketUpdate: Record<string, unknown> = { updated_at: now };
  if (st !== 'closed') {
    ticketUpdate.status = 'open';
  }

  await supabase.from('support_tickets').update(ticketUpdate).eq('id', ticketId);

  await markSupportTicketReadForUser(supabase, user.id, ticketId);

  return NextResponse.json({ ok: true, message: inserted });
}
