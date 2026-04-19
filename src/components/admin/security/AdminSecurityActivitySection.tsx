'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';
import { adminAuditTargetDescription } from '@/lib/admin/admin-audit-target-display';
import { SECURITY_ACTIVITY_CATEGORIES, type SecurityActivityCategory } from '@/lib/admin/security-activity-filters';
import type { AuditRowDTO, LoginSnapshotRow } from '@/components/admin/security/types';
import { cn } from '@/lib/utils/cn';

const CATEGORY_LABEL: Record<SecurityActivityCategory, string> = {
  all: 'All events',
  access: 'Access & roles',
  invites: 'Invites',
  accounts: 'Subscriber accounts',
  subscriber_users: 'Subscriber users',
  password: 'Password resets',
  policies: 'Policies',
  views: 'Admin views',
};

function roleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === 'owner') return 'Owner';
  if (r === 'admin') return 'Admin';
  if (r === 'support') return 'Support';
  return role;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AdminSecurityActivitySection({
  initialCategory,
  loginSnapshot,
}: {
  initialCategory: string;
  loginSnapshot: LoginSnapshotRow[];
}) {
  const [category, setCategory] = useState<string>(
    SECURITY_ACTIVITY_CATEGORIES.includes(initialCategory as SecurityActivityCategory) ? initialCategory : 'all'
  );
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounced(searchInput, 350);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<AuditRowDTO[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginFilter, setLoginFilter] = useState('');

  useEffect(() => {
    setCategory(
      SECURITY_ACTIVITY_CATEGORIES.includes(initialCategory as SecurityActivityCategory) ? initialCategory : 'all'
    );
  }, [initialCategory]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '50',
        category,
      });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/admin/security/activity?${params.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        logs?: AuditRowDTO[];
        totalPages?: number;
        total?: number;
      };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load activity');
      setLogs(json.logs ?? []);
      setTotalPages(Math.max(1, Number(json.totalPages ?? 1)));
      setTotal(Number(json.total ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, category, debouncedSearch]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const filteredLogin = loginSnapshot.filter((r) => {
    if (!loginFilter.trim()) return true;
    const q = loginFilter.toLowerCase();
    return (r.email ?? '').toLowerCase().includes(q) || r.user_id.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Activity & audit</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Immutable admin audit log with filters. Read-only — sensitive changes are recorded automatically.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Audit log</h3>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {SECURITY_ACTIVITY_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setPage(1);
                  setCategory(c);
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  category === c
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-600'
                )}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search action, actor, target, metadata…"
            value={searchInput}
            onChange={(e) => {
              setPage(1);
              setSearchInput(e.target.value);
            }}
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
        </div>

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {loading ? <p className="text-sm text-zinc-500">Loading events…</p> : null}

        <AdminTable>
          <AdminTableHead>
            <AdminTh>When</AdminTh>
            <AdminTh>Actor</AdminTh>
            <AdminTh>Action</AdminTh>
            <AdminTh>Target</AdminTh>
          </AdminTableHead>
          <tbody>
            {!loading && logs.length === 0 ? (
              <AdminTr>
                <AdminTd colSpan={4} className="py-8 text-center text-sm text-zinc-500">
                  No audit rows for this filter.
                </AdminTd>
              </AdminTr>
            ) : (
              logs.map((r) => (
                <AdminTr key={r.id}>
                  <AdminTd className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {new Date(r.created_at).toLocaleString()}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {r.actor_display ?? `${r.actor_user_id.slice(0, 8)}…`}
                      </span>
                      <AdminBadge tone="neutral">{roleLabel(r.actor_role)}</AdminBadge>
                    </div>
                  </AdminTd>
                  <AdminTd className="text-sm text-zinc-800 dark:text-zinc-200">
                    {r.action_label ?? r.action}
                  </AdminTd>
                  <AdminTd className="max-w-[min(100vw,28rem)] break-words text-xs text-zinc-600 dark:text-zinc-400">
                    {r.target_display ?? adminAuditTargetDescription(r)}
                  </AdminTd>
                </AdminTr>
              ))
            )}
          </tbody>
        </AdminTable>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>
            Page {page} of {totalPages} · {total} events
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-zinc-200 px-2 py-1 font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-zinc-200 px-2 py-1 font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Internal staff sign-in snapshot</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Latest Auth session metadata for internal operators (not a substitute for centralized auth logs).
        </p>
        <input
          type="search"
          placeholder="Filter by email or user id…"
          value={loginFilter}
          onChange={(e) => setLoginFilter(e.target.value)}
          className="w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <AdminTable>
          <AdminTableHead>
            <AdminTh>User id</AdminTh>
            <AdminTh>Email</AdminTh>
            <AdminTh>Last sign-in</AdminTh>
            <AdminTh>Status</AdminTh>
          </AdminTableHead>
          <tbody>
            {filteredLogin.length === 0 ? (
              <AdminTr>
                <AdminTd colSpan={4} className="py-6 text-center text-sm text-zinc-500">
                  No rows.
                </AdminTd>
              </AdminTr>
            ) : (
              filteredLogin.map((r) => (
                <AdminTr key={r.user_id}>
                  <AdminTd className="font-mono text-xs">{r.user_id}</AdminTd>
                  <AdminTd>{r.email ?? '—'}</AdminTd>
                  <AdminTd className="text-zinc-600 dark:text-zinc-400">
                    {r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleString() : '—'}
                  </AdminTd>
                  <AdminTd>
                    {r.suspended ? (
                      <AdminBadge tone="suspended">Suspended</AdminBadge>
                    ) : (
                      <AdminBadge tone="active">Active</AdminBadge>
                    )}
                  </AdminTd>
                </AdminTr>
              ))
            )}
          </tbody>
        </AdminTable>
      </section>
    </div>
  );
}
