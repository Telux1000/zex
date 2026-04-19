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
  dispatchSupportInboundMessage,
  type SupportInboundMessageDetail,
} from '@/lib/support/support-inbox-events';
import {
  getSupportSoundEnabled,
  playSupportNotificationChime,
  setSupportSoundEnabled as persistSupportSoundEnabled,
} from '@/lib/support/support-notification-sound';

type SupportUnreadContextValue = {
  totalUnread: number;
  setTotalUnread: (n: number) => void;
  refreshTotals: () => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  setActiveTicketId: (id: string | null) => void;
};

const SupportUnreadContext = createContext<SupportUnreadContextValue | null>(null);

export function useSupportUnread() {
  return useContext(SupportUnreadContext);
}

export function SupportUnreadProvider({
  children,
  businessId,
  userId,
  initialTotalUnread,
  enabled,
}: {
  children: ReactNode;
  businessId: string | null;
  userId: string;
  initialTotalUnread: number;
  enabled: boolean;
}) {
  const [totalUnread, setTotalUnread] = useState(initialTotalUnread);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const activeTicketIdRef = useRef<string | null>(null);
  const userIdRef = useRef(userId);
  const businessIdRef = useRef(businessId);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  useEffect(() => {
    businessIdRef.current = businessId;
  }, [businessId]);

  useEffect(() => {
    setTotalUnread(initialTotalUnread);
  }, [initialTotalUnread]);

  useEffect(() => {
    setSoundEnabledState(getSupportSoundEnabled());
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    persistSupportSoundEnabled(v);
    setSoundEnabledState(v);
  }, []);

  const refreshTotals = useCallback(async () => {
    try {
      const res = await fetch('/api/support/tickets');
      const j = (await res.json()) as { total_unread?: number; tickets?: { unread_count?: number }[] };
      if (typeof j.total_unread === 'number') {
        setTotalUnread(j.total_unread);
        return;
      }
      const sum = (j.tickets ?? []).reduce((s, t) => s + (t.unread_count ?? 0), 0);
      setTotalUnread(sum);
    } catch {
      /* ignore */
    }
  }, []);

  const setActiveTicketId = useCallback((id: string | null) => {
    activeTicketIdRef.current = id;
  }, []);

  useEffect(() => {
    if (!enabled || !businessId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`support-messages-${businessId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row?.ticket_id || !row.author_user_id) return;
          const tid = String(row.ticket_id);
          const author = String(row.author_user_id);
          const uid = userIdRef.current;
          if (author === uid) return;

          const detail: SupportInboundMessageDetail = {
            id: String(row.id ?? ''),
            ticket_id: tid,
            author_user_id: author,
            body: String(row.body ?? ''),
            is_staff: Boolean(row.is_staff),
            created_at: String(row.created_at ?? new Date().toISOString()),
            attachment_storage_path: row.attachment_storage_path != null ? String(row.attachment_storage_path) : null,
            attachment_content_type: row.attachment_content_type != null ? String(row.attachment_content_type) : null,
            attachment_original_name: row.attachment_original_name != null ? String(row.attachment_original_name) : null,
            attachment_size_bytes:
              row.attachment_size_bytes != null ? Number(row.attachment_size_bytes) : null,
          };

          dispatchSupportInboundMessage(detail);

          const viewing = activeTicketIdRef.current === tid;
          if (!viewing && getSupportSoundEnabled()) {
            playSupportNotificationChime(detail.id);
          }

          void refreshTotals();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, enabled, refreshTotals]);

  const value = useMemo(
    () =>
      ({
        totalUnread,
        setTotalUnread,
        refreshTotals,
        soundEnabled,
        setSoundEnabled,
        setActiveTicketId,
      }) satisfies SupportUnreadContextValue,
    [totalUnread, refreshTotals, soundEnabled, setSoundEnabled, setActiveTicketId]
  );

  return <SupportUnreadContext.Provider value={value}>{children}</SupportUnreadContext.Provider>;
}
