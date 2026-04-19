'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { useDashboardNotifications } from '@/contexts/DashboardNotificationsContext';
import type { NotificationModel } from '@/lib/notifications/types';

function categoryPillClasses(category: NotificationModel['category']) {
  switch (category) {
    case 'urgent':
      return 'bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 border border-rose-200/60 dark:border-rose-500/20';
    case 'action_needed':
      return 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-500/20';
    case 'opportunity':
      return 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200/60 dark:border-amber-500/20';
    case 'info':
    default:
      return 'bg-slate-50 text-slate-800 dark:bg-slate-950/30 dark:text-slate-300 border border-slate-200/60 dark:border-slate-500/20';
  }
}

function severityDotClasses(severity: NotificationModel['severity']) {
  switch (severity) {
    case 'high':
      return 'bg-rose-600 dark:bg-rose-500';
    case 'medium':
      return 'bg-indigo-600 dark:bg-indigo-500';
    case 'low':
    default:
      return 'bg-slate-400 dark:bg-slate-500';
  }
}

export function NotificationsPanel({
  open,
  onClose,
  mobileSheet,
}: {
  open: boolean;
  onClose: () => void;
  mobileSheet: boolean;
}) {
  const router = useRouter();
  const { showErrorToast } = useToasts();
  const [actionLoading, setActionLoading] = useState(false);
  const {
    items: notifications,
    setItems: setNotifications,
    unreadActionableCount,
    loading: listLoading,
    refresh,
  } = useDashboardNotifications();

  const loading = listLoading || actionLoading;

  const shouldRender = open;

  const header = useMemo(() => {
    if (!shouldRender) return null;
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</span>
            {unreadActionableCount > 0 ? (
              <span className="inline-flex items-center justify-center rounded-full bg-violet-600 px-2 py-0.5 text-xs font-bold text-white dark:bg-violet-500">
                {unreadActionableCount > 99 ? '99+' : unreadActionableCount}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Invoices, reminders, billing, and account activity — not support chat.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setActionLoading(true);
              try {
                const res = await fetch('/api/notifications/mark-all', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? 'Could not mark as read');
                setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
              } catch (err) {
                showErrorToast(err instanceof Error ? err.message : 'Could not mark as read');
              } finally {
                setActionLoading(false);
              }
            }}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-indigo-300/40 hover:text-indigo-600 dark:text-slate-200 dark:hover:border-indigo-500/30"
          >
            Mark all as read
          </button>
        </div>
      </div>
    );
  }, [loading, unreadActionableCount, shouldRender, setNotifications, showErrorToast]);

  const content = (
    <div
      className="fixed inset-0 z-[100] flex"
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 dark:bg-black/60"
        aria-label="Close notifications"
        onClick={onClose}
      />

      <div
        className={
          mobileSheet
            ? 'relative mt-auto w-full rounded-t-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-lg'
            : 'relative ml-auto mt-14 w-[22rem] max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-lg'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close notifications panel"
          onClick={onClose}
          className="absolute top-2 right-2 rounded p-1 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
        >
          ✕
        </button>
        {header}
        <div className="px-4 pb-4">
          {loading && notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">Loading…</div>
          ) : null}

          {notifications.length === 0 && !loading ? (
            <div className="py-10 text-center">
              <div className="text-sm font-medium text-slate-900 dark:text-white">No notifications</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">You’re all caught up.</div>
            </div>
          ) : null}

          <div className="max-h-[min(60vh,32rem)] overflow-y-auto pr-1">
            {notifications.map((n) => {
              const created = n.createdAt ? new Date(n.createdAt) : new Date();
              const ts = created.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

              return (
                <div
                  key={n.id}
                  className={[
                    'rounded-xl border border-[var(--card-border)] bg-white p-3 dark:bg-slate-900',
                    n.read ? 'opacity-80' : 'ring-1 ring-indigo-500/30',
                    'transition-colors hover:border-indigo-300/50 dark:hover:border-indigo-500/30',
                    'mb-2',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-2 w-2 rounded-full ${severityDotClasses(n.severity)}`} />
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryPillClasses(n.category)}`}>
                          {n.category === 'action_needed' ? 'Action needed' : n.category.charAt(0).toUpperCase() + n.category.slice(1)}
                        </span>
                      </div>
                      <div className="mt-2 truncate text-sm font-semibold text-slate-900 dark:text-white">{n.title}</div>
                      <div className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {n.description}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{ts}</span>
                        {n.actionTarget && n.actionLabel ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await fetch('/api/notifications/mark-read', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ notificationId: n.id }),
                                });
                              } catch {}
                              setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                              onClose();
                              router.push(String(n.actionTarget));
                            }}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                          >
                            {n.actionLabel}
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          disabled={loading}
                          onClick={async () => {
                            setActionLoading(true);
                            try {
                              const res = await fetch('/api/notifications/dismiss', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ notificationId: n.id }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data?.error ?? 'Could not dismiss');
                              setNotifications((prev) => prev.filter((x) => x.id !== n.id));
                            } catch (err) {
                              showErrorToast(err instanceof Error ? err.message : 'Could not dismiss');
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                        >
                          Dismiss notification
                        </button>

                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          disabled={loading}
                          onClick={async () => {
                            setActionLoading(true);
                            try {
                              const res = await fetch('/api/notifications/dismiss-group', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ groupKey: n.groupKey }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data?.error ?? 'Could not dismiss group');

                              setNotifications((prev) => prev.filter((x) => x.groupKey !== n.groupKey));
                            } catch (err) {
                              showErrorToast(err instanceof Error ? err.message : 'Could not dismiss group');
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                        >
                          Dismiss group
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  if (!open || !shouldRender) return null;
  return createPortal(content, document.body);
}
