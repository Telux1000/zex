'use client';

import Link from 'next/link';
import { Activity, Bell, Menu, MessageSquare } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useMemo, useState } from 'react';
import { DashboardSearch } from '@/components/dashboard/DashboardSearch';
import { ThemeModeSegmented } from '@/components/theme/ThemeModeSegmented';
import { DashboardUserMenu } from '@/components/dashboard/DashboardUserMenu';
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';
import { useDashboardNotifications } from '@/contexts/DashboardNotificationsContext';
import { useSupportUnread } from '@/contexts/SupportUnreadContext';
import { ZenzexLogoMark } from '@/components/branding/AppLogoInline';

export function DashboardTopBar({
  user,
  businessName,
  profileFullName,
  showMessagesInbox = false,
  onMenuClick,
}: {
  user: User;
  businessName?: string | null;
  profileFullName?: string | null;
  /** When true, show messages icon linking to full-screen support inbox. */
  showMessagesInbox?: boolean;
  onMenuClick?: () => void;
}) {
  const companyLabel = businessName?.trim() || 'Zenzex';

  const supportUnread = useSupportUnread();
  const { unreadActionableCount } = useDashboardNotifications();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifMobileSheet, setNotifMobileSheet] = useState(false);

  const messageUnread = showMessagesInbox ? supportUnread?.totalUnread ?? 0 : 0;

  const messageBadge = useMemo(() => {
    if (!showMessagesInbox || messageUnread <= 0) return null;
    return messageUnread > 99 ? '99+' : String(messageUnread);
  }, [showMessagesInbox, messageUnread]);

  const notifBadge = useMemo(() => {
    if (unreadActionableCount <= 0) return null;
    return unreadActionableCount > 99 ? '99+' : String(unreadActionableCount);
  }, [unreadActionableCount]);

  function openNotificationsPanel() {
    setNotifMobileSheet(typeof window !== 'undefined' && window.innerWidth < 640);
    setNotifOpen(true);
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--sidebar-border)] bg-[var(--sidebar)]/95 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md sm:min-h-16 sm:gap-3 sm:px-4 md:justify-start md:gap-4 md:px-6 dark:bg-[var(--sidebar)]/90">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 md:hidden">
        <Link
          href="/dashboard"
          className="flex h-9 w-9 shrink-0 items-center justify-center"
          aria-label="Zenzex home"
        >
          <ZenzexLogoMark className="h-9 w-9" />
        </Link>
        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{companyLabel}</span>
      </div>

      <button
        type="button"
        onClick={onMenuClick}
        className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-slate-600 shadow-sm transition-colors hover:border-indigo-300/40 hover:bg-indigo-500/[0.06] hover:text-indigo-600 md:flex lg:hidden dark:text-slate-300 dark:hover:text-indigo-300"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </button>

      <div className="hidden min-w-0 flex-1 md:flex">
        <DashboardSearch />
      </div>

      <div className="flex shrink-0 items-center gap-0 max-[360px]:gap-0 md:ml-auto">
        {showMessagesInbox ? (
          <Link
            href="/dashboard/support"
            className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-colors hover:border-[var(--card-border)] hover:bg-indigo-500/[0.06] hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
            aria-label="Open support inbox"
            title="Support inbox"
          >
            <MessageSquare className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
            {messageBadge ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] max-w-[2rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white dark:bg-indigo-500">
                {messageBadge}
              </span>
            ) : null}
          </Link>
        ) : null}

        <button
          type="button"
          className="relative h-10 w-10 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-colors hover:border-[var(--card-border)] hover:bg-indigo-500/[0.06] hover:text-indigo-600 sm:flex dark:text-slate-400 dark:hover:text-indigo-300"
          aria-label="System notifications"
          onClick={openNotificationsPanel}
        >
          <Bell className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
          {notifBadge ? (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] max-w-[2rem] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none text-white dark:bg-violet-500">
              {notifBadge}
            </span>
          ) : null}
        </button>

        <Link
          href="/dashboard/activity"
          className="hidden h-10 w-10 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-colors hover:border-[var(--card-border)] hover:bg-indigo-500/[0.06] hover:text-indigo-600 sm:flex dark:text-slate-400 dark:hover:text-indigo-300"
          aria-label="Activity"
        >
          <Activity className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
        </Link>
        <ThemeModeSegmented density="compact" />
        <div className="ml-0.5 pl-0.5 sm:ml-1 sm:pl-1">
          <DashboardUserMenu user={user} profileFullName={profileFullName ?? null} />
        </div>
      </div>

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} mobileSheet={notifMobileSheet} />
    </header>
  );
}
