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

  const openRowMenu = useCallback((c: Customer, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = menuButtonRefs.current[c.id];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom, left: rect.left, height: rect.height });
      setOpenMenuId(c.id);
      setDeleteConfirm(null);
    }
  }, []);

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
                {list.map((c) => (
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
                        <Link
                          href={`/dashboard/invoices/new?mode=form&customer_id=${c.id}`}
                          className="rounded px-2 py-1 text-sm text-slate-600 transition-colors hover:bg-indigo-500/[0.06] hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300"
                        >
                          Create invoice
                        </Link>
                        {deleteConfirm === c.id ? (
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
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(c.id)}
                            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            Delete
                          </button>
                        )}
                      </div>
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
                ))}
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
                <Link
                  href={`/dashboard/invoices/new?mode=form&customer_id=${customerWithOpenMenu.id}`}
                  onClick={closeRowMenu}
                  role="menuitem"
                  className="flex w-full items-center px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
                >
                  Create invoice
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setDeleteConfirm(openMenuId)}
                  className="flex w-full items-center px-4 py-3 text-left text-sm text-red-600 hover:bg-slate-50 dark:text-red-400 dark:hover:bg-slate-700/50"
                >
                  Delete
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
