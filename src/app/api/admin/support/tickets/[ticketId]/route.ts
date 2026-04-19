import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { isSupportPriority } from '@/lib/admin/support-ticket-meta';
import { formatAdminSupportUserDisplay } from '@/lib/admin/format-support-user-display';
import { labelForSupportTicketTargetUserId } from '@/lib/admin/support-ticket-target-user-label';
import { markSupportTicketReadForUser } from '@/lib/support/support-ticket-read';

const ADMIN_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;

type PatchBody = {
  status?: (typeof ADMIN_STATUSES)[number];
  priority?: string;
  assigned_to_user_id?: string | null;
};

export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { ticketId } = await params;
  const { data: ticket, error: tErr } = await gate.supabase
    .from('support_tickets')
    .select(
      'id, subject, details, status, priority, target_user_id, target_business_id, assigned_to_user_id, created_at, updated_at, created_by_user_id, ticket_number'
    )
    .eq('id', ticketId)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: messages, error: mErr } = await gate.supabase
    .from('support_ticket_messages')
    .select(
      'id, author_user_id, body, is_staff, created_at, attachment_storage_path, attachment_content_type, attachment_original_name, attachment_size_bytes'
    )
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const { data: internalNotes, error: nErr } = await gate.supabase
    .from('support_ticket_internal_notes')
    .select('id, author_user_id, body, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  const admin = getSupabaseServiceAdmin();

  let account_name: string | null = null;
  let user_name: string | null = null;
  let user_email: string | null = null;
  let user_account_number: string | null = null;
  let billing_plan: string | null = null;
  let assignee_name: string | null = null;
  let assignee_email: string | null = null;

  const noteAuthors = new Map<string, { name: string | null; email: string | null }>();
  const messageAuthorLabel = new Map<string, string>();

  if (admin) {
    if (ticket.target_business_id) {
      const { data: b } = await admin
        .from('businesses')
        .select('name')
        .eq('id', ticket.target_business_id)
        .maybeSingle();
      account_name = b?.name ? String(b.name).trim() : null;
    }
    if (ticket.target_user_id) {
      const { data: p } = await admin
        .from('profiles')
        .select('full_name, email, billing_plan, account_number')
        .eq('id', ticket.target_user_id)
        .maybeSingle();
      user_name = p?.full_name ? String(p.full_name).trim() : null;
      user_email = p?.email ? String(p.email).trim() : null;
      user_account_number = p?.account_number ? String(p.account_number).trim() : null;
      billing_plan = p?.billing_plan != null ? String(p.billing_plan) : null;
    }
    if (ticket.assigned_to_user_id) {
      const { data: a } = await admin
        .from('profiles')
        .select('full_name, email')
        .eq('id', ticket.assigned_to_user_id)
        .maybeSingle();
      assignee_name = a?.full_name ? String(a.full_name).trim() : null;
      assignee_email = a?.email ? String(a.email).trim() : null;
    }

    const noteAuthorIds = Array.from(new Set((internalNotes ?? []).map((n) => String(n.author_user_id))));
    if (noteAuthorIds.length > 0) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', noteAuthorIds);
      for (const p of profs ?? []) {
        noteAuthors.set(String(p.id), {
          name: p.full_name ? String(p.full_name).trim() : null,
          email: p.email ? String(p.email).trim() : null,
        });
      }
    }

    const messageAuthorIds = Array.from(new Set((messages ?? []).map((m) => String(m.author_user_id))));
    if (messageAuthorIds.length > 0) {
      const { data: msgProfs } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', messageAuthorIds);
      for (const p of msgProfs ?? []) {
        const label =
          (p.full_name && String(p.full_name).trim()) ||
          (p.email && String(p.email).trim()) ||
          String(p.id).slice(0, 8) + '…';
        messageAuthorLabel.set(String(p.id), label);
      }
    }
  }

  const messagesWithAuthors = (messages ?? []).map((m) => ({
    ...m,
    author_display:
      messageAuthorLabel.get(String(m.author_user_id)) ?? String(m.author_user_id).slice(0, 8) + '…',
  }));

  const notesWithAuthors = (internalNotes ?? []).map((n) => {
    const au = noteAuthors.get(String(n.author_user_id));
    return {
      ...n,
      author_display: au?.name ?? au?.email ?? String(n.author_user_id).slice(0, 8),
    };
  });

  const userDisplay =
    user_name || user_email
      ? formatAdminSupportUserDisplay({
          accountNumber: user_account_number,
          fullName: user_name,
          email: user_email,
        })
      : '—';

  await markSupportTicketReadForUser(gate.supabase, gate.user.id, ticketId);

  return NextResponse.json({
    ticket,
    messages: messagesWithAuthors,
    internal_notes: notesWithAuthors,
    context: {
      account_name: account_name ?? '—',
      user_name: userDisplay,
      user_email,
      billing_plan: billing_plan ?? '—',
      assignee_name: assignee_name ?? assignee_email,
      assignee_email,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { ticketId } = await params;
  const body = (await req.json()) as PatchBody;

  const update: Record<string, unknown> = {};
  let changed = false;

  if (body.status != null) {
    if (!ADMIN_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    update.status = body.status;
    changed = true;
  }

  if (body.priority != null) {
    const pr = String(body.priority).toLowerCase();
    if (!isSupportPriority(pr)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }
    update.priority = pr;
    changed = true;
  }

  if (body.assigned_to_user_id !== undefined) {
    update.assigned_to_user_id = body.assigned_to_user_id;
    changed = true;
  }

  if (!changed) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  const adminSvc = getSupabaseServiceAdmin();
  const { data: tMeta } = await gate.supabase
    .from('support_tickets')
    .select('target_user_id, ticket_number')
    .eq('id', ticketId)
    .maybeSingle();
  const targetUserLabel =
    adminSvc && tMeta?.target_user_id
      ? await labelForSupportTicketTargetUserId(adminSvc, tMeta.target_user_id)
      : null;
  const ticketNo = (tMeta as { ticket_number?: number } | null)?.ticket_number;
  const userMeta = {
    ...(typeof ticketNo === 'number' ? { ticket_number: ticketNo } : {}),
    ...(targetUserLabel ? { target_user_display: targetUserLabel } : {}),
  };

  update.updated_at = new Date().toISOString();

  const { error } = await gate.supabase.from('support_tickets').update(update).eq('id', ticketId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (body.status != null) {
    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: 'admin_ticket_status_changed',
      targetType: 'support_ticket',
      targetId: ticketId,
      metadata: { ...userMeta, status: body.status },
    });
  }

  if (body.priority != null) {
    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: 'admin_ticket_priority_changed',
      targetType: 'support_ticket',
      targetId: ticketId,
      metadata: { ...userMeta, priority: body.priority },
    });
  }

  if (body.assigned_to_user_id !== undefined) {
    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: 'admin_ticket_assigned',
      targetType: 'support_ticket',
      targetId: ticketId,
      metadata: { ...userMeta, assigned_to_user_id: body.assigned_to_user_id },
    });
  }

  return NextResponse.json({ ok: true });
}
