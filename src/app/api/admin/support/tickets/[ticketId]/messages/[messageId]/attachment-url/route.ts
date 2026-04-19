import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  createSignedUrlForSupportAttachment,
  isAttachmentPathForTicket,
} from '@/lib/support/support-attachments';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string; messageId: string }> }
) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { ticketId, messageId } = await params;

  const { data: msg, error: mErr } = await gate.supabase
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
