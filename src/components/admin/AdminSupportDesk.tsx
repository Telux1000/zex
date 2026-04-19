'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, MoreHorizontal, Plus, X } from 'lucide-react';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import type { AdminBadgeTone } from '@/components/admin/AdminBadge';
import { labelSupportTicketStatus } from '@/lib/support/ticket-status';
import {
  SUPPORT_PRIORITIES,
  labelSupportPriority,
  supportTicketQueueHints,
} from '@/lib/admin/support-ticket-meta';
import { cn } from '@/lib/utils/cn';
import { SupportMessageContent } from '@/components/support/SupportMessageContent';
import { SupportAttachmentComposerPreview } from '@/components/support/SupportAttachmentComposerPreview';
import { validateSupportImageFile } from '@/lib/support/support-attachment-validation';
import { formatSupportTicketRef } from '@/lib/support/ticket-number';
import { ADMIN_SUPPORT_MESSAGE_INSERT_EVENT } from '@/lib/support/support-inbox-events';
import { useAdminSupportUnread } from '@/contexts/AdminSupportUnreadContext';
import { useIsLgDown } from '@/hooks/use-is-lg-down';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

type TabKey = 'open' | 'pending' | 'resolved' | 'closed';
type MobileListFilter = 'all' | 'unread' | 'open' | 'pending';

type QueueTicket = {
  id: string;
  subject: string;
  details: string;
  status: string;
  priority: string;
  ticket_number: number | null;
  target_user_id: string | null;
  target_business_id: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
  account_name: string;
  user_display: string;
  user_email: string | null;
  assignee_display: string | null;
  unread_count: number;
  last_message_preview: string | null;
};

