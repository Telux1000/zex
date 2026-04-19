import { NextResponse } from 'next/server';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { isSupportPriority } from '@/lib/admin/support-ticket-meta';
import { formatAdminSupportUserDisplay } from '@/lib/admin/format-support-user-display';
import { labelForSupportTicketTargetUserId } from '@/lib/admin/support-ticket-target-user-label';
import type { SupabaseClient } from '@supabase/supabase-js';

const STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;

/**
 * Per-status totals using the same URL filters as the list (priority, assignee, account, search).
 * Excludes the list's `status` param so each tab shows how many tickets match filters in that status.
 */
async function statusCountsForQueue(
  supabase: SupabaseClient,
  url: URL
): Promise<Record<(typeof STATUSES)[number], number>> {
  const forStatus = async (st: (typeof STATUSES)[number]) => {
    let q = supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', st);

    const priority = url.searchParams.get('priority');
    if (priority && isSupportPriority(priority)) {
      q = q.eq('priority', priority);
    }
    const assignee = url.searchParams.get('assignee');
    if (assignee === '__unassigned__') {
      q = q.is('assigned_to_user_id', null);
    } else if (assignee && assignee.length > 10) {
      q = q.eq('assigned_to_user_id', assignee);
    }
    const account = url.searchParams.get('account');
    if (account && account.length > 10) {
      q = q.eq('target_business_id', account);
    }
    const search = url.searchParams.get('search')?.trim();
    if (search) {
      const safe = search.replace(/[%_\\]/g, '').slice(0, 120);
      if (safe) q = q.ilike('subject', `%${safe}%`);
    }

    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return [st, count ?? 0] as const;
  };

  const pairs = await Promise.all(STATUSES.map((st) => forStatus(st)));
  return Object.fromEntries(pairs) as Record<(typeof STATUSES)[number], number>;
}

type CreateTicketBody = {
  subject?: string;
  details?: string;
  target_user_id?: string | null;
  target_business_id?: string | null;
  priority?: string;
};

type TicketRow = {
  id: string;
  subject: string;
  details: string;
  status: string;
  priority: string;
  target_user_id: string | null;
  target_business_id: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
  ticket_number: number;
};

