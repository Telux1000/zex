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
  computeAdminBellUnreadCount,
  type AdminBellItem,
} from '@/lib/admin/admin-notification-feed';

const REALTIME_DEBOUNCE_MS = 450;
const POLL_INTERVAL_MS = 60_000;

const readStorageKey = (userId: string) => `zenzex.adminBellReadIds:${userId}`;

function loadReadIds(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(readStorageKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(userId: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(readStorageKey(userId), JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

type AdminNotificationsContextValue = {
  items: AdminBellItem[];
  unreadCount: number;
  loading: boolean;
  readIds: Set<string>;
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
};

const AdminNotificationsContext = createContext<AdminNotificationsContextValue | null>(null);

export function useAdminNotifications(): AdminNotificationsContextValue {
  const ctx = useContext(AdminNotificationsContext);
  if (!ctx) {
    throw new Error('useAdminNotifications must be used within AdminNotificationsProvider');
  }
  return ctx;
}

export function AdminNotificationsProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [items, setItems] = useState<AdminBellItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIdsState] = useState<Set<string>>(() => loadReadIds(userId));
  const debounceRef = useRef<number | null>(null);

  const unreadCount = useMemo(() => computeAdminBellUnreadCount(items, readIds), [items, readIds]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/feed', { method: 'GET' });
      const data = (await res.json()) as { items?: AdminBellItem[]; error?: string };
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load notifications');
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setReadIdsState(loadReadIds(userId));
  }, [userId]);

  const markRead = useCallback(
    (id: string) => {
      setReadIdsState((prev) => {
        const next = new Set(prev);
        next.add(id);
        saveReadIds(userId, next);
        return next;
      });
    },
    [userId]
  );

  const markAllRead = useCallback(() => {
    setReadIdsState((prev) => {
      const next = new Set(prev);
      for (const it of items) next.add(it.id);
      saveReadIds(userId, next);
      return next;
    });
  }, [items, userId]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void refresh();
    }, REALTIME_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-audit-feed-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_audit_logs' },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [userId, scheduleRefresh]);

  const value = useMemo(
    () =>
      ({
        items,
        unreadCount,
        loading,
        readIds,
        refresh,
        markRead,
        markAllRead,
      }) satisfies AdminNotificationsContextValue,
    [items, unreadCount, loading, readIds, refresh, markRead, markAllRead]
  );

  return (
    <AdminNotificationsContext.Provider value={value}>{children}</AdminNotificationsContext.Provider>
  );
}