function sortTicketsForInbox(list: QueueTicket[]): QueueTicket[] {
  return [...list].sort((a, b) => {
    const aUnread = (a.unread_count ?? 0) > 0;
    const bUnread = (b.unread_count ?? 0) > 0;
    if (aUnread && !bUnread) return -1;
    if (!aUnread && bUnread) return 1;
    const uc = (b.unread_count ?? 0) - (a.unread_count ?? 0);
    if (uc !== 0) return uc;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

function shortRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 45_000) return 'Now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ticketPreviewLine(t: QueueTicket): string {
  const p = t.last_message_preview?.trim();
  if (p) return p;
  const d = t.details?.trim();
  if (d) return d.length > 140 ? `${d.slice(0, 137)}…` : d;
  return 'No messages yet';
}

type Msg = {
  id: string;
  author_user_id: string;
  body: string;
  is_staff: boolean;
  created_at: string;
  author_display?: string;
  attachment_storage_path?: string | null;
  attachment_content_type?: string | null;
  attachment_original_name?: string | null;
  attachment_size_bytes?: number | null;
};

type InternalNote = {
  id: string;
  author_user_id: string;
  body: string;
  created_at: string;
  author_display?: string;
};

type TicketDetail = {
  id: string;
  subject: string;
  details: string;
  status: string;
  priority: string;
  ticket_number: number | null;
  target_user_id: string | null;
  target_business_id: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type AssigneeOpt = { id: string; full_name: string | null; email: string | null; role: string | null };
type AccountOpt = { id: string; name: string };

function statusTone(s: string): AdminBadgeTone {
  const x = s.toLowerCase();
  if (x === 'open') return 'open';
  if (x === 'pending') return 'pending';
  if (x === 'resolved') return 'resolved';
  if (x === 'closed') return 'neutral';
  return 'neutral';
}

function priorityTone(p: string): AdminBadgeTone {
  const x = p.toLowerCase();
  if (x === 'urgent') return 'failed';
  if (x === 'high') return 'warning';
  if (x === 'medium') return 'pending';
  return 'neutral';
}

export function AdminSupportDesk({ initialTicketId }: { initialTicketId: string | null }) {
  const router = useRouter();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const supportUnread = useAdminSupportUnread();

  const [tab, setTab] = useState<TabKey>('open');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('');

  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<TabKey, number>>({
    open: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
  });
  const [queueLoading, setQueueLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId);

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [context, setContext] = useState<{
    account_name: string;
    user_name: string;
    user_email: string | null;
    billing_plan: string;
    assignee_name: string | null;
    assignee_email: string | null;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rightTab, setRightTab] = useState<'thread' | 'internal'>('thread');

  const [reply, setReply] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [replyPreviewUrl, setReplyPreviewUrl] = useState<string | null>(null);
  const [replyFileError, setReplyFileError] = useState<string | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [noteSending, setNoteSending] = useState(false);

  const [assignees, setAssignees] = useState<AssigneeOpt[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);

  const isLgDown = useIsLgDown();
  const [mobileListFilter, setMobileListFilter] = useState<MobileListFilter>('all');
  const [mobileShowQueue, setMobileShowQueue] = useState(!initialTicketId);
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  useEffect(() => {
    setSelectedId(initialTicketId);
    setMobileShowQueue(!initialTicketId);
  }, [initialTicketId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void fetch('/api/admin/support/assignees')
      .then((r) => r.json())
      .then((j: { assignees?: AssigneeOpt[] }) => setAssignees(j.assignees ?? []));
    void fetch('/api/admin/support/business-options')
      .then((r) => r.json())
      .then((j: { accounts?: AccountOpt[] }) => setAccounts(j.accounts ?? []));
  }, []);

  const loadQueue = useCallback(async () => {
    const sp = new URLSearchParams();
    if (!isLgDown) {
      sp.set('status', tab);
    } else {
      if (mobileListFilter === 'open') sp.set('status', 'open');
      else if (mobileListFilter === 'pending') sp.set('status', 'pending');
    }
    if (debouncedSearch) sp.set('search', debouncedSearch);
    if (priorityFilter) sp.set('priority', priorityFilter);
    if (assigneeFilter === '__unassigned__') sp.set('assignee', '__unassigned__');
    else if (assigneeFilter) sp.set('assignee', assigneeFilter);
    if (accountFilter) sp.set('account', accountFilter);

    setQueueLoading(true);
    try {
      const res = await fetch(`/api/admin/support/tickets?${sp.toString()}`);
      const j = (await res.json()) as {
        tickets?: QueueTicket[];
        status_counts?: Partial<Record<TabKey, number>>;
        total_unread?: number;
      };
      let list = (j.tickets ?? []).map((t) => ({
        ...t,
        unread_count: Number(t.unread_count) || 0,
      }));
      if (isLgDown && mobileListFilter === 'unread') {
        list = list.filter((t) => (t.unread_count ?? 0) > 0);
      }
      list = sortTicketsForInbox(list);
      setTickets(list);
      if (typeof j.total_unread === 'number') supportUnread?.setTotalUnread(j.total_unread);
      if (j.status_counts) {
        const c = j.status_counts;
        setStatusCounts({
          open: Number(c.open ?? 0),
          pending: Number(c.pending ?? 0),
          resolved: Number(c.resolved ?? 0),
          closed: Number(c.closed ?? 0),
        });
      }
    } finally {
      setQueueLoading(false);
    }
  }, [
    tab,
    isLgDown,
    mobileListFilter,
    debouncedSearch,
    priorityFilter,
    assigneeFilter,
    accountFilter,
    supportUnread,
  ]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}`);
      const j = (await res.json()) as {
        ticket?: TicketDetail;
        messages?: Msg[];
        internal_notes?: InternalNote[];
        context?: {
          account_name: string;
          user_name: string;
          user_email: string | null;
          billing_plan: string;
          assignee_name: string | null;
          assignee_email: string | null;
        };
      };
      if (!res.ok || !j.ticket) {
        setTicket(null);
        setMessages([]);
        setInternalNotes([]);
        setContext(null);
        return;
      }
      setTicket(j.ticket);
      setMessages(j.messages ?? []);
      setInternalNotes(j.internal_notes ?? []);
      setContext(j.context ?? null);
      void supportUnread?.refreshTotals();
    } finally {
      setDetailLoading(false);
    }
  }, [supportUnread]);

  useEffect(() => {
    supportUnread?.setActiveTicketId(selectedId);
  }, [selectedId, supportUnread]);

  const ticketLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of tickets) m[t.id] = t.user_display;
    return m;
  }, [tickets]);

  useEffect(() => {
    supportUnread?.setTicketLabelMap(ticketLabelMap);
  }, [ticketLabelMap, supportUnread]);

  useEffect(() => {
    const fn = (ev: Event) => {
      const ce = ev as CustomEvent<{ ticket_id?: string }>;
      const tid = ce.detail?.ticket_id;
      void loadQueue();
      if (tid && tid === selectedId) void loadDetail(selectedId);
    };
    window.addEventListener(ADMIN_SUPPORT_MESSAGE_INSERT_EVENT, fn);
    return () => window.removeEventListener(ADMIN_SUPPORT_MESSAGE_INSERT_EVENT, fn);
  }, [loadQueue, loadDetail, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      setMessages([]);
      setInternalNotes([]);
      setContext(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    return () => {
      if (replyPreviewUrl) URL.revokeObjectURL(replyPreviewUrl);
    };
  }, [replyPreviewUrl]);

  function clearReplyAttachment() {
    if (replyPreviewUrl) URL.revokeObjectURL(replyPreviewUrl);
    setReplyPreviewUrl(null);
    setReplyFile(null);
    setReplyFileError(null);
    if (replyFileInputRef.current) replyFileInputRef.current.value = '';
  }

  function onReplyPickFile(f: File | null) {
    setReplyFileError(null);
    if (!f) return;
    const v = validateSupportImageFile(f);
    if (!v.ok) {
      setReplyFileError(v.error);
      if (replyFileInputRef.current) replyFileInputRef.current.value = '';
      return;
    }
    if (replyPreviewUrl) URL.revokeObjectURL(replyPreviewUrl);
    setReplyPreviewUrl(URL.createObjectURL(f));
    setReplyFile(f);
  }

  function selectTicket(id: string) {
    setNewTicketOpen(false);
    setSelectedId(id);
    setMobileShowQueue(false);
    router.push(`/admin/support/${id}`, { scroll: false });
  }

  function backToQueue() {
    setNewTicketOpen(false);
    setMobileShowQueue(true);
    setSelectedId(null);
    router.push('/admin/support', { scroll: false });
  }

  async function patchTicket(patch: Record<string, unknown>) {
    if (!selectedId) return;
    await fetch(`/api/admin/support/tickets/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await loadDetail(selectedId);
    await loadQueue();
    router.refresh();
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || sending) return;
    const text = reply.trim();
    if (!text && !replyFile) return;
    if (replyFile) {
      const v = validateSupportImageFile(replyFile);
      if (!v.ok) {
        setReplyFileError(v.error);
        return;
      }
    }
    setSending(true);
    setReplyFileError(null);
    try {
      const fd = new FormData();
      if (text) fd.set('body', text);
      if (replyFile) fd.set('file', replyFile);
      const res = await fetch(`/api/admin/support/tickets/${selectedId}/messages`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(typeof j.error === 'string' ? j.error : 'Send failed');
        return;
      }
      setReply('');
      clearReplyAttachment();
      await loadDetail(selectedId);
      await loadQueue();
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function sendNote(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || noteSending) return;
    const text = noteDraft.trim();
    if (!text) return;
    setNoteSending(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(typeof j.error === 'string' ? j.error : 'Failed');
        return;
      }
      setNoteDraft('');
      await loadDetail(selectedId);
      await loadQueue();
    } finally {
      setNoteSending(false);
    }
  }

  function copyTicketLink() {
    if (!selectedId || typeof window === 'undefined') return;
    const url = `${window.location.origin}/admin/support/${selectedId}`;
    void navigator.clipboard.writeText(url);
    menuRef.current?.removeAttribute('open');
  }

  function copyTicketNumber() {
    if (!ticket?.ticket_number || typeof window === 'undefined') return;
    void navigator.clipboard.writeText(formatSupportTicketRef(ticket.ticket_number));
    menuRef.current?.removeAttribute('open');
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'pending', label: 'Pending' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' },
  ];

  const mobileFilters: { key: MobileListFilter; label: string; count: number }[] = [
    {
      key: 'all',
      label: 'All',
      count:
        statusCounts.open + statusCounts.pending + statusCounts.resolved + statusCounts.closed,
    },
    { key: 'unread', label: 'Unread', count: supportUnread?.totalUnread ?? 0 },
    { key: 'open', label: 'Open', count: statusCounts.open },
    { key: 'pending', label: 'Pending', count: statusCounts.pending },
  ];

  const selectedQueueRow = useMemo(
    () => (selectedId ? tickets.find((x) => x.id === selectedId) : undefined),
    [tickets, selectedId]
  );
  const mobileHeaderCustomerName = context?.user_name ?? selectedQueueRow?.user_display ?? '—';

  return (
    <div className="relative flex min-h-[min(720px,calc(100dvh-8rem))] flex-col gap-3">
      <div className="hidden flex-wrap items-center justify-between gap-2 lg:flex">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Support</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Queue, customer thread, and internal notes.</p>
        </div>
        <Link
          href="/admin"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          ← Admin home
        </Link>
      </div>

      <div
        className="hidden shrink-0 flex-wrap gap-1 rounded-xl border border-zinc-200 bg-zinc-50/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/50 lg:flex"
        role="tablist"
        aria-label="Ticket status"
      >
        {tabs.map((t) => {
          const n = statusCounts[t.key];
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex min-h-[2.25rem] flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors sm:flex-none sm:justify-start sm:px-3',
                active
                  ? 'bg-white text-indigo-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-indigo-200 dark:ring-zinc-600'
                  : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100'
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  'min-w-[1.25rem] rounded-md px-1 py-0.5 text-center text-[11px] font-bold tabular-nums',
                  active
                    ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/80 dark:text-indigo-100'
                    : 'bg-zinc-200/90 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 lg:flex-row">
        {/* Queue */}
        <div
          className={cn(
            'flex min-h-0 w-full shrink-0 flex-col border-b border-zinc-200 dark:border-zinc-800 lg:w-[min(100%,420px)] lg:border-b-0 lg:border-r',
            isLgDown && !mobileShowQueue && 'hidden',
            isLgDown && mobileShowQueue && 'flex flex-1',
            !isLgDown && 'lg:flex lg:h-full'
          )}
        >
          <div className="shrink-0 space-y-3 border-b border-zinc-200 p-3 dark:border-zinc-800 lg:space-y-2 lg:p-2">
            {isLgDown && mobileShowQueue ? (
              <div className="space-y-3">
                <AppLogoInline />
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  All Tickets
                </Link>
                <label className="sr-only" htmlFor="admin-support-queue-search">
                  Search tickets by subject
                </label>
                <input
                  id="admin-support-queue-search"
                  type="search"
                  placeholder="Search tickets…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <div
                  className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] pb-0.5 [&::-webkit-scrollbar]:hidden"
                  role="tablist"
                  aria-label="Ticket filter"
                >
                  {mobileFilters.map((mf) => {
                    const active = mobileListFilter === mf.key;
                    return (
                      <button
                        key={mf.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setMobileListFilter(mf.key)}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                          active
                            ? 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-100 dark:ring-indigo-800'
                            : 'bg-zinc-100/80 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300'
                        )}
                      >
                        <span>{mf.label}</span>
                        <span className="tabular-nums text-[11px] font-bold">{mf.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className={cn(isLgDown && mobileShowQueue && 'hidden lg:block')}>
              <label className="sr-only" htmlFor="admin-support-queue-search-desktop">
                Search tickets by subject
              </label>
              <input
                id="admin-support-queue-search-desktop"
                type="search"
                placeholder="Search subject…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div className="hidden grid-cols-2 gap-1.5 lg:grid">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                aria-label="Priority filter"
              >
                <option value="">All priorities</option>
                {SUPPORT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {labelSupportPriority(p)}
                  </option>
                ))}
              </select>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                aria-label="Assignee filter"
              >
                <option value="">All assignees</option>
                <option value="__unassigned__">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name || a.email || a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="col-span-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                aria-label="Account filter"
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {queueLoading ? (
              <p className="p-4 text-center text-xs text-zinc-500">Loading queue…</p>
            ) : tickets.length === 0 ? (
              <p className="p-4 text-center text-xs text-zinc-500">No tickets in this queue.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {tickets.map((t) => {
                  const hints = supportTicketQueueHints(t.created_at, t.updated_at, t.status);
                  const active = t.id === selectedId;
                  const unreadCount = t.unread_count ?? 0;
                  const hasUnread = unreadCount > 0;
                  const st = String(t.status).toLowerCase();
                  const showOpenPendingPill = st === 'open' || st === 'pending';
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => selectTicket(t.id)}
                        className={cn(
                          'flex w-full flex-col gap-1.5 px-3 py-3 text-left transition-colors',
                          active
                            ? 'bg-indigo-50 dark:bg-indigo-950/35'
                            : hasUnread
                              ? 'bg-indigo-50/60 dark:bg-indigo-950/20'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-sm',
                              hasUnread
                                ? 'font-semibold text-zinc-900 dark:text-zinc-50'
                                : 'font-medium text-zinc-800 dark:text-zinc-200'
                            )}
                          >
                            {t.user_display}
                          </span>
                          <time
                            className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-400 dark:text-zinc-500"
                            dateTime={t.updated_at}
                          >
                            {shortRelativeTime(t.updated_at)}
                          </time>
                        </div>
                        <p className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">{t.account_name}</p>
                        <p
                          className={cn(
                            'line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-zinc-300',
                            hasUnread && 'font-medium'
                          )}
                        >
                          {ticketPreviewLine(t)}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {hasUnread ? (
                            <span
                              className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white dark:bg-indigo-500"
                              aria-label={`${unreadCount} unread`}
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          ) : null}
                          {showOpenPendingPill ? (
                            <AdminBadge tone={statusTone(t.status)} className="!text-[10px]">
                              {labelSupportTicketStatus(t.status)}
                            </AdminBadge>
                          ) : (
                            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                              {labelSupportTicketStatus(t.status)}
                            </span>
                          )}
                          <AdminBadge tone={priorityTone(t.priority)} className="hidden !text-[10px] lg:inline-flex">
                            {labelSupportPriority(t.priority)}
                          </AdminBadge>
                          {hints.slice(0, 1).map((h) => (
                            <span
                              key={h}
                              className="hidden rounded bg-zinc-200/80 px-1 py-0.5 text-[9px] font-semibold uppercase text-zinc-700 sm:inline dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                        <p className="hidden text-[10px] text-zinc-400 lg:block">
                          {t.ticket_number != null ? (
                            <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                              {formatSupportTicketRef(t.ticket_number)}
                            </span>
                          ) : null}
                          {t.ticket_number != null ? ' · ' : null}
                          <span className="line-clamp-1">{t.subject}</span>
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Detail */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            isLgDown && mobileShowQueue && 'hidden',
            !isLgDown && 'lg:flex'
          )}
        >
          {selectedId && (
            <div className="flex shrink-0 items-start gap-2 border-b border-zinc-200 bg-zinc-50/95 px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-zinc-800 dark:bg-zinc-900/90 lg:hidden">
              <button
                type="button"
                onClick={backToQueue}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                All Tickets
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {detailLoading && !context?.user_name && !selectedQueueRow ? 'Loading…' : mobileHeaderCustomerName}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {ticket?.subject
                    ? `${context?.account_name ?? selectedQueueRow?.account_name ?? '—'} · ${ticket.subject}`
                    : (context?.account_name ?? selectedQueueRow?.account_name ?? '—')}
                </p>
              </div>
            </div>
          )}

          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Select a ticket from the queue.
            </div>
          ) : detailLoading ? (
            <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">Loading…</div>
          ) : !ticket ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">Ticket not found.</div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex flex-wrap items-baseline gap-2">
                    {ticket.ticket_number != null ? (
                      <span className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-100">
                        {formatSupportTicketRef(ticket.ticket_number)}
                      </span>
                    ) : null}
                    <h2 className="hidden min-w-0 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50 lg:block">
                      {ticket.subject}
                    </h2>
                  </div>
                  <details ref={menuRef} className="relative">
                    <summary className="list-none cursor-pointer rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
                      <MoreHorizontal className="h-4 w-4" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        onClick={() => void patchTicket({ status: 'resolved' })}
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        onClick={() => void patchTicket({ status: 'closed' })}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        onClick={() => void patchTicket({ status: 'open' })}
                      >
                        Reopen
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        onClick={copyTicketLink}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy link
                      </button>
                      {ticket.ticket_number != null ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          onClick={copyTicketNumber}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy {formatSupportTicketRef(ticket.ticket_number)}
                        </button>
                      ) : null}
                    </div>
                  </details>
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={ticket.status}
                    onChange={(e) =>
                      void patchTicket({
                        status: e.target.value as 'open' | 'pending' | 'resolved' | 'closed',
                      })
                    }
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900"
                    aria-label="Status"
                  >
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <select
                    value={ticket.priority}
                    onChange={(e) => void patchTicket({ priority: e.target.value })}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    aria-label="Priority"
                  >
                    {SUPPORT_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {labelSupportPriority(p)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={ticket.assigned_to_user_id ?? ''}
                    onChange={(e) =>
                      void patchTicket({
                        assigned_to_user_id: e.target.value === '' ? null : e.target.value,
                      })
                    }
                    className="max-w-[200px] rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    aria-label="Assignee"
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name || a.email || a.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>

                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
                  {ticket.ticket_number != null ? (
                    <div className="flex gap-1 sm:col-span-2">
                      <dt className="text-zinc-500">Ticket</dt>
                      <dd className="font-mono font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                        {formatSupportTicketRef(ticket.ticket_number)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex gap-1">
                    <dt className="text-zinc-500">Account</dt>
                    <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                      {context?.account_name ?? ticket.target_business_id ?? '—'}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-zinc-500">User</dt>
                    <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                      {context?.user_name ?? '—'}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-zinc-500">Plan</dt>
                    <dd className="font-medium text-zinc-800 dark:text-zinc-200">{context?.billing_plan ?? '—'}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-zinc-500">Assignee</dt>
                    <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                      {context?.assignee_name ?? context?.assignee_email ?? '—'}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-zinc-500">Created</dt>
                    <dd className="text-zinc-800 dark:text-zinc-200">
                      {new Date(ticket.created_at).toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-zinc-500">Last activity</dt>
                    <dd className="text-zinc-800 dark:text-zinc-200">
                      {new Date(ticket.updated_at).toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex shrink-0 gap-0 border-b border-zinc-200 px-2 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setRightTab('thread')}
                  className={cn(
                    'border-b-2 px-3 py-2 text-xs font-semibold',
                    rightTab === 'thread'
                      ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                      : 'border-transparent text-zinc-500'
                  )}
                >
                  Customer thread
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('internal')}
                  className={cn(
                    'border-b-2 px-3 py-2 text-xs font-semibold',
                    rightTab === 'internal'
                      ? 'border-amber-600 text-amber-800 dark:border-amber-500 dark:text-amber-200'
                      : 'border-transparent text-zinc-500'
                  )}
                >
                  Internal notes
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {rightTab === 'thread' ? (
                  <div className="flex min-h-full flex-col">
                    <div className="flex-1 space-y-2 p-4">
                      {messages.map((m) => {
                        const hasAtt = Boolean(m.attachment_storage_path?.trim());
                        const hasText = Boolean(m.body?.trim());
                        return (
                          <div
                            key={m.id}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-sm',
                              m.is_staff
                                ? 'border-indigo-200 bg-indigo-50/90 dark:border-indigo-500/30 dark:bg-indigo-950/40'
                                : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60'
                            )}
                          >
                            <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                {m.is_staff ? 'Staff' : m.author_display?.trim() || 'Customer'}
                              </span>
                              <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString()}</time>
                            </div>
                            {hasAtt || hasText ? (
                              <SupportMessageContent
                                message={m}
                                ticketId={selectedId!}
                                variant="admin"
                                textClassName="text-zinc-800 dark:text-zinc-200"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {String(ticket.status).toLowerCase() !== 'closed' ? (
                      <form
                        onSubmit={sendReply}
                        className="shrink-0 border-t border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                      >
                        <label className="sr-only" htmlFor="admin-reply">
                          Reply to customer
                        </label>
                        {replyFile && replyPreviewUrl ? (
                          <div className="mb-2">
                            <SupportAttachmentComposerPreview
                              previewUrl={replyPreviewUrl}
                              fileName={replyFile.name}
                              fileSizeBytes={replyFile.size}
                              onRemove={clearReplyAttachment}
                              disabled={sending}
                              tone="admin"
                            />
                          </div>
                        ) : null}
                        {replyFileError ? (
                          <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">{replyFileError}</p>
                        ) : null}
                        <div className="mb-2 flex gap-1.5">
                          <input
                            ref={replyFileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                            className="sr-only"
                            aria-label="Attach image"
                            disabled={sending}
                            onChange={(e) => onReplyPickFile(e.target.files?.[0] ?? null)}
                          />
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => replyFileInputRef.current?.click()}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-base leading-none text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                            title="Attach PNG or JPEG (max 5MB)"
                            aria-label="Attach screenshot"
                          >
                            📎
                          </button>
                          <textarea
                            id="admin-reply"
                            className="min-h-[72px] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                            placeholder="Reply to customer (visible to their workspace)…"
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            disabled={sending}
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={sending || (!reply.trim() && !replyFile)}
                          className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          {sending ? 'Sending…' : 'Send reply'}
                        </button>
                      </form>
                    ) : (
                      <p className="shrink-0 border-t border-zinc-200 p-3 text-center text-xs text-zinc-500 dark:border-zinc-800">
                        Closed — reopen to message the customer.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 p-4">
                    <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                      Internal notes are never shown to subscribers. Use for coordination and context only.
                    </p>
                    {internalNotes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-lg border-l-4 border-amber-500 bg-amber-50/90 px-3 py-2 text-sm dark:border-amber-600 dark:bg-amber-950/35"
                      >
                        <div className="mb-1 flex justify-between text-[10px] text-amber-900/80 dark:text-amber-200/80">
                          <span className="font-semibold">{n.author_display ?? 'Staff'}</span>
                          <time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time>
                        </div>
                        <p className="whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{n.body}</p>
                      </div>
                    ))}
                    <form onSubmit={sendNote} className="space-y-2 border-t border-dashed border-amber-300/60 pt-3 dark:border-amber-700/50">
                      <label className="sr-only" htmlFor="internal-note">
                        Add internal note
                      </label>
                      <textarea
                        id="internal-note"
                        className="min-h-[80px] w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs dark:border-amber-800 dark:bg-zinc-950"
                        placeholder="Add an internal note…"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={noteSending || !noteDraft.trim()}
                        className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
                      >
                        {noteSending ? 'Saving…' : 'Add note'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {isLgDown && mobileShowQueue ? (
        <button
          type="button"
          onClick={() => setNewTicketOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg ring-2 ring-white/20 transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-500 dark:ring-zinc-900/50 dark:hover:bg-indigo-400"
          style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
          aria-label="New Ticket"
          title="New Ticket"
        >
          <Plus className="h-7 w-7" strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      {(!isLgDown || mobileShowQueue) && (
        <AdminNewTicketInline
          open={newTicketOpen}
          onOpenChange={setNewTicketOpen}
          sheetOnMobile={isLgDown && mobileShowQueue}
          onCreated={(id) => selectTicket(id)}
          loadQueue={loadQueue}
        />
      )}
    </div>
  );
}

function AdminNewTicketInline({
  open,
  onOpenChange,
  sheetOnMobile,
  onCreated,
  loadQueue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, render create form in a bottom sheet (mobile list + FAB). */
  sheetOnMobile: boolean;
  onCreated: (id: string) => void;
  loadQueue: () => Promise<void>;
}) {
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetBusinessId, setTargetBusinessId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          details: details.trim(),
          target_user_id: targetUserId.trim() || null,
          target_business_id: targetBusinessId.trim() || null,
          priority,
        }),
      });
      const j = (await res.json()) as { ticket_id?: string; error?: string };
      if (!res.ok || !j.ticket_id) {
        window.alert(typeof j.error === 'string' ? j.error : 'Failed');
        return;
      }
      setSubject('');
      setDetails('');
      onOpenChange(false);
      await loadQueue();
      onCreated(j.ticket_id);
    } finally {
      setLoading(false);
    }
  }

  const formFields = (
    <form onSubmit={submit} className="grid gap-2 md:grid-cols-2">
      <input
        className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        required
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        aria-label="Priority"
      >
        {SUPPORT_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {labelSupportPriority(p)}
          </option>
        ))}
      </select>
      <input
        className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="Target user id (optional)"
        value={targetUserId}
        onChange={(e) => setTargetUserId(e.target.value)}
      />
      <input
        className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="Target business id (optional)"
        value={targetBusinessId}
        onChange={(e) => setTargetBusinessId(e.target.value)}
      />
      <textarea
        className="min-h-[80px] rounded-md border border-zinc-200 px-2 py-1.5 text-xs md:col-span-2 dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="Details (first staff message)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="w-fit rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? 'Creating…' : 'Create'}
      </button>
    </form>
  );

  if (sheetOnMobile) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-labelledby="admin-new-ticket-title">
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
        />
        <div className="relative max-h-[min(92dvh,720px)] overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-zinc-700 dark:bg-zinc-950">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="admin-new-ticket-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              New Ticket
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {formFields}
        </div>
      </div>
    );
  }

  return (
    <AdminContentCard>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
      >
        {open ? '− Hide new ticket form' : '+ Create ticket (internal)'}
      </button>
      {open ? <div className="mt-3">{formFields}</div> : null}
    </AdminContentCard>
  );
}
