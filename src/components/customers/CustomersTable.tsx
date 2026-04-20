'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import type { Customer } from '@/lib/database.types';
import CustomerFormModal from './CustomerFormModal';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { sanitizeReturnToPath } from '@/lib/navigation/safe-return-to';

type CustomerRow = Customer & {
  archived_by_name?: string | null;
  anonymized_by_name?: string | null;
};

type Props = {
  businessId: string;
  companyBaseCurrency: string;
  initialCustomers: CustomerRow[];
  initialTab?: 'active' | 'archived';
  initialView?: 'table' | 'redaction-log';
  openAddOnMount?: boolean;
  returnToAfterCreate?: string | null;
};

type RowMenuState = { customerId: string; top: number; left: number } | null;
type LifecycleAction = 'archive' | 'anonymize' | 'restore';

export default function CustomersTable({
  businessId,
  companyBaseCurrency,
  initialCustomers,
  initialTab = 'active',
  initialView = 'table',
  openAddOnMount = false,
  returnToAfterCreate = null,
}: Props) {
  const router = useRouter();
  const { showErrorToast } = useToasts();
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [view, setView] = useState<'table' | 'redaction-log'>(initialView);
  const [tab, setTab] = useState<'active' | 'archived'>(initialTab);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [hasEmail, setHasEmail] = useState<'all' | 'yes' | 'no'>('all');
  const [searchResult, setSearchResult] = useState<CustomerRow[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenuState>(null);
  const [lifecycleAction, setLifecycleAction] = useState<{
    customerId: string;
    action: LifecycleAction;
    reason: string;
  } | null>(null);
  const [complianceNoteOpen, setComplianceNoteOpen] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  const list = searchResult !== null ? searchResult : customers;
  const scope = view === 'redaction-log' ? 'anonymized' : tab;

  const fetchCustomers = useCallback(
    async (q?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          business_id: businessId,
          scope,
          sort,
          has_email: hasEmail,
        });
        if (q) params.set('q', q);
        const res = await fetch(`/api/customers?${params.toString()}`);
        const data = await res.json();
        if (res.ok) {
          if (q) setSearchResult(data);
          else setCustomers(data);
        }
      } finally {
        setLoading(false);
      }
    },
    [businessId, hasEmail, scope, sort]
  );

  useEffect(() => {
    void fetchCustomers(search || undefined);
  }, [fetchCustomers, search]);

  const openAdd = useCallback(() => {
    setEditingCustomer(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((c: Customer) => {
    setEditingCustomer(c);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingCustomer(null);
  }, []);

  const handleSaved = useCallback(
    async (_customer?: Customer, meta?: { action: 'create' | 'update' }) => {
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      if (meta?.action === 'create' && returnToAfterCreate) {
        const safe = sanitizeReturnToPath(returnToAfterCreate);
        if (safe) {
          router.push(safe);
          router.refresh();
        }
      }
    },
    [fetchCustomers, returnToAfterCreate, router, search]
  );

  const runLifecycle = useCallback(
    async (id: string, action: LifecycleAction, reason?: string) => {
      const path =
        action === 'archive'
          ? 'archive'
          : action === 'restore'
            ? 'restore'
            : 'anonymize';
      const res = await fetch(`/api/customers/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'restore' ? undefined : JSON.stringify({ reason: reason?.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showErrorToast(data.error ?? `Unable to ${action} customer`);
        return false;
      }
      setRowMenu(null);
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      return true;
    },
    [fetchCustomers, search, showErrorToast]
  );

  const submitLifecycleModal = useCallback(async () => {
    if (!lifecycleAction) return;
    const ok = await runLifecycle(
      lifecycleAction.customerId,
      lifecycleAction.action,
      lifecycleAction.reason
    );
    if (ok) setLifecycleAction(null);
  }, [lifecycleAction, runLifecycle]);

  const openRowMenu = useCallback((c: CustomerRow, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = menuButtonRefs.current[c.id];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setRowMenu({ customerId: c.id, top: rect.bottom + 4, left: rect.left });
  }, []);

  useEffect(() => {
    if (!openAddOnMount) return;
    setEditingCustomer(null);
    setModalOpen(true);
  }, [openAddOnMount]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const rowMenuEl = document.getElementById('customer-row-menu');
      const inRowButton = Object.values(menuButtonRefs.current).some((btn) => btn?.contains(target));
      if (rowMenu && rowMenuEl && !rowMenuEl.contains(target) && !inRowButton) {
        setRowMenu(null);
      }
      if (!headerMenuRef.current?.contains(target)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [rowMenu]);

  const rowMenuCustomer = rowMenu ? list.find((c) => c.id === rowMenu.customerId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <input
              id="customer-search"
              type="search"
              placeholder="Search by account number, name, email, or company..."
              value={search}
              onChange={(e) => {
                const v = e.target.value.trim();
                setSearch(v);
                if (!v) setSearchResult(null);
              }}
              className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-slate-900 shadow-sm placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-slate-400"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value === 'oldest' ? 'oldest' : 'newest')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
          <select
            value={hasEmail}
            onChange={(e) =>
              setHasEmail(e.target.value === 'yes' ? 'yes' : e.target.value === 'no' ? 'no' : 'all')
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="all">All emails</option>
            <option value="yes">Has email</option>
            <option value="no">No email</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + Add Customer
          </button>
          <div className="relative" ref={headerMenuRef}>
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
            >
              ...
            </button>
            {headerMenuOpen ? (
              <div className="absolute right-0 z-40 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setView('redaction-log');
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Redaction log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComplianceNoteOpen(true);
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Compliance actions
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'active' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setTab('archived')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'archived' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
          >
            Archived
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          Anonymization is irreversible and removes personal data while preserving billing history.
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold">No customers yet</h3>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Add your first customer to start creating invoices.</p>
        </div>
      ) : (
        <div className="app-table-shell">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead>
                {view === 'redaction-log' ? (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Internal Customer ID</th>
                    <th className="app-th">Stripe Customer ID</th>
                    <th className="app-th">Anonymized At</th>
                    <th className="app-th">Anonymized By</th>
                    <th className="app-th">Status</th>
                  </tr>
                ) : tab === 'archived' ? (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Customer Name</th>
                    <th className="app-th">Email</th>
                    <th className="app-th">Archived At</th>
                    <th className="app-th">Archived By</th>
                    <th className="app-th">Archive Reason</th>
                    <th className="app-th-actions">Actions</th>
                  </tr>
                ) : (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Customer Account</th>
                    <th className="app-th">Company</th>
                    <th className="app-th">Contact Name</th>
                    <th className="app-th hidden md:table-cell">Email</th>
                    <th className="app-th hidden lg:table-cell">Created Date</th>
                    <th className="app-th-actions">Actions</th>
                  </tr>
                )}
              </thead>
              <tbody className="app-tbody">
                {list.map((c) => (
                  <tr key={c.id} className="app-tr-hover">
                    {view === 'redaction-log' ? (
                      <>
                        <td className="app-td-primary font-mono">{c.id}</td>
                        <td className="app-td-secondary">{c.stripe_customer_id ?? '-'}</td>
                        <td className="app-td-secondary">
                          {c.anonymized_at ? format(new Date(c.anonymized_at), 'MMM d, yyyy HH:mm') : '-'}
                        </td>
                        <td className="app-td-secondary">{c.anonymized_by_name ?? c.anonymized_by ?? '-'}</td>
                        <td className="app-td-secondary">Anonymized</td>
                      </>
                    ) : tab === 'archived' ? (
                      <>
                        <td className="app-td-primary">{c.company || c.name || c.account_number || '-'}</td>
                        <td className="app-td-secondary">{c.email ?? '-'}</td>
                        <td className="app-td-secondary">
                          {c.archived_at ? format(new Date(c.archived_at), 'MMM d, yyyy HH:mm') : '-'}
                        </td>
                        <td className="app-td-secondary">{c.archived_by_name ?? c.archived_by ?? '-'}</td>
                        <td className="app-td-secondary">{c.archive_reason ?? '-'}</td>
                        <td className="app-td-actions">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[c.id] = el;
                            }}
                            type="button"
                            onClick={(e) => openRowMenu(c, e)}
                            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ...
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="app-td-primary whitespace-nowrap font-mono">{c.account_number ?? '-'}</td>
                        <td className="app-td-primary">{c.company ?? '-'}</td>
                        <td className="app-td-secondary">{c.name?.trim() || '-'}</td>
                        <td className="app-td-secondary hidden md:table-cell">{c.email ?? '-'}</td>
                        <td className="app-td-secondary hidden lg:table-cell">
                          {c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '-'}
                        </td>
                        <td className="app-td-actions">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[c.id] = el;
                            }}
                            type="button"
                            onClick={(e) => openRowMenu(c, e)}
                            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ...
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading ? <div className="flex items-center justify-center py-8 text-sm text-slate-500">Fetching customers...</div> : null}
        </div>
      )}

      <CustomerFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={handleSaved}
        businessId={businessId}
        companyBaseCurrency={companyBaseCurrency}
        customer={editingCustomer}
      />

      {typeof document !== 'undefined' && rowMenu && rowMenuCustomer
        ? createPortal(
            <div
              id="customer-row-menu"
              role="menu"
              className="fixed z-[100] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              style={{
                top: rowMenu.top,
                left:
                  typeof window !== 'undefined' && rowMenu.left + 192 > window.innerWidth - 16
                    ? window.innerWidth - 208
                    : Math.max(8, rowMenu.left),
              }}
            >
              <Link
                href={`/dashboard/customers/${rowMenuCustomer.id}`}
                role="menuitem"
                onClick={() => setRowMenu(null)}
                className="flex w-full items-center px-4 py-3 text-left text-sm text-indigo-600 hover:bg-indigo-500/[0.06]"
              >
                View customer
              </Link>
              {view === 'table' && tab === 'active' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      openEdit(rowMenuCustomer);
                      setRowMenu(null);
                    }}
                    className="flex w-full items-center px-4 py-3 text-left text-sm hover:bg-indigo-500/[0.06]"
                  >
                    Edit customer
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'archive', reason: '' })}
                    className="flex w-full items-center px-4 py-3 text-left text-sm text-amber-700 hover:bg-amber-50"
                  >
                    Archive customer
                  </button>
                </>
              ) : null}
              {view === 'table' && tab === 'archived' ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'restore', reason: '' })}
                  className="flex w-full items-center px-4 py-3 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                >
                  Restore customer
                </button>
              ) : null}
              {view === 'table' ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'anonymize', reason: '' })}
                  className="flex w-full items-center px-4 py-3 text-left text-sm hover:bg-indigo-500/[0.06]"
                >
                  Anonymize customer data
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}

      {lifecycleAction ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setLifecycleAction(null)} />
          <div className="relative z-[111] w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {lifecycleAction.action === 'archive'
                ? 'Archive customer'
                : lifecycleAction.action === 'restore'
                  ? 'Restore customer'
                  : 'Anonymize customer'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {lifecycleAction.action === 'archive'
                ? 'Archive is reversible. Billing records remain preserved.'
                : lifecycleAction.action === 'restore'
                  ? 'Restore this archived customer to active operational lists.'
                  : 'Anonymization is irreversible and removes personal data while preserving billing history.'}
            </p>
            {lifecycleAction.action !== 'restore' ? (
              <>
                <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="lifecycle-reason">
                  Reason (audit log)
                </label>
                <textarea
                  id="lifecycle-reason"
                  rows={3}
                  value={lifecycleAction.reason}
                  onChange={(e) =>
                    setLifecycleAction((prev) => (prev ? { ...prev, reason: e.target.value } : prev))
                  }
                  placeholder="Optional reason"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLifecycleAction(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLifecycleModal}
                className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${lifecycleAction.action === 'anonymize' ? 'bg-red-600 hover:bg-red-500' : lifecycleAction.action === 'restore' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                {lifecycleAction.action === 'archive'
                  ? 'Archive customer'
                  : lifecycleAction.action === 'restore'
                    ? 'Restore customer'
                    : 'Anonymize permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {complianceNoteOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setComplianceNoteOpen(false)} />
          <div className="relative z-[111] w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Compliance actions</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Archived customers are operational and restorable. Anonymized customers are compliance records and cannot be restored.
              Hard deletion stays blocked whenever financial history exists.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setComplianceNoteOpen(false)}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
'use client';

import type { Customer } from '@/lib/database.types';

type CustomerRow = Customer & {
  archived_by_name?: string | null;
  anonymized_by_name?: string | null;
};

type Props = {
  businessId: string;
  companyBaseCurrency: string;
  initialCustomers: CustomerRow[];
  initialTab?: 'active' | 'archived';
  initialView?: 'table' | 'redaction-log';
  openAddOnMount?: boolean;
  returnToAfterCreate?: string | null;
};

export default function CustomersTable(_props: Props) {
  return <div>Customers table loading...</div>;
}
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import type { Customer } from '@/lib/database.types';
import CustomerFormModal from './CustomerFormModal';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { sanitizeReturnToPath } from '@/lib/navigation/safe-return-to';

type CustomerRow = Customer & {
  archived_by_name?: string | null;
  anonymized_by_name?: string | null;
};

type Props = {
  businessId: string;
  companyBaseCurrency: string;
  initialCustomers: CustomerRow[];
  initialTab?: 'active' | 'archived';
  initialView?: 'table' | 'redaction-log';
  openAddOnMount?: boolean;
  returnToAfterCreate?: string | null;
};

type RowMenuState = { customerId: string; top: number; left: number } | null;
type LifecycleAction = 'archive' | 'anonymize' | 'restore';

export default function CustomersTable({
  businessId,
  companyBaseCurrency,
  initialCustomers,
  initialTab = 'active',
  initialView = 'table',
  openAddOnMount = false,
  returnToAfterCreate = null,
}: Props) {
  const router = useRouter();
  const { showErrorToast } = useToasts();
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [view, setView] = useState<'table' | 'redaction-log'>(initialView);
  const [tab, setTab] = useState<'active' | 'archived'>(initialTab);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [hasEmail, setHasEmail] = useState<'all' | 'yes' | 'no'>('all');
  const [searchResult, setSearchResult] = useState<CustomerRow[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenuState>(null);
  const [lifecycleAction, setLifecycleAction] = useState<{
    customerId: string;
    action: LifecycleAction;
    reason: string;
  } | null>(null);
  const [complianceNoteOpen, setComplianceNoteOpen] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  const list = searchResult !== null ? searchResult : customers;
  const scope = view === 'redaction-log' ? 'anonymized' : tab;

  const fetchCustomers = useCallback(
    async (q?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          business_id: businessId,
          scope,
          sort,
          has_email: hasEmail,
        });
        if (q) params.set('q', q);
        const res = await fetch(`/api/customers?${params.toString()}`);
        const data = await res.json();
        if (res.ok) {
          if (q) setSearchResult(data);
          else setCustomers(data);
        }
      } finally {
        setLoading(false);
      }
    },
    [businessId, hasEmail, scope, sort]
  );

  useEffect(() => {
    void fetchCustomers(search || undefined);
  }, [fetchCustomers, search]);

  const openAdd = useCallback(() => {
    setEditingCustomer(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((c: Customer) => {
    setEditingCustomer(c);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingCustomer(null);
  }, []);

  const handleSaved = useCallback(
    async (_customer?: Customer, meta?: { action: 'create' | 'update' }) => {
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      if (meta?.action === 'create' && returnToAfterCreate) {
        const safe = sanitizeReturnToPath(returnToAfterCreate);
        if (safe) {
          router.push(safe);
          router.refresh();
        }
      }
    },
    [fetchCustomers, returnToAfterCreate, router, search]
  );

  const runLifecycle = useCallback(
    async (id: string, action: LifecycleAction, reason?: string) => {
      const path =
        action === 'archive'
          ? 'archive'
          : action === 'restore'
            ? 'restore'
            : 'anonymize';
      const res = await fetch(`/api/customers/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'restore' ? undefined : JSON.stringify({ reason: reason?.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showErrorToast(data.error ?? `Unable to ${action} customer`);
        return false;
      }
      setRowMenu(null);
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      return true;
    },
    [fetchCustomers, search, showErrorToast]
  );

  const submitLifecycleModal = useCallback(async () => {
    if (!lifecycleAction) return;
    const ok = await runLifecycle(
      lifecycleAction.customerId,
      lifecycleAction.action,
      lifecycleAction.reason
    );
    if (ok) setLifecycleAction(null);
  }, [lifecycleAction, runLifecycle]);

  const openRowMenu = useCallback((c: CustomerRow, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = menuButtonRefs.current[c.id];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setRowMenu({ customerId: c.id, top: rect.bottom + 4, left: rect.left });
  }, []);

  useEffect(() => {
    if (!openAddOnMount) return;
    setEditingCustomer(null);
    setModalOpen(true);
  }, [openAddOnMount]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const rowMenuEl = document.getElementById('customer-row-menu');
      const inRowButton = Object.values(menuButtonRefs.current).some((btn) => btn?.contains(target));
      if (rowMenu && rowMenuEl && !rowMenuEl.contains(target) && !inRowButton) {
        setRowMenu(null);
      }
      if (!headerMenuRef.current?.contains(target)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [rowMenu]);

  const rowMenuCustomer = rowMenu ? list.find((c) => c.id === rowMenu.customerId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <input
              id="customer-search"
              type="search"
              placeholder="Search by account number, name, email, or company…"
              value={search}
              onChange={(e) => {
                const v = e.target.value.trim();
                setSearch(v);
                if (!v) setSearchResult(null);
              }}
              className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-slate-900 shadow-sm placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-slate-400"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value === 'oldest' ? 'oldest' : 'newest')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
          <select
            value={hasEmail}
            onChange={(e) => setHasEmail(e.target.value === 'yes' ? 'yes' : e.target.value === 'no' ? 'no' : 'all')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="all">All emails</option>
            <option value="yes">Has email</option>
            <option value="no">No email</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + Add Customer
          </button>
          <div className="relative" ref={headerMenuRef}>
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
            >
              ⋯
            </button>
            {headerMenuOpen ? (
              <div className="absolute right-0 z-40 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setView('redaction-log');
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Redaction log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComplianceNoteOpen(true);
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Compliance actions
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'active' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setTab('archived')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'archived' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
          >
            Archived
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          Anonymization is irreversible and removes personal data while preserving billing history.
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold">No customers yet</h3>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Add your first customer to start creating invoices.</p>
        </div>
      ) : (
        <div className="app-table-shell">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead>
                {view === 'redaction-log' ? (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Internal Customer ID</th>
                    <th className="app-th">Stripe Customer ID</th>
                    <th className="app-th">Anonymized At</th>
                    <th className="app-th">Anonymized By</th>
                    <th className="app-th">Status</th>
                  </tr>
                ) : tab === 'archived' ? (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Customer Name</th>
                    <th className="app-th">Email</th>
                    <th className="app-th">Archived At</th>
                    <th className="app-th">Archived By</th>
                    <th className="app-th">Archive Reason</th>
                    <th className="app-th-actions">Actions</th>
                  </tr>
                ) : (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Customer Account</th>
                    <th className="app-th">Company</th>
                    <th className="app-th">Contact Name</th>
                    <th className="app-th hidden md:table-cell">Email</th>
                    <th className="app-th hidden lg:table-cell">Created Date</th>
                    <th className="app-th-actions">Actions</th>
                  </tr>
                )}
              </thead>
              <tbody className="app-tbody">
                {list.map((c) => (
                  <tr key={c.id} className="app-tr-hover">
                    {view === 'redaction-log' ? (
                      <>
                        <td className="app-td-primary font-mono">{c.id}</td>
                        <td className="app-td-secondary">{c.stripe_customer_id ?? '—'}</td>
                        <td className="app-td-secondary">{c.anonymized_at ? format(new Date(c.anonymized_at), 'MMM d, yyyy HH:mm') : '—'}</td>
                        <td className="app-td-secondary">{c.anonymized_by_name ?? c.anonymized_by ?? '—'}</td>
                        <td className="app-td-secondary">Anonymized</td>
                      </>
                    ) : tab === 'archived' ? (
                      <>
                        <td className="app-td-primary">{c.company || c.name || c.account_number || '—'}</td>
                        <td className="app-td-secondary">{c.email ?? '—'}</td>
                        <td className="app-td-secondary">{c.archived_at ? format(new Date(c.archived_at), 'MMM d, yyyy HH:mm') : '—'}</td>
                        <td className="app-td-secondary">{c.archived_by_name ?? c.archived_by ?? '—'}</td>
                        <td className="app-td-secondary">{c.archive_reason ?? '—'}</td>
                        <td className="app-td-actions">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[c.id] = el;
                            }}
                            type="button"
                            onClick={(e) => openRowMenu(c, e)}
                            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ⋮
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="app-td-primary whitespace-nowrap font-mono">{c.account_number ?? '—'}</td>
                        <td className="app-td-primary">{c.company ?? '—'}</td>
                        <td className="app-td-secondary">{c.name?.trim() || '—'}</td>
                        <td className="app-td-secondary hidden md:table-cell">{c.email ?? '—'}</td>
                        <td className="app-td-secondary hidden lg:table-cell">{c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '—'}</td>
                        <td className="app-td-actions">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[c.id] = el;
                            }}
                            type="button"
                            onClick={(e) => openRowMenu(c, e)}
                            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ⋮
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading ? <div className="flex items-center justify-center py-8 text-sm text-slate-500">Fetching customers…</div> : null}
        </div>
      )}

      <CustomerFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={handleSaved}
        businessId={businessId}
        companyBaseCurrency={companyBaseCurrency}
        customer={editingCustomer}
      />

      {typeof document !== 'undefined' && rowMenu && rowMenuCustomer
        ? createPortal(
            <div
              id="customer-row-menu"
              role="menu"
              className="fixed z-[100] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              style={{
                top: rowMenu.top,
                left:
                  typeof window !== 'undefined' && rowMenu.left + 192 > window.innerWidth - 16
                    ? window.innerWidth - 208
                    : Math.max(8, rowMenu.left),
              }}
            >
              <Link href={`/dashboard/customers/${rowMenuCustomer.id}`} role="menuitem" onClick={() => setRowMenu(null)} className="flex w-full items-center px-4 py-3 text-left text-sm text-indigo-600 hover:bg-indigo-500/[0.06]">
                View customer
              </Link>
              {view === 'table' && tab === 'active' ? (
                <>
                  <button type="button" role="menuitem" onClick={() => { openEdit(rowMenuCustomer); setRowMenu(null); }} className="flex w-full items-center px-4 py-3 text-left text-sm hover:bg-indigo-500/[0.06]">
                    Edit customer
                  </button>
                  <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'archive', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm text-amber-700 hover:bg-amber-50">
                    Archive customer
                  </button>
                </>
              ) : null}
              {view === 'table' && tab === 'archived' ? (
                <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'restore', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm text-emerald-700 hover:bg-emerald-50">
                  Restore customer
                </button>
              ) : null}
              {view === 'table' ? (
                <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'anonymize', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm hover:bg-indigo-500/[0.06]">
                  Anonymize customer data
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}

      {lifecycleAction ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setLifecycleAction(null)} />
          <div className="relative z-[111] w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {lifecycleAction.action === 'archive' ? 'Archive customer' : lifecycleAction.action === 'restore' ? 'Restore customer' : 'Anonymize customer'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {lifecycleAction.action === 'archive'
                ? 'Archive is reversible. Billing records remain preserved.'
                : lifecycleAction.action === 'restore'
                  ? 'Restore this archived customer to active operational lists.'
                  : 'Anonymization is irreversible and removes personal data while preserving billing history.'}
            </p>
            {lifecycleAction.action !== 'restore' ? (
              <>
                <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="lifecycle-reason">Reason (audit log)</label>
                <textarea
                  id="lifecycle-reason"
                  rows={3}
                  value={lifecycleAction.reason}
                  onChange={(e) => setLifecycleAction((prev) => (prev ? { ...prev, reason: e.target.value } : prev))}
                  placeholder="Optional reason"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLifecycleAction(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLifecycleModal}
                className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${lifecycleAction.action === 'anonymize' ? 'bg-red-600 hover:bg-red-500' : lifecycleAction.action === 'restore' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                {lifecycleAction.action === 'archive' ? 'Archive customer' : lifecycleAction.action === 'restore' ? 'Restore customer' : 'Anonymize permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {complianceNoteOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setComplianceNoteOpen(false)} />
          <div className="relative z-[111] w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Compliance actions</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Archived customers are operational and restorable. Anonymized customers are compliance records and cannot be restored.
              Hard deletion stays blocked whenever financial history exists.
            </p>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setComplianceNoteOpen(false)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import type { Customer } from '@/lib/database.types';
import CustomerFormModal from './CustomerFormModal';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { sanitizeReturnToPath } from '@/lib/navigation/safe-return-to';

type CustomerRow = Customer & {
  archived_by_name?: string | null;
  anonymized_by_name?: string | null;
};

type Props = {
  businessId: string;
  companyBaseCurrency: string;
  initialCustomers: CustomerRow[];
  initialTab?: 'active' | 'archived';
  initialView?: 'table' | 'redaction-log';
  openAddOnMount?: boolean;
  returnToAfterCreate?: string | null;
};

type RowMenuState = { customerId: string; top: number; left: number } | null;
type LifecycleAction = 'archive' | 'anonymize' | 'restore';

export default function CustomersTable({
  businessId,
  companyBaseCurrency,
  initialCustomers,
  initialTab = 'active',
  initialView = 'table',
  openAddOnMount = false,
  returnToAfterCreate = null,
}: Props) {
  const router = useRouter();
  const { showErrorToast } = useToasts();
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [view, setView] = useState<'table' | 'redaction-log'>(initialView);
  const [tab, setTab] = useState<'active' | 'archived'>(initialTab);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [hasEmail, setHasEmail] = useState<'all' | 'yes' | 'no'>('all');
  const [searchResult, setSearchResult] = useState<CustomerRow[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenuState>(null);
  const [lifecycleAction, setLifecycleAction] = useState<{
    customerId: string;
    action: LifecycleAction;
    reason: string;
  } | null>(null);
  const [complianceNoteOpen, setComplianceNoteOpen] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  const list = searchResult !== null ? searchResult : customers;
  const scope = view === 'redaction-log' ? 'anonymized' : tab;

  const fetchCustomers = useCallback(
    async (q?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          business_id: businessId,
          scope,
          sort,
          has_email: hasEmail,
        });
        if (q) params.set('q', q);
        const res = await fetch(`/api/customers?${params.toString()}`);
        const data = await res.json();
        if (res.ok) {
          if (q) setSearchResult(data);
          else setCustomers(data);
        }
      } finally {
        setLoading(false);
      }
    },
    [businessId, hasEmail, scope, sort]
  );

  useEffect(() => {
    void fetchCustomers(search || undefined);
  }, [fetchCustomers, search]);

  const openAdd = useCallback(() => {
    setEditingCustomer(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((c: Customer) => {
    setEditingCustomer(c);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingCustomer(null);
  }, []);

  const handleSaved = useCallback(
    async (_customer?: Customer, meta?: { action: 'create' | 'update' }) => {
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      if (meta?.action === 'create' && returnToAfterCreate) {
        const safe = sanitizeReturnToPath(returnToAfterCreate);
        if (safe) {
          router.push(safe);
          router.refresh();
        }
      }
    },
    [fetchCustomers, returnToAfterCreate, router, search]
  );

  const runLifecycle = useCallback(
    async (id: string, action: LifecycleAction, reason?: string) => {
      const path =
        action === 'archive'
          ? 'archive'
          : action === 'restore'
            ? 'restore'
            : 'anonymize';
      const res = await fetch(`/api/customers/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'restore' ? undefined : JSON.stringify({ reason: reason?.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showErrorToast(data.error ?? `Unable to ${action} customer`);
        return false;
      }
      setRowMenu(null);
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      return true;
    },
    [fetchCustomers, search, showErrorToast]
  );

  const submitLifecycleModal = useCallback(async () => {
    if (!lifecycleAction) return;
    const ok = await runLifecycle(
      lifecycleAction.customerId,
      lifecycleAction.action,
      lifecycleAction.reason
    );
    if (ok) setLifecycleAction(null);
  }, [lifecycleAction, runLifecycle]);

  const openRowMenu = useCallback((c: CustomerRow, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = menuButtonRefs.current[c.id];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setRowMenu({ customerId: c.id, top: rect.bottom + 4, left: rect.left });
  }, []);

  useEffect(() => {
    if (!openAddOnMount) return;
    setEditingCustomer(null);
    setModalOpen(true);
  }, [openAddOnMount]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const rowMenuEl = document.getElementById('customer-row-menu');
      const inRowButton = Object.values(menuButtonRefs.current).some((btn) => btn?.contains(target));
      if (rowMenu && rowMenuEl && !rowMenuEl.contains(target) && !inRowButton) {
        setRowMenu(null);
      }
      if (!headerMenuRef.current?.contains(target)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [rowMenu]);

  const rowMenuCustomer = rowMenu ? list.find((c) => c.id === rowMenu.customerId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <input
              id="customer-search"
              type="search"
              placeholder="Search by account number, name, email, or company…"
              value={search}
              onChange={(e) => {
                const v = e.target.value.trim();
                setSearch(v);
                if (!v) setSearchResult(null);
              }}
              className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-slate-900 shadow-sm placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-slate-400"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value === 'oldest' ? 'oldest' : 'newest')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
          <select
            value={hasEmail}
            onChange={(e) => setHasEmail(e.target.value === 'yes' ? 'yes' : e.target.value === 'no' ? 'no' : 'all')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="all">All emails</option>
            <option value="yes">Has email</option>
            <option value="no">No email</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + Add Customer
          </button>
          <div className="relative" ref={headerMenuRef}>
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
            >
              ⋯
            </button>
            {headerMenuOpen ? (
              <div className="absolute right-0 z-40 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setView('redaction-log');
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Redaction log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComplianceNoteOpen(true);
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Compliance actions
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'active' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setTab('archived')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'archived' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
          >
            Archived
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          Anonymization is irreversible and removes personal data while preserving billing history.
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold">No customers yet</h3>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Add your first customer to start creating invoices.</p>
        </div>
      ) : (
        <div className="app-table-shell">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead>
                {view === 'redaction-log' ? (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Internal Customer ID</th>
                    <th className="app-th">Stripe Customer ID</th>
                    <th className="app-th">Anonymized At</th>
                    <th className="app-th">Anonymized By</th>
                    <th className="app-th">Status</th>
                  </tr>
                ) : tab === 'archived' ? (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Customer Name</th>
                    <th className="app-th">Email</th>
                    <th className="app-th">Archived At</th>
                    <th className="app-th">Archived By</th>
                    <th className="app-th">Archive Reason</th>
                    <th className="app-th-actions">Actions</th>
                  </tr>
                ) : (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Customer Account</th>
                    <th className="app-th">Company</th>
                    <th className="app-th">Contact Name</th>
                    <th className="app-th hidden md:table-cell">Email</th>
                    <th className="app-th hidden lg:table-cell">Created Date</th>
                    <th className="app-th-actions">Actions</th>
                  </tr>
                )}
              </thead>
              <tbody className="app-tbody">
                {list.map((c) => (
                  <tr key={c.id} className="app-tr-hover">
                    {view === 'redaction-log' ? (
                      <>
                        <td className="app-td-primary font-mono">{c.id}</td>
                        <td className="app-td-secondary">{c.stripe_customer_id ?? '—'}</td>
                        <td className="app-td-secondary">{c.anonymized_at ? format(new Date(c.anonymized_at), 'MMM d, yyyy HH:mm') : '—'}</td>
                        <td className="app-td-secondary">{c.anonymized_by_name ?? c.anonymized_by ?? '—'}</td>
                        <td className="app-td-secondary">Anonymized</td>
                      </>
                    ) : tab === 'archived' ? (
                      <>
                        <td className="app-td-primary">{c.company || c.name || c.account_number || '—'}</td>
                        <td className="app-td-secondary">{c.email ?? '—'}</td>
                        <td className="app-td-secondary">{c.archived_at ? format(new Date(c.archived_at), 'MMM d, yyyy HH:mm') : '—'}</td>
                        <td className="app-td-secondary">{c.archived_by_name ?? c.archived_by ?? '—'}</td>
                        <td className="app-td-secondary">{c.archive_reason ?? '—'}</td>
                        <td className="app-td-actions">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[c.id] = el;
                            }}
                            type="button"
                            onClick={(e) => openRowMenu(c, e)}
                            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ⋮
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="app-td-primary whitespace-nowrap font-mono">{c.account_number ?? '—'}</td>
                        <td className="app-td-primary">{c.company ?? '—'}</td>
                        <td className="app-td-secondary">{c.name?.trim() || '—'}</td>
                        <td className="app-td-secondary hidden md:table-cell">{c.email ?? '—'}</td>
                        <td className="app-td-secondary hidden lg:table-cell">{c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '—'}</td>
                        <td className="app-td-actions">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[c.id] = el;
                            }}
                            type="button"
                            onClick={(e) => openRowMenu(c, e)}
                            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ⋮
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading ? <div className="flex items-center justify-center py-8 text-sm text-slate-500">Fetching customers…</div> : null}
        </div>
      )}

      <CustomerFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={handleSaved}
        businessId={businessId}
        companyBaseCurrency={companyBaseCurrency}
        customer={editingCustomer}
      />

      {typeof document !== 'undefined' && rowMenu && rowMenuCustomer
        ? createPortal(
            <div
              id="customer-row-menu"
              role="menu"
              className="fixed z-[100] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              style={{
                top: rowMenu.top,
                left:
                  typeof window !== 'undefined' && rowMenu.left + 192 > window.innerWidth - 16
                    ? window.innerWidth - 208
                    : Math.max(8, rowMenu.left),
              }}
            >
              <Link href={`/dashboard/customers/${rowMenuCustomer.id}`} role="menuitem" onClick={() => setRowMenu(null)} className="flex w-full items-center px-4 py-3 text-left text-sm text-indigo-600 hover:bg-indigo-500/[0.06]">
                View customer
              </Link>
              {view === 'table' && tab === 'active' ? (
                <>
                  <button type="button" role="menuitem" onClick={() => { openEdit(rowMenuCustomer); setRowMenu(null); }} className="flex w-full items-center px-4 py-3 text-left text-sm hover:bg-indigo-500/[0.06]">
                    Edit customer
                  </button>
                  <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'archive', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm text-amber-700 hover:bg-amber-50">
                    Archive customer
                  </button>
                </>
              ) : null}
              {view === 'table' && tab === 'archived' ? (
                <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'restore', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm text-emerald-700 hover:bg-emerald-50">
                  Restore customer
                </button>
              ) : null}
              {view === 'table' ? (
                <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'anonymize', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm hover:bg-indigo-500/[0.06]">
                  Anonymize customer data
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}

      {lifecycleAction ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setLifecycleAction(null)} />
          <div className="relative z-[111] w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {lifecycleAction.action === 'archive' ? 'Archive customer' : lifecycleAction.action === 'restore' ? 'Restore customer' : 'Anonymize customer'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {lifecycleAction.action === 'archive'
                ? 'Archive is reversible. Billing records remain preserved.'
                : lifecycleAction.action === 'restore'
                  ? 'Restore this archived customer to active operational lists.'
                  : 'Anonymization is irreversible and removes personal data while preserving billing history.'}
            </p>
            {lifecycleAction.action !== 'restore' ? (
              <>
                <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="lifecycle-reason">Reason (audit log)</label>
                <textarea
                  id="lifecycle-reason"
                  rows={3}
                  value={lifecycleAction.reason}
                  onChange={(e) => setLifecycleAction((prev) => (prev ? { ...prev, reason: e.target.value } : prev))}
                  placeholder="Optional reason"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLifecycleAction(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLifecycleModal}
                className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${lifecycleAction.action === 'anonymize' ? 'bg-red-600 hover:bg-red-500' : lifecycleAction.action === 'restore' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                {lifecycleAction.action === 'archive' ? 'Archive customer' : lifecycleAction.action === 'restore' ? 'Restore customer' : 'Anonymize permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {complianceNoteOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setComplianceNoteOpen(false)} />
          <div className="relative z-[111] w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Compliance actions</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Archived customers are operational and restorable. Anonymized customers are compliance records and cannot be restored.
              Hard deletion stays blocked whenever financial history exists.
            </p>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setComplianceNoteOpen(false)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import type { Customer } from '@/lib/database.types';
import CustomerFormModal from './CustomerFormModal';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { sanitizeReturnToPath } from '@/lib/navigation/safe-return-to';

type CustomerRow = Customer & {
  archived_by_name?: string | null;
  anonymized_by_name?: string | null;
};

type Props = {
  businessId: string;
  companyBaseCurrency: string;
  initialCustomers: CustomerRow[];
  initialTab?: 'active' | 'archived';
  initialView?: 'table' | 'redaction-log';
  openAddOnMount?: boolean;
  returnToAfterCreate?: string | null;
};

type RowMenuState = { customerId: string; top: number; left: number } | null;
type LifecycleAction = 'archive' | 'anonymize' | 'restore';

export default function CustomersTable({
  businessId,
  companyBaseCurrency,
  initialCustomers,
  initialTab = 'active',
  initialView = 'table',
  openAddOnMount = false,
  returnToAfterCreate = null,
}: Props) {
  const router = useRouter();
  const { showErrorToast } = useToasts();
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [view, setView] = useState<'table' | 'redaction-log'>(initialView);
  const [tab, setTab] = useState<'active' | 'archived'>(initialTab);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [hasEmail, setHasEmail] = useState<'all' | 'yes' | 'no'>('all');
  const [searchResult, setSearchResult] = useState<CustomerRow[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenuState>(null);
  const [lifecycleAction, setLifecycleAction] = useState<{
    customerId: string;
    action: LifecycleAction;
    reason: string;
  } | null>(null);
  const [complianceNoteOpen, setComplianceNoteOpen] = useState(false);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  const list = searchResult !== null ? searchResult : customers;
  const scope = view === 'redaction-log' ? 'anonymized' : tab;

  const fetchCustomers = useCallback(
    async (q?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          business_id: businessId,
          scope,
          sort,
          has_email: hasEmail,
        });
        if (q) params.set('q', q);
        const res = await fetch(`/api/customers?${params.toString()}`);
        const data = await res.json();
        if (res.ok) {
          if (q) setSearchResult(data);
          else setCustomers(data);
        }
      } finally {
        setLoading(false);
      }
    },
    [businessId, hasEmail, scope, sort]
  );

  useEffect(() => {
    void fetchCustomers(search || undefined);
  }, [fetchCustomers, search]);

  const openAdd = useCallback(() => {
    setEditingCustomer(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((c: Customer) => {
    setEditingCustomer(c);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingCustomer(null);
  }, []);

  const handleSaved = useCallback(
    async (_customer?: Customer, meta?: { action: 'create' | 'update' }) => {
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      if (meta?.action === 'create' && returnToAfterCreate) {
        const safe = sanitizeReturnToPath(returnToAfterCreate);
        if (safe) {
          router.push(safe);
          router.refresh();
        }
      }
    },
    [fetchCustomers, returnToAfterCreate, router, search]
  );

  const runLifecycle = useCallback(
    async (id: string, action: LifecycleAction, reason?: string) => {
      const path =
        action === 'archive'
          ? 'archive'
          : action === 'restore'
            ? 'restore'
            : 'anonymize';
      const res = await fetch(`/api/customers/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'restore' ? undefined : JSON.stringify({ reason: reason?.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showErrorToast(data.error ?? `Unable to ${action} customer`);
        return false;
      }
      setRowMenu(null);
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      return true;
    },
    [fetchCustomers, search, showErrorToast]
  );

  const submitLifecycleModal = useCallback(async () => {
    if (!lifecycleAction) return;
    const ok = await runLifecycle(
      lifecycleAction.customerId,
      lifecycleAction.action,
      lifecycleAction.reason
    );
    if (ok) setLifecycleAction(null);
  }, [lifecycleAction, runLifecycle]);

  const openRowMenu = useCallback((c: CustomerRow, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = menuButtonRefs.current[c.id];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setRowMenu({ customerId: c.id, top: rect.bottom + 4, left: rect.left });
  }, []);

  useEffect(() => {
    if (!openAddOnMount) return;
    setEditingCustomer(null);
    setModalOpen(true);
  }, [openAddOnMount]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const rowMenuEl = document.getElementById('customer-row-menu');
      const inRowButton = Object.values(menuButtonRefs.current).some((btn) => btn?.contains(target));
      if (rowMenu && rowMenuEl && !rowMenuEl.contains(target) && !inRowButton) {
        setRowMenu(null);
      }
      if (!headerMenuRef.current?.contains(target)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [rowMenu]);

  const rowMenuCustomer = rowMenu ? list.find((c) => c.id === rowMenu.customerId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <input
              id="customer-search"
              type="search"
              placeholder="Search by account number, name, email, or company…"
              value={search}
              onChange={(e) => {
                const v = e.target.value.trim();
                setSearch(v);
                if (!v) setSearchResult(null);
              }}
              className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-slate-900 shadow-sm placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-slate-400"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value === 'oldest' ? 'oldest' : 'newest')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
          <select
            value={hasEmail}
            onChange={(e) => setHasEmail(e.target.value === 'yes' ? 'yes' : e.target.value === 'no' ? 'no' : 'all')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="all">All emails</option>
            <option value="yes">Has email</option>
            <option value="no">No email</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + Add Customer
          </button>
          <div className="relative" ref={headerMenuRef}>
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
            >
              ⋯
            </button>
            {headerMenuOpen ? (
              <div className="absolute right-0 z-40 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setView('redaction-log');
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Redaction log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComplianceNoteOpen(true);
                    setHeaderMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Compliance actions
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'active' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setTab('archived')}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === 'archived' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}
          >
            Archived
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          Anonymization is irreversible and removes personal data while preserving billing history.
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold">No customers yet</h3>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Add your first customer to start creating invoices.</p>
        </div>
      ) : (
        <div className="app-table-shell">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead>
                {view === 'redaction-log' ? (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Internal Customer ID</th>
                    <th className="app-th">Stripe Customer ID</th>
                    <th className="app-th">Anonymized At</th>
                    <th className="app-th">Anonymized By</th>
                    <th className="app-th">Status</th>
                  </tr>
                ) : tab === 'archived' ? (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Customer Name</th>
                    <th className="app-th">Email</th>
                    <th className="app-th">Archived At</th>
                    <th className="app-th">Archived By</th>
                    <th className="app-th">Archive Reason</th>
                    <th className="app-th-actions">Actions</th>
                  </tr>
                ) : (
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="app-th">Customer Account</th>
                    <th className="app-th">Company</th>
                    <th className="app-th">Contact Name</th>
                    <th className="app-th hidden md:table-cell">Email</th>
                    <th className="app-th hidden lg:table-cell">Created Date</th>
                    <th className="app-th-actions">Actions</th>
                  </tr>
                )}
              </thead>
              <tbody className="app-tbody">
                {list.map((c) => (
                  <tr key={c.id} className="app-tr-hover">
                    {view === 'redaction-log' ? (
                      <>
                        <td className="app-td-primary font-mono">{c.id}</td>
                        <td className="app-td-secondary">{c.stripe_customer_id ?? '—'}</td>
                        <td className="app-td-secondary">{c.anonymized_at ? format(new Date(c.anonymized_at), 'MMM d, yyyy HH:mm') : '—'}</td>
                        <td className="app-td-secondary">{c.anonymized_by_name ?? c.anonymized_by ?? '—'}</td>
                        <td className="app-td-secondary">Anonymized</td>
                      </>
                    ) : tab === 'archived' ? (
                      <>
                        <td className="app-td-primary">{c.company || c.name || c.account_number || '—'}</td>
                        <td className="app-td-secondary">{c.email ?? '—'}</td>
                        <td className="app-td-secondary">{c.archived_at ? format(new Date(c.archived_at), 'MMM d, yyyy HH:mm') : '—'}</td>
                        <td className="app-td-secondary">{c.archived_by_name ?? c.archived_by ?? '—'}</td>
                        <td className="app-td-secondary">{c.archive_reason ?? '—'}</td>
                        <td className="app-td-actions">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[c.id] = el;
                            }}
                            type="button"
                            onClick={(e) => openRowMenu(c, e)}
                            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ⋮
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="app-td-primary whitespace-nowrap font-mono">{c.account_number ?? '—'}</td>
                        <td className="app-td-primary">{c.company ?? '—'}</td>
                        <td className="app-td-secondary">{c.name?.trim() || '—'}</td>
                        <td className="app-td-secondary hidden md:table-cell">{c.email ?? '—'}</td>
                        <td className="app-td-secondary hidden lg:table-cell">{c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '—'}</td>
                        <td className="app-td-actions">
                          <button
                            ref={(el) => {
                              menuButtonRefs.current[c.id] = el;
                            }}
                            type="button"
                            onClick={(e) => openRowMenu(c, e)}
                            className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ⋮
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading ? <div className="flex items-center justify-center py-8 text-sm text-slate-500">Fetching customers…</div> : null}
        </div>
      )}

      <CustomerFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={handleSaved}
        businessId={businessId}
        companyBaseCurrency={companyBaseCurrency}
        customer={editingCustomer}
      />

      {typeof document !== 'undefined' && rowMenu && rowMenuCustomer
        ? createPortal(
            <div
              id="customer-row-menu"
              role="menu"
              className="fixed z-[100] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              style={{
                top: rowMenu.top,
                left:
                  typeof window !== 'undefined' && rowMenu.left + 192 > window.innerWidth - 16
                    ? window.innerWidth - 208
                    : Math.max(8, rowMenu.left),
              }}
            >
              <Link href={`/dashboard/customers/${rowMenuCustomer.id}`} role="menuitem" onClick={() => setRowMenu(null)} className="flex w-full items-center px-4 py-3 text-left text-sm text-indigo-600 hover:bg-indigo-500/[0.06]">
                View customer
              </Link>
              {view === 'table' && tab === 'active' ? (
                <>
                  <button type="button" role="menuitem" onClick={() => { openEdit(rowMenuCustomer); setRowMenu(null); }} className="flex w-full items-center px-4 py-3 text-left text-sm hover:bg-indigo-500/[0.06]">
                    Edit customer
                  </button>
                  <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'archive', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm text-amber-700 hover:bg-amber-50">
                    Archive customer
                  </button>
                </>
              ) : null}
              {view === 'table' && tab === 'archived' ? (
                <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'restore', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm text-emerald-700 hover:bg-emerald-50">
                  Restore customer
                </button>
              ) : null}
              {view === 'table' ? (
                <button type="button" role="menuitem" onClick={() => setLifecycleAction({ customerId: rowMenuCustomer.id, action: 'anonymize', reason: '' })} className="flex w-full items-center px-4 py-3 text-left text-sm hover:bg-indigo-500/[0.06]">
                  Anonymize customer data
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}

      {lifecycleAction ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setLifecycleAction(null)} />
          <div className="relative z-[111] w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {lifecycleAction.action === 'archive' ? 'Archive customer' : lifecycleAction.action === 'restore' ? 'Restore customer' : 'Anonymize customer'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {lifecycleAction.action === 'archive'
                ? 'Archive is reversible. Billing records remain preserved.'
                : lifecycleAction.action === 'restore'
                  ? 'Restore this archived customer to active operational lists.'
                  : 'Anonymization is irreversible and removes personal data while preserving billing history.'}
            </p>
            {lifecycleAction.action !== 'restore' ? (
              <>
                <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="lifecycle-reason">Reason (audit log)</label>
                <textarea
                  id="lifecycle-reason"
                  rows={3}
                  value={lifecycleAction.reason}
                  onChange={(e) => setLifecycleAction((prev) => (prev ? { ...prev, reason: e.target.value } : prev))}
                  placeholder="Optional reason"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLifecycleAction(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLifecycleModal}
                className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${lifecycleAction.action === 'anonymize' ? 'bg-red-600 hover:bg-red-500' : lifecycleAction.action === 'restore' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                {lifecycleAction.action === 'archive' ? 'Archive customer' : lifecycleAction.action === 'restore' ? 'Restore customer' : 'Anonymize permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {complianceNoteOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setComplianceNoteOpen(false)} />
          <div className="relative z-[111] w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Compliance actions</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Archived customers are operational and restorable. Anonymized customers are compliance records and cannot be restored.
              Hard deletion stays blocked whenever financial history exists.
            </p>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setComplianceNoteOpen(false)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import type { Customer } from '@/lib/database.types';
import CustomerFormModal from './CustomerFormModal';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { sanitizeReturnToPath } from '@/lib/navigation/safe-return-to';

type Props = {
  businessId: string;
  companyBaseCurrency: string;
  initialCustomers: Customer[];
  openAddOnMount?: boolean;
  /** After creating a customer (not edit), navigate here if allowed. */
  returnToAfterCreate?: string | null;
};

type MenuPosition = { top: number; left: number; height: number };
type HardDeletePolicy = { allowed: boolean; reason: string | null; blockers: string[] };
type LifecycleAction = 'archive' | 'anonymize';

export default function CustomersTable({
  businessId,
  companyBaseCurrency,
  initialCustomers,
  openAddOnMount = false,
  returnToAfterCreate = null,
}: Props) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const { showErrorToast } = useToasts();
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState<Customer[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [deletionPolicyByCustomer, setDeletionPolicyByCustomer] = useState<Record<string, HardDeletePolicy>>({});
  const [lifecycleAction, setLifecycleAction] = useState<{
    customerId: string;
    action: LifecycleAction;
    reason: string;
  } | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const list = searchResult !== null ? searchResult : customers;

  const fetchCustomers = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const url = q
        ? `/api/customers?business_id=${encodeURIComponent(businessId)}&q=${encodeURIComponent(q)}`
        : `/api/customers?business_id=${encodeURIComponent(businessId)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        if (q) setSearchResult(data);
        else setCustomers(data);
      }
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.trim();
      setSearch(v);
      if (v) {
        fetchCustomers(v);
      } else {
        setSearchResult(null);
      }
    },
    [fetchCustomers]
  );

  const openAdd = useCallback(() => {
    setEditingCustomer(null);
    setModalOpen(true);
  }, []);

  const addOpenedRef = useRef(false);
  useEffect(() => {
    if (!openAddOnMount) {
      addOpenedRef.current = false;
      return;
    }
    if (addOpenedRef.current) return;
    addOpenedRef.current = true;
    setEditingCustomer(null);
    setModalOpen(true);
  }, [openAddOnMount]);

  const openEdit = useCallback((c: Customer) => {
    setEditingCustomer(c);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingCustomer(null);
  }, []);

  const handleSaved = useCallback(
    async (_customer?: Customer, meta?: { action: 'create' | 'update' }) => {
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
      if (meta?.action === 'create' && returnToAfterCreate) {
        const safe = sanitizeReturnToPath(returnToAfterCreate);
        if (safe) {
          router.push(safe);
          router.refresh();
        }
      }
    },
    [fetchCustomers, search, returnToAfterCreate, router]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Delete failed');
        }
        setDeleteConfirm(null);
        setOpenMenuId(null);
        setMenuPosition(null);
        fetchCustomers(search || undefined);
        if (search) setSearchResult(null);
      } catch (err) {
        showErrorToast('Something went wrong. Please retry');
      }
    },
    [fetchCustomers, search]
  );

  const ensurePolicyLoaded = useCallback(
    async (id: string): Promise<HardDeletePolicy> => {
      const existing = deletionPolicyByCustomer[id];
      if (existing) return existing;
      const res = await fetch(`/api/customers/${id}/deletion-policy`);
      if (!res.ok) {
        return { allowed: false, reason: 'Policy unavailable', blockers: [] };
      }
      const data = (await res.json()) as HardDeletePolicy;
      setDeletionPolicyByCustomer((prev) => ({ ...prev, [id]: data }));
      return data;
    },
    [deletionPolicyByCustomer]
  );

  const handleArchive = useCallback(
    async (id: string, reason?: string) => {
      const res = await fetch(`/api/customers/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason?.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showErrorToast(data.error ?? 'Unable to archive customer');
        return;
      }
      setDeleteConfirm(null);
      setOpenMenuId(null);
      setMenuPosition(null);
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
    },
    [fetchCustomers, search, showErrorToast]
  );

  const handleAnonymize = useCallback(
    async (id: string, reason?: string) => {
      const res = await fetch(`/api/customers/${id}/anonymize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason?.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showErrorToast(data.error ?? 'Unable to anonymize customer');
        return;
      }
      setDeleteConfirm(null);
      setOpenMenuId(null);
      setMenuPosition(null);
      await fetchCustomers(search || undefined);
      if (search) setSearchResult(null);
    },
    [fetchCustomers, search, showErrorToast]
  );

  const openLifecycleModal = useCallback((customerId: string, action: LifecycleAction) => {
    setLifecycleAction({ customerId, action, reason: '' });
    setDeleteConfirm(null);
    setOpenMenuId(null);
    setMenuPosition(null);
  }, []);

  const submitLifecycleModal = useCallback(async () => {
    if (!lifecycleAction) return;
    if (lifecycleAction.action === 'archive') {
      await handleArchive(lifecycleAction.customerId, lifecycleAction.reason);
    } else {
      await handleAnonymize(lifecycleAction.customerId, lifecycleAction.reason);
    }
    setLifecycleAction(null);
  }, [handleAnonymize, handleArchive, lifecycleAction]);

  const openRowMenu = useCallback((c: Customer, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = menuButtonRefs.current[c.id];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom, left: rect.left, height: rect.height });
      setOpenMenuId(c.id);
      setDeleteConfirm(null);
      void ensurePolicyLoaded(c.id);
    }
  }, [ensurePolicyLoaded]);

  const closeRowMenu = useCallback(() => {
    setOpenMenuId(null);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const menuEl = typeof document !== 'undefined' ? document.getElementById('customer-row-menu') : null;
      const fromButton = Object.values(menuButtonRefs.current).some((btn) => btn && btn.contains(target));
      if (menuEl && !menuEl.contains(target) && !fromButton) {
        closeRowMenu();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [openMenuId, closeRowMenu]);

  const customerWithOpenMenu = openMenuId ? list.find((c) => c.id === openMenuId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <label htmlFor="customer-search" className="sr-only">
            Search customers
          </label>
          <input
            id="customer-search"
            type="search"
            placeholder="Search by account number, name, email, or company…"
            value={search}
            onChange={handleSearch}
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-slate-900 shadow-sm placeholder-slate-500 transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-slate-400"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
            🔍
          </span>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          + Add Customer
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No customers yet</h3>
          <p className="mt-2 max-w-sm text-slate-600 dark:text-slate-400">
            Add your first customer to start creating invoices.
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            + Add Customer
          </button>
        </div>
      ) : (
        <div className="app-table-shell">
          <div className="app-table-scroll">
            <table className="app-table">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50">
                  <th className="app-th">
                    Customer Account
                  </th>
                  <th className="app-th">
                    Company
                  </th>
                  <th className="app-th">
                    Contact Name
                  </th>
                  <th className="app-th hidden md:table-cell">
                    Email
                  </th>
                  <th className="app-th hidden lg:table-cell">
                    Phone
                  </th>
                  <th className="app-th hidden lg:table-cell">
                    Created Date
                  </th>
                  <th className="app-th-actions hidden md:table-cell">
                    Actions
                  </th>
                  <th className="w-12 shrink-0 px-2 py-3 md:hidden" aria-label="Row actions" />
                </tr>
              </thead>
              <tbody className="app-tbody">
                {list.map((c) => {
                  const policy = deletionPolicyByCustomer[c.id] ?? { allowed: false, reason: null, blockers: [] };
                  const hasInvoiceHistoryWarning =
                    policy.blockers.includes('invoice_history') ||
                    policy.blockers.includes('paid_invoice_history');
                  return (
                  <tr key={c.id} className="app-tr-hover">
                    <td className="app-td-primary whitespace-nowrap font-mono">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {c.account_number ?? '—'}
                      </Link>
                    </td>
                    <td className="app-td-primary max-w-[220px] truncate md:max-w-none">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                      >
                        {c.company ?? '—'}
                      </Link>
                    </td>
                    <td className="app-td-secondary max-w-[220px] truncate md:max-w-none">
                      {c.name?.trim() || '—'}
                    </td>
                    <td className="app-td-secondary hidden md:table-cell">
                      {c.email ?? '—'}
                    </td>
                    <td className="app-td-secondary hidden lg:table-cell">
                      {c.phone ?? '—'}
                    </td>
                    <td className="app-td-secondary hidden whitespace-nowrap lg:table-cell">
                      {c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="app-td-actions hidden md:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/customers/${c.id}`}
                          className="rounded px-2 py-1 text-sm text-indigo-600 transition-colors hover:bg-indigo-500/[0.08] dark:text-indigo-400 dark:hover:bg-indigo-400/10"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="rounded px-2 py-1 text-sm text-slate-600 transition-colors hover:bg-indigo-500/[0.06] hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300"
                        >
                          Edit
                        </button>
                        {policy.allowed && deleteConfirm === c.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(c.id)}
                              className="rounded px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(null)}
                              className="rounded px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-indigo-500/[0.06] hover:text-indigo-600 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : policy.allowed ? (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(c.id)}
                            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            Delete
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openLifecycleModal(c.id, 'archive')}
                              className="rounded px-2 py-1 text-sm text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                            >
                              Archive
                            </button>
                            <button
                              type="button"
                              onClick={() => openLifecycleModal(c.id, 'anonymize')}
                              className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Anonymize
                            </button>
                          </>
                        )}
                      </div>
                      {hasInvoiceHistoryWarning ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          This customer has invoice history. For compliance and audit reasons, permanent deletion is disabled.
                        </p>
                      ) : null}
                    </td>
                    <td className="w-12 shrink-0 px-2 py-3 md:hidden">
                      <div className="flex justify-end">
                        <button
                          ref={(el) => { menuButtonRefs.current[c.id] = el; }}
                          type="button"
                          onClick={(e) => openRowMenu(c, e)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-indigo-500/[0.06] hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300"
                          aria-label="Open actions menu"
                          aria-expanded={openMenuId === c.id}
                          aria-haspopup="true"
                        >
                          <span className="text-lg leading-none" aria-hidden>⋮</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500 dark:text-slate-400">
              Fetching customers…
            </div>
          )}
        </div>
      )}

      <CustomerFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={handleSaved}
        businessId={businessId}
        companyBaseCurrency={companyBaseCurrency}
        customer={editingCustomer}
      />

      {typeof document !== 'undefined' &&
        openMenuId &&
        menuPosition &&
        customerWithOpenMenu &&
        createPortal(
          <div
            id="customer-row-menu"
            role="menu"
            className="fixed z-[100] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
            style={{
              top: menuPosition.top + 4,
              left:
                typeof window !== 'undefined' && menuPosition.left + 192 > window.innerWidth - 16
                  ? window.innerWidth - 208
                  : Math.max(8, menuPosition.left),
            }}
          >
            {deleteConfirm === openMenuId ? (
              <>
                <p className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Delete this customer?</p>
                <div className="flex gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-700">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      handleDelete(openMenuId);
                    }}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDeleteConfirm(null);
                      closeRowMenu();
                    }}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.04] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-400/5"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {deletionPolicyByCustomer[openMenuId]?.allowed ? null : (
                  <p className="px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
                    This customer has invoice history. For compliance and audit reasons, permanent deletion is disabled.
                  </p>
                )}
                <Link
                  href={`/dashboard/customers/${customerWithOpenMenu.id}`}
                  role="menuitem"
                  onClick={closeRowMenu}
                  className="flex w-full items-center px-4 py-3 text-left text-sm text-indigo-600 transition-colors hover:bg-indigo-500/[0.06] dark:text-indigo-400 dark:hover:bg-indigo-400/10"
                >
                  View
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openEdit(customerWithOpenMenu);
                    closeRowMenu();
                  }}
                  className="flex w-full items-center px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openLifecycleModal(openMenuId, 'archive');
                  }}
                  className="flex w-full items-center px-4 py-3 text-left text-sm text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                >
                  Archive
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openLifecycleModal(openMenuId, 'anonymize');
                  }}
                  className="flex w-full items-center px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
                >
                  Anonymize
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setDeleteConfirm(openMenuId)}
                  disabled={!deletionPolicyByCustomer[openMenuId]?.allowed}
                  className="flex w-full items-center px-4 py-3 text-left text-sm text-red-600 hover:bg-slate-50 dark:text-red-400 dark:hover:bg-slate-700/50"
                >
                  Delete
                </button>
              </>
            )}
          </div>,
          document.body
        )}
      {lifecycleAction && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setLifecycleAction(null)}
            aria-hidden="true"
          />
          <div className="relative z-[111] w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {lifecycleAction.action === 'archive' ? 'Archive customer' : 'Anonymize customer'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {lifecycleAction.action === 'archive'
                ? 'This keeps billing records and prevents new billing actions until reactivated.'
                : 'This redacts personal data while preserving billing and audit references.'}
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="lifecycle-reason">
              Reason (for audit log)
            </label>
            <textarea
              id="lifecycle-reason"
              rows={3}
              value={lifecycleAction.reason}
              onChange={(e) =>
                setLifecycleAction((prev) => (prev ? { ...prev, reason: e.target.value } : prev))
              }
              placeholder="Optional reason"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLifecycleAction(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLifecycleModal}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {lifecycleAction.action === 'archive' ? 'Archive' : 'Anonymize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
