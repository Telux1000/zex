'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  status: 'active' | 'archived' | 'anonymized';
  created_at: string;
  last_activity_at: string | null;
};

type CustomersResponse = {
  account_id: string;
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  customers: CustomerRow[];
  error?: string;
};

function statusTone(status: CustomerRow['status']): 'active' | 'pending' | 'suspended' {
  if (status === 'active') return 'active';
  return 'suspended';
}

function statusLabel(status: CustomerRow['status']): string {
  if (status === 'anonymized') return 'Anonymized';
  if (status === 'archived') return 'Archived';
  return 'Active';
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function AdminAccountCustomersSection({ accountId }: { accountId: string }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        sort: 'created_at_desc',
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/accounts/${accountId}/customers?${params.toString()}`);
      const data = (await res.json()) as CustomersResponse;
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to load customers.');
      }
      setRows(data.customers ?? []);
      setTotalCount(Number(data.total_count ?? 0));
      setTotalPages(Math.max(1, Number(data.total_pages ?? 1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers.');
      setRows([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [accountId, page, pageSize, search]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const emptyMessage = useMemo(() => {
    if (search) return 'No matching customers found.';
    return 'No customers found for this account yet.';
  }, [search]);

  return (
    <AdminContentCard>
      <div className="flex flex-col gap-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Customers</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Account-scoped customer records and operational status.
          </p>
        </div>
        <div className="flex min-w-[220px] flex-col gap-2 sm:min-w-[260px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email…"
              className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              aria-label="Search customers"
            />
          </div>
          <p className="text-xs text-zinc-500">
            {totalCount.toLocaleString()} customer{totalCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2 py-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" aria-hidden />
            ))}
            <p className="text-center text-xs text-zinc-500">Loading customers…</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">{emptyMessage}</p>
        ) : (
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Created At</AdminTh>
              <AdminTh>Last Activity</AdminTh>
              <AdminTh className="text-right">Open</AdminTh>
            </AdminTableHead>
            <tbody>
              {rows.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd className="font-medium text-zinc-900 dark:text-zinc-100">{row.name}</AdminTd>
                  <AdminTd>{row.email ?? '—'}</AdminTd>
                  <AdminTd>
                    <AdminBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</AdminBadge>
                  </AdminTd>
                  <AdminTd className="text-zinc-600 dark:text-zinc-400">{formatDateTime(row.created_at)}</AdminTd>
                  <AdminTd className="text-zinc-600 dark:text-zinc-400">
                    {formatDateTime(row.last_activity_at)}
                  </AdminTd>
                  <AdminTd className="text-right">
                    <Link
                      href={`/dashboard/customers/${row.id}`}
                      className="text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                    >
                      Open
                    </Link>
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </div>

      {!loading && rows.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            Rows
            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number.parseInt(e.target.value, 10) || 25);
                setPage(1);
              }}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Previous
            </button>
            <span className="text-xs text-zinc-500">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </AdminContentCard>
  );
}
