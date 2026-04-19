import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  deleteSupportTicketObject,
  uploadSupportTicketImage,
} from '@/lib/support/support-attachments';
import { parseSupportMessagePostRequest } from '@/lib/support/support-message-post';
import { labelForSupportTicketTargetUserId } from '@/lib/admin/support-ticket-target-user-label';
import { markSupportTicketReadForUser } from '@/lib/support/support-ticket-read';

const MESSAGE_SELECT =
  'id, author_user_id, body, is_staff, created_at, attachment_storage_path, attachment_content_type, attachment_original_name, attachment_size_bytes';

export async function POST(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { ticketId } = await params;
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

  const { data: ticket, error: tErr } = await gate.supabase
    .from('support_tickets')
    .select('id, status, assigned_to_user_id, target_user_id, ticket_number')
    .eq('id', ticketId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const closed = String(ticket.status ?? '').toLowerCase() === 'closed';
  if (closed) {
    return NextResponse.json({ error: 'Ticket is closed.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: inserted, error: mErr } = await gate.supabase
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      author_user_id: gate.user.id,
      body: parsed.body || '',
      is_staff: true,
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
    return NextResponse.json({ error: mErr?.message ?? 'Insert failed' }, { status: 400 });
  }

  const ticketUpdate: Record<string, unknown> = {
    updated_at: now,
    status: 'pending',
  };
  if (!ticket.assigned_to_user_id) {
    ticketUpdate.assigned_to_user_id = gate.user.id;
  }

  await gate.supabase.from('support_tickets').update(ticketUpdate).eq('id', ticketId);

  await markSupportTicketReadForUser(gate.supabase, gate.user.id, ticketId);

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
    action: 'admin_ticket_message_sent',
    targetType: 'support_ticket',
    targetId: ticketId,
    metadata: {
      ...(typeof ticketNo === 'number' ? { ticket_number: ticketNo } : {}),
      ...(targetUserLabel ? { target_user_display: targetUserLabel } : {}),
    },
  });

  return NextResponse.json({ ok: true, message: inserted });
}
