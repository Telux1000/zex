'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { NewSupportTicketModal } from '@/components/support/NewSupportTicketModal';
import {
  SupportConversationPanel,
  type ConversationMessage,
  type ConversationTicket,
} from '@/components/support/SupportConversationPanel';
import { SupportTicketListPanel, type SupportTicketListRow } from '@/components/support/SupportTicketListPanel';
import { useSupportUnread } from '@/contexts/SupportUnreadContext';
import { useIsLgDown } from '@/hooks/use-is-lg-down';
import {
  SUPPORT_INBOUND_MESSAGE_EVENT,
  type SupportInboundMessageDetail,
} from '@/lib/support/support-inbox-events';
import { cn } from '@/lib/utils/cn';
import { formatSupportTicketRef } from '@/lib/support/ticket-number';

function inboundDetailToMessage(d: SupportInboundMessageDetail): ConversationMessage {
  return {
    id: d.id,
    author_user_id: d.author_user_id,
    body: d.body,
    is_staff: d.is_staff,
    created_at: d.created_at,
    attachment_storage_path: d.attachment_storage_path,
    attachment_content_type: d.attachment_content_type,
    attachment_original_name: d.attachment_original_name,
    attachment_size_bytes: d.attachment_size_bytes,
  };
}

export function SupportDesk({
  currentUserId,
  initialTicketId,
  initialComposeOpen,
}: {
  currentUserId: string;
  initialTicketId: string | null;
  initialComposeOpen: boolean;
}) {
  const router = useRouter();
  const composeOpened = useRef(false);
  const supportUnread = useSupportUnread();

  const [tickets, setTickets] = useState<SupportTicketListRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId);
  const [ticket, setTicket] = useState<ConversationTicket | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');
  /** Mobile-only: true = inbox list, false = full-screen thread. Desktop always shows split view. */
  const [mobileShowList, setMobileShowList] = useState(!initialTicketId);
  const isLgDown = useIsLgDown();

  const filteredTickets = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        (t.last_message_preview && t.last_message_preview.toLowerCase().includes(q)) ||
        (t.ticket_number != null && String(formatSupportTicketRef(t.ticket_number)).toLowerCase().includes(q))
    );
  }, [tickets, listSearch]);

  const refreshTickets = useCallback(async () => {
    const res = await fetch('/api/support/tickets');
    const j = (await res.json()) as { tickets?: SupportTicketListRow[]; total_unread?: number };
    setTickets(j.tickets ?? []);
    if (typeof j.total_unread === 'number' && supportUnread) {
      supportUnread.setTotalUnread(j.total_unread);
    }
  }, [supportUnread]);

  useEffect(() => {
    setListLoading(true);
    void refreshTickets().finally(() => setListLoading(false));
  }, [refreshTickets]);

  useEffect(() => {
    setSelectedId(initialTicketId);
    setMobileShowList(!initialTicketId);
  }, [initialTicketId]);

  useEffect(() => {
    supportUnread?.setActiveTicketId(selectedId);
  }, [selectedId, supportUnread]);

  useEffect(() => {
    if (!initialComposeOpen || composeOpened.current) return;
    composeOpened.current = true;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      router.replace('/dashboard/support/new');
      return;
    }
    setModalOpen(true);
    router.replace('/dashboard/support', { scroll: false });
  }, [initialComposeOpen, router]);

  const loadConversation = useCallback(async (id: string) => {
    setConvLoading(true);
    setTicket(null);
    setMessages([]);
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      const j = (await res.json()) as {
        ticket?: ConversationTicket;
        messages?: ConversationMessage[];
        error?: string;
      };
      if (!res.ok || !j.ticket) {
        setTicket(null);
        setMessages([]);
        return;
      }
      setTicket(j.ticket);
      setMessages(j.messages ?? []);
      void refreshTickets();
    } finally {
      setConvLoading(false);
    }
  }, [refreshTickets]);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      setMessages([]);
      return;
    }
    void loadConversation(selectedId);
  }, [selectedId, loadConversation]);

  function selectTicket(id: string) {
    setSelectedId(id);
    setMobileShowList(false);
    router.push(`/dashboard/support/${id}`, { scroll: false });
  }

  function openNewTicket() {
    if (isLgDown) {
      router.push('/dashboard/support/new');
    } else {
      setModalOpen(true);
    }
  }

  function onCreatedTicket(id: string) {
    void refreshTickets().then(() => {
      selectTicket(id);
    });
  }

  async function handleSend(payload: {
    body: string;
    file: File | null;
  }): Promise<{ ok: boolean; message?: ConversationMessage; error?: string }> {
    if (!selectedId) return { ok: false, error: 'No conversation selected.' };
    const fd = new FormData();
    if (payload.body.trim()) fd.set('body', payload.body);
    if (payload.file) fd.set('file', payload.file);
    const res = await fetch(`/api/support/tickets/${selectedId}/messages`, {
      method: 'POST',
      body: fd,
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: ConversationMessage;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: typeof j.error === 'string' ? j.error : 'Could not send message.',
      };
    }
    return { ok: true, message: j.message };
  }

  function mobileBackToList() {
    setMobileShowList(true);
    setSelectedId(null);
    router.push('/dashboard/support', { scroll: false });
  }

  useEffect(() => {
    const onInbound = (e: Event) => {
      const d = (e as CustomEvent<SupportInboundMessageDetail>).detail;
      if (!d || d.author_user_id === currentUserId) return;
      if (d.ticket_id === selectedId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === d.id)) return prev;
          return [...prev, inboundDetailToMessage(d)];
        });
        void fetch(`/api/support/tickets/${d.ticket_id}/read`, { method: 'POST' }).then(() => {
          void refreshTickets();
        });
      } else {
        void refreshTickets();
      }
    };
    window.addEventListener(SUPPORT_INBOUND_MESSAGE_EVENT, onInbound as EventListener);
    return () => window.removeEventListener(SUPPORT_INBOUND_MESSAGE_EVENT, onInbound as EventListener);
  }, [selectedId, currentUserId, refreshTickets]);

  const closed = ticket ? String(ticket.status).toLowerCase() === 'closed' : false;

  const showMobileChatStack = isLgDown && !mobileShowList;
  const showMobileInboxOnly = isLgDown && mobileShowList;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--background)]">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Inbox list: mobile = full viewport when stacked; desktop = left column (always with thread pane). */}
        <div
          className={cn(
            'min-h-0 flex-col bg-[var(--background)] lg:flex lg:w-[min(100%,400px)] lg:max-w-md lg:shrink-0 lg:border-r lg:border-[var(--card-border)]',
            /* Mobile: only the list OR only the thread — never split */
            showMobileInboxOnly && 'flex flex-1',
            showMobileChatStack && 'hidden',
            /* Desktop: list column always visible */
            !isLgDown && 'hidden lg:flex',
            !isLgDown && 'lg:h-full'
          )}
        >
          <SupportTicketListPanel
            tickets={filteredTickets}
            selectedId={selectedId}
            onSelect={selectTicket}
            onNewTicket={openNewTicket}
            loading={listLoading}
            searchQuery={listSearch}
            onSearchChange={setListSearch}
          />
        </div>

        {/* Thread: mobile = full-screen stack; desktop = right column */}
        <div
          className={cn(
            'min-h-0 min-w-0 flex-col bg-[var(--card)] lg:flex lg:min-h-0 lg:flex-1',
            showMobileInboxOnly && 'hidden',
            showMobileChatStack && 'flex flex-1',
            !isLgDown && 'hidden lg:flex'
          )}
        >
          {showMobileChatStack && (
            <div className="flex shrink-0 items-center gap-3 border-b border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={mobileBackToList}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-400"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
                All Tickets
              </button>
              <div className="min-w-0 flex-1">
                {ticket ? (
                  <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {ticket.subject}
                    {ticket.ticket_number != null ? (
                      <small className="font-normal text-slate-500 dark:text-slate-400">
                        {' '}(#{formatSupportTicketRef(ticket.ticket_number)})
                      </small>
                    ) : null}
                  </h2>
                ) : convLoading && selectedId ? (
                  <p className="truncate text-sm text-slate-500">Loading…</p>
                ) : null}
              </div>
            </div>
          )}

          {convLoading && selectedId ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--card)] text-sm text-slate-500">
              Loading conversation…
            </div>
          ) : (
            <SupportConversationPanel
              ticket={ticket}
              messages={messages}
              currentUserId={currentUserId}
              readOnly={closed}
              onSend={handleSend}
              onRefreshList={refreshTickets}
              hideTicketHeader={showMobileChatStack}
            />
          )}
        </div>
      </div>

      {showMobileInboxOnly ? (
        <button
          type="button"
          onClick={openNewTicket}
          className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg ring-2 ring-white/20 transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-indigo-500 dark:ring-slate-900/50 dark:hover:bg-indigo-400 lg:hidden"
          style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
          aria-label="New Ticket"
          title="New Ticket"
        >
          <Plus className="h-7 w-7" strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      {!isLgDown ? (
        <NewSupportTicketModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={onCreatedTicket} />
      ) : null}
    </div>
  );
}
