'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AdminHeaderAlertsAndMessages } from '@/components/admin/AdminHeaderAlertsAndMessages';
import { cn } from '@/lib/utils/cn';
import type { AdminRole } from '@/lib/admin/auth';
import { ADMIN_NAV, getAdminNavMeta } from '@/lib/admin/nav-config';
import { useAdminSupportUnread } from '@/contexts/AdminSupportUnreadContext';
import { ZenzexLogoMark } from '@/components/branding/AppLogoInline';

function roleLabel(role: AdminRole): string {
  return role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Support';
}

function initials(name: string, email: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const SIGN_OUT_HREF = '/api/auth/signout';

export function AdminShell({
  children,
  userName,
  userEmail,
  avatarUrl,
  adminRole,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  adminRole: AdminRole;
}) {
  const pathname = usePathname() ?? '/admin';
  const supportUnread = useAdminSupportUnread();
  const { title: pageTitle, description: pageDescription, breadcrumb: breadcrumbItems } = getAdminNavMeta(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [menuOpen]);

  const monogram = initials(userName, userEmail);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-800/60 bg-zinc-950 text-zinc-400">
        <div className="flex h-14 items-center border-b border-zinc-800/80 px-4">
          <Link href="/admin" className="inline-flex items-center gap-2.5 leading-tight">
            <ZenzexLogoMark className="h-8 w-8 shrink-0" />
            <span className="inline-flex flex-col">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Zenzex</span>
              <span className="text-sm font-semibold text-zinc-100">Admin</span>
            </span>
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/admin'
                ? pathname === '/admin' || pathname === '/admin/'
                : pathname === item.href || pathname.startsWith(item.href + '/');
            const supportCount =
              item.href === '/admin/support' && supportUnread && supportUnread.totalUnread > 0
                ? supportUnread.totalUnread
                : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-zinc-800/90 text-white shadow-sm'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{item.label}</span>
                  {supportCount > 0 ? (
                    <span
                      className="inline-flex min-w-[1.25rem] shrink-0 justify-center rounded-md bg-rose-600/90 px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums text-white"
                      aria-label={`${supportCount} unread support messages`}
                    >
                      {supportCount > 99 ? '99+' : supportCount}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-800/80 p-3">
          <div className="flex items-center gap-2 rounded-md bg-zinc-900/80 px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs font-semibold text-zinc-200">
              {monogram}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-zinc-200">{userName}</p>
              <p className="truncate text-[10px] text-zinc-500">{roleLabel(adminRole)}</p>
            </div>
          </div>
          <p className="mt-2 px-1 text-[10px] leading-snug text-zinc-600">
            Profile and sign out are in the header (top right).
          </p>
        </div>
      </aside>

      <div className="pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-zinc-200/90 bg-white/95 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:px-8">
          <div className="min-w-0 flex-1">
            <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-500" aria-label="Breadcrumb">
              {(breadcrumbItems ?? [{ label: 'Admin', href: '/admin' }, { label: pageTitle }]).map((item, idx, arr) => (
                <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
                  {idx > 0 ? <span className="text-zinc-300 dark:text-zinc-600">/</span> : null}
                  {item.href ? (
                    <Link href={item.href} className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300">
                      {item.label}
                    </Link>
                  ) : (
                    <span className={idx === arr.length - 1 ? 'font-medium text-zinc-700 dark:text-zinc-300' : ''}>{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{pageTitle}</h1>
            {pageDescription ? (
              <p className="hidden text-xs text-zinc-500 dark:text-zinc-500 sm:block sm:truncate">{pageDescription}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                readOnly
                placeholder="Search accounts, users…"
                className="h-9 w-56 rounded-md border border-zinc-200 bg-zinc-50/80 pl-8 pr-3 text-xs text-zinc-500 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-500"
                aria-disabled="true"
                title="Global search coming soon"
              />
            </div>
            <AdminHeaderAlertsAndMessages />

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white py-1 pl-1 pr-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                aria-expanded={menuOpen}
                aria-haspopup="true"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {monogram}
                  </span>
                )}
                <span className="hidden max-w-[8rem] truncate text-sm font-medium text-zinc-700 dark:text-zinc-200 lg:block">
                  {userName}
                </span>
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                  role="menu"
                >
                  <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{userName}</p>
                    <p className="truncate text-xs text-zinc-500">{userEmail}</p>
                    <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">{roleLabel(adminRole)}</p>
                  </div>
                  <Link
                    href="/admin/profile"
                    className={cn(
                      'block px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800',
                      pathname === '/admin/profile' || pathname.startsWith('/admin/profile/') ? 'bg-zinc-50 dark:bg-zinc-800/80' : ''
                    )}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    href="/admin/security"
                    className={cn(
                      'block px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800',
                      pathname === '/admin/security' || pathname.startsWith('/admin/security/')
                        ? 'bg-zinc-50 dark:bg-zinc-800/80'
                        : ''
                    )}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    Security
                  </Link>
                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                  <a
                    href={SIGN_OUT_HREF}
                    className="block px-3 py-2 text-sm text-red-600 hover:bg-zinc-50 dark:text-red-400 dark:hover:bg-zinc-800"
                    role="menuitem"
                  >
                    Sign out
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-3.5rem)] p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
