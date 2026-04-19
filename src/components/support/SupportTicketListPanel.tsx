'use client';

import Link from 'next/link';
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { labelSupportTicketStatus } from '@/lib/support/ticket-status';
import { formatSupportTicketRef } from '@/lib/support/ticket-number';
import { useSupportUnread } from '@/contexts/SupportUnreadContext';
import { useIsLgDown } from '@/hooks/use-is-lg-down';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

export type SupportTicketListRow = {
  id: string;
  subject: string;
  status: string;
  ticket_number: number | null;
  updated_at: string;
  last_message_preview: string;
  last_message_at: string;
  /** Inbound messages from others since last read */
  unread_count?: number;
};

function shortRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 45_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'open') return 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-200';
  if (s === 'pending') return 'bg-amber-500/15 text-amber-900 dark:text-amber-200';
  if (s === 'resolved') return 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200';
  if (s === 'closed') return 'bg-slate-500/15 text-slate-700 dark:text-slate-300';
  return 'bg-slate-500/10 text-slate-600 dark:text-slate-400';
}

function TicketUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const n = count > 99 ? '99+' : String(count);
  return (
    <span className="inline-flex min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-indigo-600/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-indigo-800 ring-1 ring-indigo-500/25 dark:bg-indigo-500/20 dark:text-indigo-100 dark:ring-indigo-400/30">
      {n}
    </span>
  );
}

export function SupportTicketListPanel({
  tickets,
  selectedId,
  onSelect,
  onNewTicket,
  loading,
  searchQuery,
  onSearchChange,
}: {
  tickets: SupportTicketListRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewTicket: () => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}) {
  const unreadCtx = useSupportUnread();
  const isLgDown = useIsLgDown();

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-b border-[var(--card-border)] bg-[var(--background)] lg:border-b-0 lg:border-r">
      <div className="shrink-0 space-y-3 border-b border-[var(--card-border)] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:space-y-0 lg:pt-3">
        {isLgDown ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <AppLogoInline />
              {unreadCtx ? (
                <button
                  type="button"
                  onClick={() => unreadCtx.setSoundEnabled(!unreadCtx.soundEnabled)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                    unreadCtx.soundEnabled
                      ? 'border-indigo-200 bg-indigo-500/10 text-indigo-800 dark:border-indigo-500/30 dark:text-indigo-200'
                      : 'border-slate-200 bg-slate-500/5 text-slate-500 dark:border-slate-600 dark:text-slate-400'
                  )}
                  aria-pressed={unreadCtx.soundEnabled}
                  title={unreadCtx.soundEnabled ? 'Mute new message sound' : 'Play sound for new messages'}
                >
                  {unreadCtx.soundEnabled ? (
                    <Volume2 className="h-3.5 w-3.5" strokeWidth={2} />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                </button>
              ) : null}
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              All Tickets
            </Link>
            <label className="sr-only" htmlFor="support-ticket-search">
              Search tickets
            </label>
            <input
              id="support-ticket-search"
              type="search"
              placeholder="Search tickets…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm shadow-sm"
            />
          </div>
        ) : null}

        {!isLgDown ? (
          <div>
          <div className="flex items-center justify-between gap-2 px-1 pb-2 pt-1">
            <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">All Tickets</h1>
            {unreadCtx ? (
              <button
                type="button"
                onClick={() => unreadCtx.setSoundEnabled(!unreadCtx.soundEnabled)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                  unreadCtx.soundEnabled
                    ? 'border-indigo-200 bg-indigo-500/10 text-indigo-800 dark:border-indigo-500/30 dark:text-indigo-200'
                    : 'border-slate-200 bg-slate-500/5 text-slate-500 dark:border-slate-600 dark:text-slate-400'
                )}
                aria-pressed={unreadCtx.soundEnabled}
                title={unreadCtx.soundEnabled ? 'Mute new message sound' : 'Play sound for new messages'}
              >
                {unreadCtx.soundEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" strokeWidth={2} />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                <span className="hidden sm:inline">Sound</span>
              </button>
            ) : null}
          </div>
          <label className="sr-only" htmlFor="support-ticket-search-desktop">
            Search tickets
          </label>
          <input
            id="support-ticket-search-desktop"
            type="search"
            placeholder="Search tickets…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="mb-3 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={onNewTicket}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            New ticket
          </button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading && tickets.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            No conversations yet. Create a ticket and our team will reply here.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--card-border)]">
            {tickets.map((t) => {
              const active = t.id === selectedId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    className={cn(
                      'flex w-full flex-col gap-1 px-4 py-3.5 text-left transition-colors',
                      active
                        ? 'bg-indigo-500/[0.08] dark:bg-indigo-400/10'
                        : 'hover:bg-slate-500/[0.04] dark:hover:bg-white/[0.03]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-slate-900 dark:text-white">
                            {t.subject}
                          </span>
                          <TicketUnreadBadge count={t.unread_count ?? 0} />
                        </span>
                        {t.ticket_number != null ? (
                          <span className="mt-0.5 block text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                            #{formatSupportTicketRef(t.ticket_number)}
                          </span>
                        ) : null}
                      </span>
                      <time
                        className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500"
                        dateTime={t.last_message_at}
                      >
                        {shortRelativeTime(t.last_message_at)}
                      </time>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          statusBadgeClass(t.status)
                        )}
                      >
                        {labelSupportTicketStatus(t.status)}
                      </span>
                    </div>
                    {t.last_message_preview ? (
                      <p className="line-clamp-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
                        {t.last_message_preview}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
