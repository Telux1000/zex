'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import type { DashboardNavItem } from '@/components/dashboard/dashboard-nav';
import { isNavActive, markAssistantNavClickForDevTiming } from '@/components/dashboard/dashboard-nav';
import { useSupportUnread } from '@/contexts/SupportUnreadContext';
import { cn } from '@/lib/utils/cn';
import { ZenzexLogoMark } from '@/components/branding/AppLogoInline';

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const n = count > 99 ? '99+' : String(count);
  return (
    <span className="ml-auto flex min-w-[1.125rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white dark:bg-indigo-500">
      {n}
    </span>
  );
}

export function DashboardSidebar({
  businessName,
  navItems,
  mobileOpen,
  onMobileClose,
  supportHref,
}: {
  businessName: string | null;
  navItems: DashboardNavItem[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  /** When set, shows unread count from SupportUnreadProvider for this nav href. */
  supportHref?: string;
}) {
  const pathname = usePathname() ?? '';
  const supportUnread = useSupportUnread();
  const supportBadge =
    supportHref && supportUnread && navItems.some((i) => i.href === supportHref)
      ? supportUnread.totalUnread
      : 0;
  const billingHref = navItems.some((item) => item.href === '/dashboard/billing')
    ? '/dashboard/billing'
    : '/settings';

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-[100dvh] w-[min(280px,92vw)] shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] shadow-xl shadow-slate-900/10 transition-transform duration-200 ease-out dark:shadow-black/40',
        'lg:w-[260px] lg:shadow-none',
        '-translate-x-full lg:translate-x-0',
        mobileOpen && 'translate-x-0'
      )}
      aria-hidden={!mobileOpen ? undefined : false}
    >
      <div className="flex h-16 items-center gap-3 border-b border-[var(--sidebar-border)] px-4 sm:px-5">
        <Link
          href="/dashboard"
          className="flex h-10 w-10 shrink-0 items-center justify-center"
          aria-label="Zenzex home"
        >
          <ZenzexLogoMark className="h-10 w-10" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">Zenzex</p>
          {businessName && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{businessName}</p>
          )}
        </div>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] text-slate-600 transition-colors hover:bg-slate-500/[0.08] lg:hidden dark:text-slate-300"
          aria-label="Close menu"
          onClick={() => onMobileClose?.()}
        >
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-3 pb-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => markAssistantNavClickForDevTiming(href)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.99]',
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
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="truncate">{label}</span>
                {supportHref && href === supportHref ? <NavBadge count={supportBadge} /> : null}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--sidebar-border)] p-3">
        <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 dark:border-indigo-500/20 dark:from-indigo-950/40 dark:to-violet-950/30">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Upgrade Plan</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Go Premium</p>
          <Link
            href={billingHref}
            className="mt-3 flex w-full items-center justify-center rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            View plans
          </Link>
        </div>
      </div>
    </aside>
  );
}
