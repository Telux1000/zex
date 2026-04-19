import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { canAccessSupportInbox } from '@/lib/support/support-access';
import { previewLine } from '@/lib/support/ticket-list';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  deleteSupportTicketObject,
  uploadSupportTicketImage,
} from '@/lib/support/support-attachments';
import { validateSupportImageFile } from '@/lib/support/support-attachment-validation';
import {
  parseSupportTicketPriorityInput,
} from '@/lib/support/support-ticket-priority';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const primary = await getPrimaryBusinessForUser(user.id);
  if (!primary?.id) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  const role = await getEffectiveBusinessRole(supabase, primary.id, user.id);
  if (!canAccessSupportInbox(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows, error } = await supabase
    .from('support_tickets')
    .select('id, subject, status, details, created_at, updated_at, ticket_number')
    .eq('target_business_id', primary.id)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const tickets = rows ?? [];
  const ids = tickets.map((t) => t.id);

  const { data: unreadRpc } = await supabase.rpc('support_ticket_unread_for_business', {
    p_business_id: primary.id,
  });
  const unreadByTicket = new Map<string, number>();
  for (const row of unreadRpc ?? []) {
    const r = row as { ticket_id?: string; unread_count?: string | number };
    if (r.ticket_id) unreadByTicket.set(String(r.ticket_id), Number(r.unread_count ?? 0));
  }
  const latestByTicket = new Map<
    string,
    { body: string; created_at: string; is_staff: boolean; author_user_id: string }
  >();

  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from('support_ticket_messages')
      .select('ticket_id, body, created_at, is_staff, author_user_id')
      .in('ticket_id', ids)
      .order('created_at', { ascending: false });

    for (const m of msgs ?? []) {
      const tid = String(m.ticket_id);
      if (!latestByTicket.has(tid)) {
        latestByTicket.set(tid, {
          body: String(m.body ?? ''),
          created_at: String(m.created_at),
          is_staff: Boolean(m.is_staff),
          author_user_id: String(m.author_user_id ?? ''),
        });
      }
    }
  }

  const enriched = tickets.map((t) => {
    const last = latestByTicket.get(t.id);
    const fallback = String((t as { details?: string }).details ?? '');
    const raw = last?.body ?? fallback;
    const fromSupport = last ? last.is_staff : false;
    return {
      id: t.id,
      subject: t.subject,
      status: t.status,
      ticket_number: (t as { ticket_number?: number }).ticket_number ?? null,
      created_at: t.created_at,
      updated_at: t.updated_at,
      last_message_preview: previewLine(raw),
      last_message_at: last?.created_at ?? t.updated_at,
      last_message_from_support: fromSupport,
      /** Display label for the last message in the thread (subscriber inbox). */
      last_message_sender_label: fromSupport ? 'Zenzex Support' : 'You',
      unread_count: unreadByTicket.get(t.id) ?? 0,
    };
  });

  const total_unread = enriched.reduce((s, t) => s + (t.unread_count ?? 0), 0);

  return NextResponse.json({ tickets: enriched, total_unread });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const primary = await getPrimaryBusinessForUser(user.id);
  if (!primary?.id) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  const role = await getEffectiveBusinessRole(supabase, primary.id, user.id);
  if (!canAccessSupportInbox(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const contentType = req.headers.get('content-type') ?? '';
  let subject: string;
  let details: string;
  let file: File | null = null;
  let priorityRaw: unknown;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    subject = String(form.get('subject') ?? '').trim();
    details = String(form.get('details') ?? '').trim();
    priorityRaw = form.get('priority');
    const raw = form.get('file');
    file = raw instanceof File && raw.size > 0 ? raw : null;
    if (file) {
      const v = validateSupportImageFile(file);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    }
  } else {
    let body: { subject?: string; details?: string; priority?: string };
    try {
      body = (await req.json()) as { subject?: string; details?: string; priority?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    subject = String(body.subject ?? '').trim();
    details = String(body.details ?? '').trim();
    priorityRaw = body.priority;
  }

  if (!subject || !details) {
    return NextResponse.json({ error: 'subject and details are required' }, { status: 400 });
  }

  const priorityParsed = parseSupportTicketPriorityInput(priorityRaw);
  if (!priorityParsed.ok) {
    return NextResponse.json({ error: priorityParsed.error }, { status: 400 });
  }
  const priority = priorityParsed.priority;

  const now = new Date().toISOString();
  const { data: ticket, error: insErr } = await supabase
    .from('support_tickets')
    .insert({
      created_by_user_id: user.id,
      target_user_id: user.id,
      target_business_id: primary.id,
      subject,
      details,
      status: 'open',
      priority,
      updated_at: now,
    })
    .select('id, ticket_number')
    .single();

  if (insErr || !ticket) {
    return NextResponse.json(
      { error: 'Could not create your ticket. Please try again.' },
      { status: 500 }
    );
  }

  const ticketId = String(ticket.id);
  let attachmentPath: string | null = null;
  let attachmentContentType: string | null = null;
  let attachmentOriginalName: string | null = null;
  let attachmentSizeBytes: number | null = null;

  if (file) {
    const service = getSupabaseServiceAdmin();
    if (!service) {
      await supabase.from('support_tickets').delete().eq('id', ticketId);
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const up = await uploadSupportTicketImage(service, ticketId, file);
    if ('error' in up) {
      await supabase.from('support_tickets').delete().eq('id', ticketId);
      return NextResponse.json({ error: up.error }, { status: 400 });
    }
    attachmentPath = up.path;
    attachmentContentType = up.contentType;
    attachmentOriginalName = up.originalName;
    attachmentSizeBytes = up.sizeBytes;
  }

  const { error: msgErr } = await supabase.from('support_ticket_messages').insert({
    ticket_id: ticketId,
    author_user_id: user.id,
    body: details,
    is_staff: false,
    attachment_storage_path: attachmentPath,
    attachment_content_type: attachmentContentType,
    attachment_original_name: attachmentOriginalName,
    attachment_size_bytes: attachmentSizeBytes,
  });

  if (msgErr) {
    if (attachmentPath) {
      const service = getSupabaseServiceAdmin();
      if (service) await deleteSupportTicketObject(service, attachmentPath);
    }
    await supabase.from('support_tickets').delete().eq('id', ticketId);
    return NextResponse.json(
      { error: 'Could not create your ticket. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    ticket_id: ticketId,
    ticket_number: (ticket as { ticket_number?: number }).ticket_number ?? null,
  });
}
