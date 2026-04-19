'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdminNotifications } from '@/contexts/AdminNotificationsContext';
import { useAdminSupportUnread } from '@/contexts/AdminSupportUnreadContext';
import { cn } from '@/lib/utils/cn';
import { formatSupportTicketRef } from '@/lib/support/ticket-number';

function capBadge(n: number): string | null {
  if (n <= 0) return null;
  return n > 99 ? '99+' : String(n);
}

export function AdminHeaderAlertsAndMessages() {
  const pathname = usePathname();
  const support = useAdminSupportUnread();
  const alerts = useAdminNotifications();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<'bell' | 'messages' | null>(null);

  const msgCount = support?.totalUnread ?? 0;
  const msgBadge = useMemo(() => capBadge(msgCount), [msgCount]);
  const bellBadge = useMemo(() => capBadge(alerts.unreadCount), [alerts.unreadCount]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  return (
    <div ref={wrapRef} className="relative flex shrink-0 items-center gap-1">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => (v === 'messages' ? null : 'messages'))}
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-lg border text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-indigo-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-indigo-300',
            open === 'messages'
              ? 'border-indigo-300/50 bg-indigo-500/[0.08] text-indigo-600 dark:border-indigo-500/30 dark:text-indigo-300'
              : 'border-transparent'
          )}
          aria-label="Support inbox and conversations"
          title="Messages"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={2} aria-hidden />
          {msgBadge ? (
            <span className="absolute right-0 top-0 flex h-4 min-w-[1rem] max-w-[2.25rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white dark:bg-indigo-500">
              {msgBadge}
            </span>
          ) : null}
        </button>

        {open === 'messages' ? (
          <div
            className="absolute right-0 top-full z-[60] mt-1.5 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            role="menu"
          >
            <div className="border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Messages</p>
              <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                Support threads and ticket replies — not system alerts.
              </p>
            </div>
            <div className="max-h-[min(60vh,22rem)] overflow-y-auto">
              {support?.inboxPreviewLoading && (support.inboxPreview?.length ?? 0) === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-zinc-500">Loading…</div>
              ) : null}
              {(support?.inboxPreview ?? []).length === 0 && !support?.inboxPreviewLoading ? (
                <div className="px-3 py-8 text-center text-sm text-zinc-600 dark:text-zinc-300">No open threads</div>
              ) : null}
              {(support?.inboxPreview ?? []).map((t) => {
                const unread = t.unread_count > 0;
                return (
                  <Link
                    key={t.id}
                    href={`/admin/support/${t.id}`}
                    onClick={() => setOpen(null)}
                    className={cn(
                      'block border-b border-zinc-100 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/80',
                      unread && 'bg-indigo-500/[0.06] dark:bg-indigo-400/[0.07]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {t.subject}
                      </span>
                      {unread ? (
                        <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-indigo-500">
                          {t.unread_count > 99 ? '99+' : t.unread_count}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                      #{formatSupportTicketRef(t.ticket_number)} · {t.user_display}
                    </p>
                    {t.last_message_preview ? (
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                        {t.last_message_preview}
                      </p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
              <Link
                href="/admin/support"
                onClick={() => setOpen(null)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                Open support inbox →
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => (v === 'bell' ? null : 'bell'))}
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-lg border text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-violet-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-violet-300',
            open === 'bell'
              ? 'border-violet-300/50 bg-violet-500/[0.08] text-violet-700 dark:border-violet-500/30 dark:text-violet-300'
              : 'border-transparent'
          )}
          aria-label="System and admin alerts"
          title="Alerts"
        >
          <Bell className="h-4 w-4" strokeWidth={2} aria-hidden />
          {bellBadge ? (
            <span className="absolute right-0 top-0 flex h-4 min-w-[1rem] max-w-[2.25rem] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none text-white dark:bg-violet-500">
              {bellBadge}
            </span>
          ) : null}
        </button>

        {open === 'bell' ? (
          <div
            className="absolute right-0 top-full z-[60] mt-1.5 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            role="menu"
          >
            <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Alerts</p>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Security, billing sync, staff invites — not support chat.
                </p>
              </div>
              {alerts.items.length > 0 ? (
                <button
                  type="button"
                  onClick={() => alerts.markAllRead()}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
                >
                  Mark read
                </button>
              ) : null}
            </div>
            <div className="max-h-[min(60vh,22rem)] overflow-y-auto">
              {alerts.loading && alerts.items.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-zinc-500">Loading…</div>
              ) : null}
              {alerts.items.length === 0 && !alerts.loading ? (
                <div className="px-3 py-8 text-center text-sm text-zinc-600 dark:text-zinc-300">
                  No system alerts
                </div>
              ) : null}
              {alerts.items.map((n) => {
                const created = new Date(n.createdAt);
                const ts = created.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isNew = !alerts.readIds.has(n.id);
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'border-b border-zinc-100 px-3 py-2.5 last:border-b-0 dark:border-zinc-800',
                      isNew && 'bg-violet-500/[0.05] dark:bg-violet-400/[0.06]'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          n.severity === 'high'
                            ? 'bg-rose-500'
                            : n.severity === 'medium'
                              ? 'bg-violet-500'
                              : 'bg-zinc-300 dark:bg-zinc-600'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{n.title}</p>
                        <p className="mt-0.5 text-xs leading-snug text-zinc-600 dark:text-zinc-300">{n.description}</p>
                        <p className="mt-1 text-[10px] text-zinc-400">{ts}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {n.href ? (
                            <Link
                              href={n.href}
                              onClick={() => {
                                alerts.markRead(n.id);
                                setOpen(null);
                              }}
                              className="inline-flex rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-500 dark:bg-violet-500"
                            >
                              Open
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => alerts.markRead(n.id)}
                            className="inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
