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
import { computeUnreadActionableCount } from '@/lib/notifications/unread-actionable';
import type { NotificationModel } from '@/lib/notifications/types';

type IntelligenceResponse = {
  notifications: NotificationModel[];
  unreadActionableCount: number;
};

type DashboardNotificationsContextValue = {
  items: NotificationModel[];
  unreadActionableCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  setItems: React.Dispatch<React.SetStateAction<NotificationModel[]>>;
};

const DashboardNotificationsContext = createContext<DashboardNotificationsContextValue | null>(null);

const REALTIME_DEBOUNCE_MS = 450;
/** Polling fallback when Realtime is unavailable (also add `notifications` to `supabase_realtime`). */
const POLL_INTERVAL_MS = 90_000;

export function useDashboardNotifications(): DashboardNotificationsContextValue {
  const ctx = useContext(DashboardNotificationsContext);
  if (!ctx) {
    throw new Error('useDashboardNotifications must be used within DashboardNotificationsProvider');
  }
  return ctx;
}

export function DashboardNotificationsProvider({
  businessId,
  initialUnreadActionableCount,
  children,
}: {
  businessId: string | null;
  initialUnreadActionableCount: number;
  children: ReactNode;
}) {
  const [items, setItems] = useState<NotificationModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const unreadActionableCount = useMemo(() => computeUnreadActionableCount(items), [items]);

  const refresh = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/intelligence', { method: 'GET' });
      const data = (await res.json()) as IntelligenceResponse & { error?: string };
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load notifications');
      setItems(data.notifications ?? []);
      setHydrated(true);
    } catch {
      setHydrated(true);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const scheduleRefresh = useCallback(() => {
    if (!businessId) return;
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void refresh();
    }, REALTIME_DEBOUNCE_MS);
  }, [businessId, refresh]);

  useEffect(() => {
    if (!businessId) {
      setItems([]);
      setHydrated(false);
      return;
    }
    void refresh();
  }, [businessId, refresh]);

  useEffect(() => {
    if (!businessId) return;

    const id = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [businessId, refresh]);

  useEffect(() => {
    if (!businessId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `business_id=eq.${businessId}`,
        },
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
  }, [businessId, scheduleRefresh]);

  const unreadActionableCountForUi = businessId
    ? hydrated
      ? unreadActionableCount
      : initialUnreadActionableCount
    : 0;

  const value = useMemo(
    () =>
      ({
        items,
        unreadActionableCount: unreadActionableCountForUi,
        loading,
        refresh,
        setItems,
      }) satisfies DashboardNotificationsContextValue,
    [items, unreadActionableCountForUi, loading, refresh]
  );

  return (
    <DashboardNotificationsContext.Provider value={value}>{children}</DashboardNotificationsContext.Provider>
  );
}
