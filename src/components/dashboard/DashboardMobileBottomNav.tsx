'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { DashboardCreateAction, DashboardNavItem } from '@/components/dashboard/dashboard-nav';
import {
  isMoreMenuActive,
  isNavActive,
  markAssistantNavClickForDevTiming,
  mobileMoreFromNavItems,
  mobilePrimaryFromNavItems,
} from '@/components/dashboard/dashboard-nav';
import { cn } from '@/lib/utils/cn';
import { useSupportUnread } from '@/contexts/SupportUnreadContext';

const CREATE_HREF = '/dashboard/create';

function MobileNavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const n = count > 99 ? '99+' : String(count);
  return (
    <span className="ml-auto flex min-w-[1.125rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white dark:bg-indigo-500">
      {n}
    </span>
  );
}

export function DashboardMobileBottomNav({
  navItems,
  createActions,
  showCreateHub,
  supportHref = '/dashboard/support',
}: {
  navItems: DashboardNavItem[];
  createActions: DashboardCreateAction[];
  showCreateHub: boolean;
  /** Unread badge for Support when in the “More” sheet. */
  supportHref?: string;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const primaryItems = useMemo(() => mobilePrimaryFromNavItems(navItems), [navItems]);
  const moreItems = useMemo(() => mobileMoreFromNavItems(navItems), [navItems]);
  const supportUnread = useSupportUnread();
  const supportBadge =
    supportHref && moreItems.some((i) => i.href === supportHref) ? (supportUnread?.totalUnread ?? 0) : 0;

  const createActive = isNavActive(pathname, CREATE_HREF);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    moreItems.forEach(({ href }) => router.prefetch(href));
  }, [moreOpen, moreItems, router]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const closeSheets = useCallback(() => {
    setMoreOpen(false);
  }, []);

  const toggleMore = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMoreOpen((v) => !v);
  }, []);

  const moreActive = isMoreMenuActive(pathname, moreItems);

  const sheet = (title: string, children: React.ReactNode) => (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[58] bg-slate-950/40 backdrop-blur-[2px] md:hidden"
        aria-label="Close menu"
        onClick={closeSheets}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[60] max-h-[min(70vh,28rem)] overflow-y-auto rounded-t-2xl border border-slate-200 bg-[var(--sidebar)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl dark:border-slate-700 md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-slate-600" />
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </p>
        {children}
      </div>
    </>
  );

  const leftPrimary = primaryItems.slice(0, 2);
  const rightPrimary = primaryItems.slice(2, 3);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[35] border-t border-[var(--sidebar-border)] bg-[var(--sidebar)]/98 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur-md dark:shadow-black/20 md:hidden"
        aria-label="Mobile navigation"
      >
        <div className="relative mx-auto flex max-w-lg items-end justify-between gap-0.5 px-1">
          {leftPrimary.map(({ href, label, icon: Icon }) => {
            const active = isNavActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => markAssistantNavClickForDevTiming(href)}
                className={cn(
                  'flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-end gap-0.5 px-0.5 pb-0.5 pt-1 text-[10px] font-medium transition-colors active:scale-[0.98]',
                  active
                    ? 'text-indigo-700 dark:text-indigo-200'
                    : 'text-slate-600 dark:text-slate-400'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                    active
                      ? 'border-indigo-300/50 bg-white text-indigo-600 dark:border-indigo-500/30 dark:bg-slate-800/80 dark:text-indigo-300'
                      : 'border-[var(--card-border)] bg-[var(--card)] text-slate-500 dark:bg-slate-900/40'
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            );
          })}

          <div className="relative flex w-[4.25rem] shrink-0 flex-col items-center">
            {showCreateHub ? (
              <Link
                href={CREATE_HREF}
                className={cn(
                  'relative z-[2] -mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-indigo-400/40 bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/25 transition-transform active:scale-95 dark:border-indigo-500/30 dark:shadow-indigo-950/40',
                  createActive && 'ring-2 ring-indigo-400/50 dark:ring-indigo-400/40'
                )}
                aria-label="Create"
                aria-current={createActive ? 'page' : undefined}
              >
                <Plus className="h-7 w-7" strokeWidth={2} />
              </Link>
            ) : (
              <div className="relative z-[2] -mt-4 h-10 w-10 shrink-0" aria-hidden />
            )}
            {showCreateHub && (
              <span
                className={cn(
                  'mt-0.5 text-[10px] font-medium',
                  createActive ? 'text-indigo-700 dark:text-indigo-200' : 'text-slate-600 dark:text-slate-400'
                )}
              >
                Create
              </span>
            )}
          </div>

          {rightPrimary.map(({ href, label, icon: Icon }) => {
            const active = isNavActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => markAssistantNavClickForDevTiming(href)}
                className={cn(
                  'flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-end gap-0.5 px-0.5 pb-0.5 pt-1 text-[10px] font-medium transition-colors active:scale-[0.98]',
                  active
                    ? 'text-indigo-700 dark:text-indigo-200'
                    : 'text-slate-600 dark:text-slate-400'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                    active
                      ? 'border-indigo-300/50 bg-white text-indigo-600 dark:border-indigo-500/30 dark:bg-slate-800/80 dark:text-indigo-300'
                      : 'border-[var(--card-border)] bg-[var(--card)] text-slate-500 dark:bg-slate-900/40'
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={toggleMore}
            className={cn(
              'flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-end gap-0.5 px-0.5 pb-0.5 pt-1 text-[10px] font-medium transition-colors active:scale-[0.98]',
              moreActive || moreOpen
                ? 'text-indigo-700 dark:text-indigo-200'
                : 'text-slate-600 dark:text-slate-400'
            )}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                  moreActive || moreOpen
                    ? 'border-indigo-300/50 bg-white text-indigo-600 dark:border-indigo-500/30 dark:bg-slate-800/80 dark:text-indigo-300'
                    : 'border-[var(--card-border)] bg-[var(--card)] text-slate-500 dark:bg-slate-900/40'
                )}
              >
                <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              {supportBadge > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-indigo-600 ring-2 ring-[var(--sidebar)] dark:bg-indigo-400" />
              ) : null}
            </span>
            <span className="max-w-full truncate">More</span>
          </button>
        </div>
      </nav>

      {mounted &&
        typeof document !== 'undefined' &&
        moreOpen &&
        createPortal(
          sheet(
            'More',
            <ul className="space-y-0.5 pb-2">
              {moreItems.map(({ href, label, icon: Icon }) => {
                const active = isNavActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => {
                        markAssistantNavClickForDevTiming(href);
                        closeSheets();
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors active:scale-[0.99]',
                        active
                          ? 'bg-indigo-500/[0.12] text-indigo-700 shadow-sm dark:bg-indigo-400/15 dark:text-indigo-200'
                          : 'text-slate-600 hover:bg-slate-500/[0.06] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                          active
                            ? 'border-indigo-300/50 bg-white text-indigo-600 dark:border-indigo-500/30 dark:bg-slate-800/80 dark:text-indigo-300'
                            : 'border-[var(--card-border)] bg-[var(--card)] text-slate-500 dark:bg-slate-900/40'
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </span>
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span>{label}</span>
                        {supportHref && href === supportHref ? <MobileNavBadge count={supportBadge} /> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
              {createActions
                .filter((a) => a.href !== CREATE_HREF)
                .map(({ href, label, icon: Icon }) => {
                  const active = isNavActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={closeSheets}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors active:scale-[0.99]',
                          active
                            ? 'bg-indigo-500/[0.12] text-indigo-700 shadow-sm dark:bg-indigo-400/15 dark:text-indigo-200'
                            : 'text-slate-600 hover:bg-slate-500/[0.06] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                            active
                              ? 'border-indigo-300/50 bg-white text-indigo-600 dark:border-indigo-500/30 dark:bg-slate-800/80 dark:text-indigo-300'
                              : 'border-[var(--card-border)] bg-[var(--card)] text-slate-500 dark:bg-slate-900/40'
                          )}
                        >
                          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                        </span>
                        {label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          ),
          document.body
        )}
    </>
  );
}
