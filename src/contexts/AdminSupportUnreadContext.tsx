'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  dispatchAdminSupportMessageInsert,
  type AdminSupportMessageInsertDetail,
} from '@/lib/support/support-inbox-events';
import { playAdminSupportNotificationChime } from '@/lib/support/support-notification-sound';
import { useToasts } from '@/components/feedback/toast/ToastProvider';

export type AdminSupportInboxPreviewTicket = {
  id: string;
  subject: string;
  status: string;
  ticket_number: number;
  unread_count: number;
  last_message_preview: string | null;
  user_display: string;
  account_name?: string | null;
  updated_at: string;
};

type AdminSupportUnreadContextValue = {
  totalUnread: number;
  setTotalUnread: (n: number) => void;
  refreshTotals: () => Promise<void>;
  inboxPreview: AdminSupportInboxPreviewTicket[];
  inboxPreviewLoading: boolean;
  refreshInboxPreview: () => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => Promise<void>;
  setActiveTicketId: (id: string | null) => void;
  setTicketLabelMap: (map: Record<string, string>) => void;
};

const INBOX_PREVIEW_POLL_MS = 60_000;

const AdminSupportUnreadContext = createContext<AdminSupportUnreadContextValue | null>(null);

export function useAdminSupportUnread() {
  return useContext(AdminSupportUnreadContext);
}

type UnreadRpcRow = { ticket_id: string; unread_count: number };

export function AdminSupportUnreadProvider({
  children,
  userId,
  initialTotalUnread,
  initialSoundEnabled,
}: {
  children: ReactNode;
  userId: string;
  initialTotalUnread: number;
  initialSoundEnabled: boolean;
}) {
  const { showSuccessToast } = useToasts();
  const [totalUnread, setTotalUnreadState] = useState(initialTotalUnread);
  const [inboxPreview, setInboxPreview] = useState<AdminSupportInboxPreviewTicket[]>([]);
  const [inboxPreviewLoading, setInboxPreviewLoading] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(initialSoundEnabled);
  const soundEnabledRef = useRef(initialSoundEnabled);
  const activeTicketIdRef = useRef<string | null>(null);
  const userIdRef = useRef(userId);
  const ticketLabelMapRef = useRef<Record<string, string>>({});
  const lastToastAtRef = useRef(0);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    setTotalUnreadState(initialTotalUnread);
  }, [initialTotalUnread]);

  useEffect(() => {
    setSoundEnabledState(initialSoundEnabled);
  }, [initialSoundEnabled]);

  const refreshTotals = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('support_ticket_unread_for_internal_staff');
      if (error) return;
      const rows = (data ?? []) as UnreadRpcRow[];
      const sum = rows.reduce((s, r) => s + (Number(r.unread_count) || 0), 0);
      setTotalUnreadState(sum);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshInboxPreview = useCallback(async () => {
    setInboxPreviewLoading(true);
    try {
      const res = await fetch('/api/admin/support/tickets?preview=1&limit=12');
      const j = (await res.json()) as {
        tickets?: AdminSupportInboxPreviewTicket[];
        total_unread?: number;
        error?: string;
      };
      if (!res.ok) return;
      setInboxPreview(j.tickets ?? []);
      if (typeof j.total_unread === 'number') setTotalUnreadState(j.total_unread);
    } catch {
      /* ignore */
    } finally {
      setInboxPreviewLoading(false);
    }
  }, []);

  const setActiveTicketId = useCallback((id: string | null) => {
    activeTicketIdRef.current = id;
  }, []);

  const setTicketLabelMap = useCallback((map: Record<string, string>) => {
    ticketLabelMapRef.current = map;
  }, []);

  const setSoundEnabled = useCallback(async (v: boolean) => {
    setSoundEnabledState(v);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_support_ticket_sound: v }),
      });
      if (!res.ok) {
        setSoundEnabledState(!v);
      }
    } catch {
      setSoundEnabledState(!v);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-support-messages-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' },
        async (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row?.ticket_id || !row.author_user_id) return;

          const tid = String(row.ticket_id);
          const author = String(row.author_user_id);
          const isStaff = Boolean(row.is_staff);

          const detail: AdminSupportMessageInsertDetail = {
            id: String(row.id ?? ''),
            ticket_id: tid,
            author_user_id: author,
            body: String(row.body ?? ''),
            is_staff: isStaff,
            created_at: String(row.created_at ?? new Date().toISOString()),
            attachment_storage_path:
              row.attachment_storage_path != null ? String(row.attachment_storage_path) : null,
            attachment_content_type:
              row.attachment_content_type != null ? String(row.attachment_content_type) : null,
            attachment_original_name:
              row.attachment_original_name != null ? String(row.attachment_original_name) : null,
            attachment_size_bytes:
              row.attachment_size_bytes != null ? Number(row.attachment_size_bytes) : null,
          };

          dispatchAdminSupportMessageInsert(detail);

          if (!isStaff) {
            const viewing = activeTicketIdRef.current === tid;
            if (viewing) {
              try {
                await fetch(`/api/admin/support/tickets/${tid}/read`, { method: 'POST' });
              } catch {
                /* ignore */
              }
            } else {
              if (soundEnabledRef.current) {
                playAdminSupportNotificationChime(detail.id);
              }
              const now = Date.now();
              if (now - lastToastAtRef.current > 3500) {
                lastToastAtRef.current = now;
                const label = ticketLabelMapRef.current[tid]?.trim();
                const who = label && label.length > 0 ? label : 'Customer';
                showSuccessToast(`New message from ${who}`);
              }
            }
            void refreshTotals();
            void refreshInboxPreview();
          } else {
            void refreshInboxPreview();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshInboxPreview, refreshTotals, showSuccessToast, userId]);

  const setTotalUnread = useCallback((n: number) => {
    if (typeof n === 'number' && !Number.isNaN(n)) setTotalUnreadState(n);
  }, []);

  useEffect(() => {
    void refreshInboxPreview();
  }, [refreshInboxPreview]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshInboxPreview();
    }, INBOX_PREVIEW_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshInboxPreview]);

  const value = useMemo(
    () =>
      ({
        totalUnread,
        setTotalUnread,
        refreshTotals,
        inboxPreview,
        inboxPreviewLoading,
        refreshInboxPreview,
        soundEnabled,
        setSoundEnabled,
        setActiveTicketId,
        setTicketLabelMap,
      }) satisfies AdminSupportUnreadContextValue,
    [
      totalUnread,
      setTotalUnread,
      refreshTotals,
      inboxPreview,
      inboxPreviewLoading,
      refreshInboxPreview,
      soundEnabled,
      setSoundEnabled,
      setActiveTicketId,
      setTicketLabelMap,
    ]
  );

  return <AdminSupportUnreadContext.Provider value={value}>{children}</AdminSupportUnreadContext.Provider>;
}
