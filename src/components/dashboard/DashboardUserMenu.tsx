'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronDown, LogOut, Settings, User } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { cn } from '@/lib/utils/cn';
import {
  useDashboardAccess,
  useDashboardOnboardingRouting,
  useDashboardSetupProgress,
} from '@/contexts/DashboardAccessContext';
import { setupNeedsAttention } from '@/lib/onboarding/setup-progress';
import { SetupProgressMini } from '@/components/dashboard/SetupProgressMini';
import { clearAssistantLocalDeviceCache } from '@/lib/assistant/conversation-storage';

function initialsFromUser(user: SupabaseUser, profileFullName: string | null | undefined) {
  const profile = String(profileFullName ?? '').trim();
  if (profile) {
    const parts = profile.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase().slice(0, 2);
  }
  const meta = user.user_metadata as { full_name?: string } | undefined;
  const name = meta?.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase().slice(0, 2);
  }
  const email = user.email ?? '?';
  return email.slice(0, 2).toUpperCase();
}

export function DashboardUserMenu({
  user,
  profileFullName,
}: {
  user: SupabaseUser;
  profileFullName?: string | null;
}) {
  const access = useDashboardAccess();
  const setupProgress = useDashboardSetupProgress();
  const { isOnboardingComplete: onboardingDone, onboardingResumeStep: resumeStep } =
    useDashboardOnboardingRouting();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const initials = initialsFromUser(user, profileFullName);
  const profileIncomplete = !setupProgress.profileComplete;
  const showAttentionDot =
    profileIncomplete ||
    (access.manageSettings &&
      setupProgress.currencyComplete &&
      !setupProgress.businessProfileComplete);

  const profileHref = onboardingDone
    ? `/settings?section=profile${profileIncomplete ? '&focus=full_name' : ''}`
    : `/onboarding?step=${resumeStep}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--card)] py-1 pl-1 pr-2 shadow-sm transition-colors hover:border-indigo-300/60 hover:shadow-md dark:hover:border-indigo-500/30'
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          !onboardingDone
            ? 'Account menu — continue setup'
            : profileIncomplete
              ? 'Account menu — complete your profile'
              : 'Account menu'
        }
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white shadow-inner">
          {initials}
          {showAttentionDot ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-amber-500 dark:border-[var(--sidebar)]"
              aria-hidden
            />
          ) : null}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(14rem,calc(100vw-1.25rem))] rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg shadow-slate-900/10 dark:shadow-black/50"
          role="menu"
        >
          <div className="border-b border-[var(--card-border)] px-3 py-2">
            <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">Signed in</p>
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{user.email}</p>
          </div>
          <Link
            href={profileHref}
            className="flex flex-col gap-0.5 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="flex items-center gap-2 font-medium">
              <User className="h-4 w-4 shrink-0 text-indigo-500" />
              Profile
              {profileIncomplete ? (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                  <AlertCircle className="h-3 w-3" aria-hidden />
                  Add name
                </span>
              ) : null}
            </span>
            {!onboardingDone ? (
              <span className="pl-6 text-xs text-slate-600 dark:text-slate-400">
                Finish setup — same forms you&apos;ll use later in Settings
              </span>
            ) : profileIncomplete ? (
              <span className="pl-6 text-xs text-amber-800 dark:text-amber-200/90">
                Settings → Profile
              </span>
            ) : null}
          </Link>
          {onboardingDone ? (
            <Link
              href="/settings"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <Settings className="h-4 w-4 shrink-0 text-indigo-500" />
              Settings
            </Link>
          ) : null}
          {onboardingDone && setupNeedsAttention(setupProgress) ? (
            <>
              <div className="px-1">
                <SetupProgressMini progress={setupProgress} />
              </div>
              <Link
                href={`/onboarding?step=${resumeStep}`}
                className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:bg-slate-500/[0.06] dark:text-slate-400 dark:hover:bg-slate-400/10"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Guided setup wizard
              </Link>
            </>
          ) : null}
          <a
            href="/api/auth/signout"
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-red-500/[0.06] dark:text-slate-200 dark:hover:bg-red-500/10"
            role="menuitem"
            onClick={() => {
              clearAssistantLocalDeviceCache();
            }}
          >
            <LogOut className="h-4 w-4 text-slate-500" />
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}
