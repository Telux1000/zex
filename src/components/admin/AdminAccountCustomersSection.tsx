'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';
import { normalizeCountryCode } from '@/lib/location';
import { formatPhoneForUi } from '@/lib/phone/e164';

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

type CustomerDetail = {
  id: string;
  account_id: string;
  name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'archived' | 'anonymized';
  created_at: string;
  last_activity_at: string | null;
  account_number: string | null;
  company: string | null;
  preferred_currency_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  country_code: string | null;
  notes: string | null;
  archived_at: string | null;
  anonymized_at: string | null;
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
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);

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

  const loadCustomerDetail = useCallback(
    async (customerId: string) => {
      setSelectedCustomerId(customerId);
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(`/api/admin/accounts/${accountId}/customers/${customerId}`);
        const data = (await res.json()) as CustomerDetail;
        if (!res.ok) throw new Error(data.error ?? 'Unable to load customer details.');
        setCustomerDetail(data);
      } catch (e) {
        setCustomerDetail(null);
        setDetailError(e instanceof Error ? e.message : 'Unable to load customer details.');
      } finally {
        setDetailLoading(false);
      }
    },
    [accountId]
  );

  const closeDetail = useCallback(() => {
    setSelectedCustomerId(null);
    setDetailError(null);
    setCustomerDetail(null);
    setDetailLoading(false);
  }, []);

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
              <AdminTh className="text-right">View</AdminTh>
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
                    <button
                      type="button"
                      onClick={() => {
                        void loadCustomerDetail(row.id);
                      }}
                      className="text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                    >
                      View
                    </button>
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

      {selectedCustomerId ? (
        <div className="fixed inset-0 z-[90] flex justify-end">
          <button
            type="button"
            onClick={closeDetail}
            className="h-full flex-1 bg-zinc-950/35"
            aria-label="Close customer details"
          />
          <aside
            className="h-full w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
            role="dialog"
            aria-modal="true"
            aria-label="Customer details"
          >
            <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Customer details</h4>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Inspect the full customer record without leaving this account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-5 px-5 py-4">
              {detailLoading ? (
                <div className="space-y-2 py-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                  ))}
                  <p className="text-sm text-zinc-500">Loading customer details…</p>
                </div>
              ) : detailError ? (
                <p
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
                  role="alert"
                >
                  {detailError || 'Unable to load customer details.'}
                </p>
              ) : !customerDetail ? (
                <p className="text-sm text-zinc-500">No additional customer information available.</p>
              ) : (
                <>
                  <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Profile
                    </h5>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Display name</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{customerDetail.name}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Full name</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{customerDetail.full_name || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Email</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{customerDetail.email || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Phone</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">
                          {customerDetail.phone
                            ? formatPhoneForUi(
                                customerDetail.phone,
                                customerDetail.country_code || normalizeCountryCode(customerDetail.country ?? '')
                              )
                            : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Status</dt>
                        <dd className="text-right">
                          <AdminBadge tone={statusTone(customerDetail.status)}>
                            {statusLabel(customerDetail.status)}
                          </AdminBadge>
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Account relationship
                    </h5>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Account ID</dt>
                        <dd className="break-all text-right text-zinc-900 dark:text-zinc-100">
                          {customerDetail.account_id}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Customer account #</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">
                          {customerDetail.account_number || '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Company</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">{customerDetail.company || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Preferred currency</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">
                          {customerDetail.preferred_currency_code || '—'}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Timeline
                    </h5>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Created At</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">
                          {formatDateTime(customerDetail.created_at)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Last Activity</dt>
                        <dd className="text-right text-zinc-900 dark:text-zinc-100">
                          {formatDateTime(customerDetail.last_activity_at)}
                        </dd>
                      </div>
                      {customerDetail.archived_at ? (
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500">Archived At</dt>
                          <dd className="text-right text-zinc-900 dark:text-zinc-100">
                            {formatDateTime(customerDetail.archived_at)}
                          </dd>
                        </div>
                      ) : null}
                      {customerDetail.anonymized_at ? (
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500">Anonymized At</dt>
                          <dd className="text-right text-zinc-900 dark:text-zinc-100">
                            {formatDateTime(customerDetail.anonymized_at)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </section>

                  <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Contact details
                    </h5>
                    <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                      {[
                        customerDetail.address_line1,
                        customerDetail.address_line2,
                        customerDetail.city,
                        customerDetail.state,
                        customerDetail.postal_code,
                        customerDetail.country,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </p>
                  </section>

                  <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Notes
                    </h5>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                      {customerDetail.notes || 'No additional customer information available.'}
                    </p>
                  </section>

                  <div className="flex justify-end">
                    <Link
                      href={`/dashboard/customers/${customerDetail.id}`}
                      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                    >
                      Open full profile
                    </Link>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </AdminContentCard>
  );
}