export async function GET(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  const url = new URL(req.url);
  /** Lightweight poll for header inbox preview — skips audit log spam. */
  const isPreviewPoll = url.searchParams.get('preview') === '1';

  let status_counts: Record<(typeof STATUSES)[number], number>;
  if (isPreviewPoll) {
    status_counts = { open: 0, pending: 0, resolved: 0, closed: 0 };
  } else {
    try {
      status_counts = await statusCountsForQueue(supabase, url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Count failed';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  let q = supabase
    .from('support_tickets')
    .select(
      'id, subject, details, status, priority, target_user_id, target_business_id, assigned_to_user_id, created_at, updated_at, ticket_number'
    );

  const status = url.searchParams.get('status');
  if (status && (STATUSES as readonly string[]).includes(status)) {
    q = q.eq('status', status);
  }

  const priority = url.searchParams.get('priority');
  if (priority && isSupportPriority(priority)) {
    q = q.eq('priority', priority);
  }

  const assignee = url.searchParams.get('assignee');
  if (assignee === '__unassigned__') {
    q = q.is('assigned_to_user_id', null);
  } else if (assignee && assignee.length > 10) {
    q = q.eq('assigned_to_user_id', assignee);
  }

  const account = url.searchParams.get('account');
  if (account && account.length > 10) {
    q = q.eq('target_business_id', account);
  }

  const search = url.searchParams.get('search')?.trim();
  if (search) {
    const safe = search.replace(/[%_\\]/g, '').slice(0, 120);
    if (safe) q = q.ilike('subject', `%${safe}%`);
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200), 1), 500);
  const { data: rows, error } = await q.order('updated_at', { ascending: false }).limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: unreadRpc, error: unreadErr } = await supabase.rpc('support_ticket_unread_for_internal_staff');
  if (unreadErr) return NextResponse.json({ error: unreadErr.message }, { status: 500 });

  type UnreadRow = { ticket_id: string; unread_count: number };
  const unreadMap = new Map<string, number>();
  for (const r of (unreadRpc ?? []) as UnreadRow[]) {
    const id = String((r as { ticket_id: string }).ticket_id);
    const c = Number((r as { unread_count: number }).unread_count) || 0;
    unreadMap.set(id, c);
  }
  const total_unread = Array.from(unreadMap.values()).reduce((a, b) => a + b, 0);

  const tickets = (rows ?? []) as TicketRow[];
  const admin = getSupabaseServiceAdmin();

  const previewByTicket = new Map<string, string>();
  if (admin && tickets.length > 0) {
    const { data: prevRows, error: prevErr } = await admin.rpc('support_ticket_last_message_previews', {
      p_ticket_ids: tickets.map((t) => t.id),
    });
    if (!prevErr && prevRows) {
      for (const row of prevRows as { ticket_id: string; preview: string }[]) {
        previewByTicket.set(String(row.ticket_id), String(row.preview ?? '').trim());
      }
    }
  }

  const businessIds = Array.from(
    new Set(tickets.map((t) => t.target_business_id).filter(Boolean))
  ) as string[];
  const profileIds = Array.from(
    new Set(tickets.flatMap((t) => [t.target_user_id, t.assigned_to_user_id].filter(Boolean) as string[]))
  );

  const businessById = new Map<string, string>();
  const profileById = new Map<
    string,
    { name: string | null; email: string | null; account_number: string | null }
  >();

  if (admin) {
    if (businessIds.length > 0) {
      const { data: biz } = await admin.from('businesses').select('id, name').in('id', businessIds);
      for (const b of biz ?? []) {
        businessById.set(String(b.id), String(b.name ?? '').trim() || '—');
      }
    }
    if (profileIds.length > 0) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, full_name, email, account_number')
        .in('id', profileIds);
      for (const p of profs ?? []) {
        profileById.set(String(p.id), {
          name: p.full_name ? String(p.full_name).trim() : null,
          email: p.email ? String(p.email).trim() : null,
          account_number: p.account_number ? String(p.account_number).trim() : null,
        });
      }
    }
  }

  const enriched = tickets
    .map((t) => {
      const tu = t.target_user_id ? profileById.get(t.target_user_id) : null;
      const au = t.assigned_to_user_id ? profileById.get(t.assigned_to_user_id) : null;
      const userDisplay = tu
        ? formatAdminSupportUserDisplay({
            accountNumber: tu.account_number,
            fullName: tu.name,
            email: tu.email,
          })
        : t.target_user_id
          ? t.target_user_id.slice(0, 8) + '…'
          : '—';
      const preview = previewByTicket.get(t.id) ?? '';
      return {
        ...t,
        unread_count: unreadMap.get(t.id) ?? 0,
        account_name: t.target_business_id ? businessById.get(t.target_business_id) ?? '—' : '—',
        user_display: userDisplay,
        user_email: tu?.email ?? null,
        assignee_display:
          au?.name ?? au?.email ?? (t.assigned_to_user_id ? t.assigned_to_user_id.slice(0, 8) + '…' : null),
        last_message_preview: preview.length > 0 ? preview : null,
      };
    })
    .sort((a, b) => {
      const ua = a.unread_count;
      const ub = b.unread_count;
      const aUnread = ua > 0;
      const bUnread = ub > 0;
      if (aUnread && !bUnread) return -1;
      if (!aUnread && bUnread) return 1;
      if (ua !== ub) return ub - ua;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  if (!isPreviewPoll) {
    await logAdminAuditEvent({
      supabase,
      actorUserId: user.id,
      actorRole: adminRole,
      action: 'admin_view_support',
      metadata: { count: enriched.length },
    });
  }

  return NextResponse.json({ tickets: enriched, status_counts, total_unread });
}

export async function POST(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  const { supabase, user, adminRole } = gate;
  const body = (await req.json()) as CreateTicketBody;
  const subject = String(body.subject ?? '').trim();
  const details = String(body.details ?? '').trim();
  if (!subject || !details) {
    return NextResponse.json({ error: 'subject and details are required' }, { status: 400 });
  }

  const pr = String(body.priority ?? 'medium').toLowerCase();
  const priority = isSupportPriority(pr) ? pr : 'medium';

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      created_by_user_id: user.id,
      target_user_id: body.target_user_id ?? null,
      target_business_id: body.target_business_id ?? null,
      subject,
      details,
      priority,
      status: 'pending',
      assigned_to_user_id: null,
      updated_at: new Date().toISOString(),
    })
    .select('id, ticket_number')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('support_ticket_messages').insert({
    ticket_id: data.id,
    author_user_id: user.id,
    body: details,
    is_staff: true,
  });

  const adminSvc = getSupabaseServiceAdmin();
  const targetUserLabel =
    body.target_user_id && adminSvc
      ? await labelForSupportTicketTargetUserId(adminSvc, body.target_user_id)
      : null;

  const ticketNo = (data as { ticket_number?: number }).ticket_number;
  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_ticket_created',
    targetType: 'support_ticket',
    targetId: data.id,
    metadata: {
      ...(typeof ticketNo === 'number' ? { ticket_number: ticketNo } : {}),
      ...(targetUserLabel ? { target_user_display: targetUserLabel } : {}),
    },
  });

  return NextResponse.json({ ok: true, ticket_id: data.id, ticket_number: ticketNo ?? null });
}
