'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Inbox, Paperclip, MoreVertical, Search, X } from 'lucide-react';
import { formatDisplayDate } from '@/lib/utils/date';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import ExpenseFormModal, { type ExpenseRow } from './ExpenseFormModal';
import ExpenseAttachmentPreviewModal from './ExpenseAttachmentPreviewModal';
import { useToasts } from '@/components/feedback/toast/ToastProvider';

const FORM_CATEGORIES = ['General', 'Travel', 'Meals', 'Software', 'Office', 'Marketing', 'Other'] as const;

type StatusFilter = 'all' | 'recorded' | 'with_attachment' | 'without_attachment';

type Props = {
  businessId: string;
  currency: string;
  initialExpenses: ExpenseRow[];
};

function expenseDateKey(d: string) {
  return String(d ?? '').slice(0, 10);
}

function rowMatchesSearch(row: ExpenseRow, q: string, currency: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const amountStr = String(row.amount ?? '');
  const money = formatCurrencyAmount(Number(row.amount), currency).toLowerCase();
  const haystacks = [
    row.description,
    row.category,
    row.notes ?? '',
    amountStr,
    money,
    row.attachment_name ?? '',
  ].map((s) => String(s).toLowerCase());
  return haystacks.some((h) => h.includes(needle));
}

function ExpenseStatusBadge({ row }: { row: ExpenseRow }) {
  const attached = Boolean(row.attachment_url?.trim());
  if (attached) {
    return (
      <span className="inline-flex items-center rounded-full border border-indigo-200/90 bg-indigo-500/[0.1] px-2.5 py-0.5 text-xs font-semibold tracking-tight text-indigo-800 dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-200">
        Attached
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200/90 bg-slate-100/90 px-2.5 py-0.5 text-xs font-semibold tracking-tight text-slate-600 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-300">
      Recorded
    </span>
  );
}

export default function ExpensesTable({ businessId, currency, initialExpenses }: Props) {
  const { showErrorToast } = useToasts();
  const [expenses, setExpenses] = useState<ExpenseRow[]>(initialExpenses);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(null);
  const [activeExpenseMenuId, setActiveExpenseMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<{
    open: boolean;
    expenseId: string | null;
    title: string;
    src: string | null;
    variant: 'image' | 'pdf';
    loading: boolean;
  }>({
    open: false,
    expenseId: null,
    title: '',
    src: null,
    variant: 'image',
    loading: false,
  });

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const mobileTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const desktopTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [isMdUp, setIsMdUp] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsMdUp(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/expenses?business_id=${encodeURIComponent(businessId)}`);
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) setExpenses(data as ExpenseRow[]);
  }, [businessId]);

  useEffect(() => {
    setExpenses(initialExpenses);
  }, [initialExpenses]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>([...FORM_CATEGORIES]);
    expenses.forEach((e) => {
      if (e.category?.trim()) set.add(e.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((row) => {
      if (!rowMatchesSearch(row, debouncedSearch, currency)) return false;
      if (filterCategory !== 'all' && (row.category || 'General') !== filterCategory) return false;
      const hasAtt = Boolean(row.attachment_url?.trim());
      if (filterStatus === 'with_attachment' && !hasAtt) return false;
      if (filterStatus === 'without_attachment' && hasAtt) return false;
      const rowDate = expenseDateKey(row.expense_date);
      if (dateFrom && rowDate < dateFrom) return false;
      if (dateTo && rowDate > dateTo) return false;
      const amt = Number(row.amount);
      const minN = amountMin.trim() === '' ? NaN : Number(amountMin);
      const maxN = amountMax.trim() === '' ? NaN : Number(amountMax);
      if (Number.isFinite(minN) && amt < minN) return false;
      if (Number.isFinite(maxN) && amt > maxN) return false;
      return true;
    });
  }, [
    expenses,
    debouncedSearch,
    currency,
    filterCategory,
    filterStatus,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
  ]);

  const hasActiveFilters =
    searchInput.trim() !== '' ||
    debouncedSearch !== '' ||
    filterCategory !== 'all' ||
    filterStatus !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    amountMin.trim() !== '' ||
    amountMax.trim() !== '';

  const hasSheetFilters =
    filterCategory !== 'all' ||
    filterStatus !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    amountMin.trim() !== '' ||
    amountMax.trim() !== '';

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setFilterCategory('all');
    setFilterStatus('all');
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
  }, []);

  useEffect(() => {
    if (!filterSheetOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterSheetOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = prev;
    };
  }, [filterSheetOpen]);

  useEffect(() => {
    if (!activeExpenseMenuId) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      const wrap = menuWrapRef.current;
      if (wrap?.contains(t)) return;
      const triggerBtn = (isMdUp ? desktopTriggerRefs : mobileTriggerRefs).current[activeExpenseMenuId];
      if (triggerBtn?.contains(t)) return;
      setActiveExpenseMenuId(null);
      setDeleteConfirmId(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [activeExpenseMenuId, isMdUp]);

  const updateMenuPosition = useCallback((menuId: string) => {
    const trigger = desktopTriggerRefs.current[menuId];
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const triggerGap = 6;
    const menuWidth = 160;
    const estimatedMenuHeight = deleteConfirmId === menuId ? 112 : 132;

    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
    );
    const top = openUpward
      ? Math.max(viewportPadding, rect.top - estimatedMenuHeight - triggerGap)
      : Math.min(window.innerHeight - estimatedMenuHeight - viewportPadding, rect.bottom + triggerGap);

    setMenuPosition({ top, left, openUpward });
  }, [deleteConfirmId]);

  useEffect(() => {
    if (!activeExpenseMenuId) {
      setMenuPosition(null);
      return;
    }
    if (!isMdUp) {
      setMenuPosition(null);
      return;
    }
    updateMenuPosition(activeExpenseMenuId);
    const onViewportChange = () => updateMenuPosition(activeExpenseMenuId);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [activeExpenseMenuId, updateMenuPosition, isMdUp]);

  useEffect(() => {
    if (!activeExpenseMenuId) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveExpenseMenuId(null);
        setDeleteConfirmId(null);
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [activeExpenseMenuId]);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (row: ExpenseRow) => {
    setSelectedExpense(null);
    setActiveExpenseMenuId(null);
    setDeleteConfirmId(null);
    setEditing(row);
    setModalOpen(true);
  };

  const openView = (row: ExpenseRow) => {
    setSelectedExpense(row);
    setActiveExpenseMenuId(null);
    setDeleteConfirmId(null);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showErrorToast('Something went wrong. Please retry');
      return;
    }
    setActiveExpenseMenuId(null);
    setDeleteConfirmId(null);
    setSelectedExpense((prev) => (prev?.id === id ? null : prev));
    await refetch();
  };

  const attachmentPreviewVariant = (row: ExpenseRow): 'image' | 'pdf' => {
    const t = row.attachment_type;
    const u = row.attachment_url ?? '';
    if (t === 'application/pdf') return 'pdf';
    if (t?.startsWith('image/')) return 'image';
    if (/\.pdf$/i.test(u)) return 'pdf';
    return 'image';
  };

  const openAttachmentPreview = useCallback(
    async (row: ExpenseRow) => {
      const path = row.attachment_url?.trim();
      if (!path) return;
      setAttachmentPreview({
        open: true,
        expenseId: row.id,
        title: row.attachment_name?.trim() || 'Attachment',
        src: null,
        variant: attachmentPreviewVariant(row),
        loading: true,
      });
      try {
        let url = path;
        if (!/^https?:\/\//i.test(path)) {
          const res = await fetch('/api/expenses/attachment-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: businessId, path, ttl_seconds: 3600 }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.url) throw new Error(data.error ?? 'Unable to open attachment');
          url = String(data.url);
        }
        setAttachmentPreview((p) => ({ ...p, src: url, loading: false }));
      } catch (err) {
        setAttachmentPreview({
          open: false,
          expenseId: null,
          title: '',
          src: null,
          variant: 'image',
          loading: false,
        });
        showErrorToast('Something went wrong. Please retry');
      }
    },
    [businessId]
  );

  const closeAttachmentPreview = () => {
    setAttachmentPreview({
      open: false,
      expenseId: null,
      title: '',
      src: null,
      variant: 'image',
      loading: false,
    });
  };

  const inputClass =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white';
  const selectClass = `${inputClass} min-w-0`;
  const mobileSearchInputClass =
    'w-full rounded-2xl border border-slate-200/90 bg-slate-50/95 py-2 pl-10 pr-10 text-sm text-slate-900 shadow-inner shadow-slate-900/[0.03] transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-700 dark:bg-slate-800/95 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-900 sm:py-3 sm:pl-12 sm:pr-12 sm:text-base';
  const mobileChipBase =
    'touch-manipulation min-h-10 shrink-0 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-[0.98] sm:min-h-0 sm:px-4 sm:py-2.5 sm:text-sm';
  const mobileChipIdle =
    'border-slate-200/90 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
  const mobileChipOn =
    'border-indigo-500/80 bg-indigo-500/[0.12] text-indigo-900 shadow-md shadow-indigo-900/10 dark:border-indigo-400/60 dark:bg-indigo-500/20 dark:text-indigo-100';
  const sheetFieldClass = `${inputClass} rounded-xl px-4 py-3 text-base`;

  const renderExpenseRowMenu = (row: ExpenseRow, menuId: string, mode: 'anchored' | 'fixed') => {
    const rootClass =
      mode === 'anchored'
        ? 'absolute right-0 top-full z-[140] mt-2 max-w-[calc(100vw-2rem)] w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800'
        : 'fixed z-[140] w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800';
    const style =
      mode === 'fixed' && menuPosition ? { top: menuPosition.top, left: menuPosition.left } : undefined;
    return (
      <div
        ref={mode === 'fixed' ? menuWrapRef : undefined}
        id={`expense-menu-${menuId}`}
        role="menu"
        className={rootClass}
        style={style}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative px-1 pt-8">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => {
              setActiveExpenseMenuId(null);
              setDeleteConfirmId(null);
            }}
            className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {deleteConfirmId === menuId ? (
          <>
            <p className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">Delete this expense?</p>
            <div className="flex gap-1 border-t border-slate-100 px-2 py-1.5 dark:border-slate-700">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleDelete(row.id)}
                className="flex-1 rounded-md bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openView(row);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
            >
              View
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openEdit(row)}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-indigo-500/[0.06] dark:text-slate-200 dark:hover:bg-indigo-400/10"
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => setDeleteConfirmId(menuId)}
              className="block w-full px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Delete
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="md:hidden">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Expenses</p>
            {expenses.length > 0 ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">{filteredExpenses.length}</span>
                <span className="text-slate-400 dark:text-slate-500"> / </span>
                {expenses.length} shown
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative mt-2.5 sm:mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500 sm:left-4 sm:h-5 sm:w-5"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search expenses, vendors, categories..."
            autoComplete="off"
            aria-label="Search expenses"
            className={mobileSearchInputClass}
          />
          {searchInput ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 sm:right-3 sm:h-9 sm:w-9"
            >
              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-3 sm:gap-2">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`${mobileChipBase} ${filterStatus === 'all' || filterStatus === 'recorded' ? mobileChipOn : mobileChipIdle}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('with_attachment')}
            className={`${mobileChipBase} ${filterStatus === 'with_attachment' ? mobileChipOn : mobileChipIdle}`}
          >
            Attachment
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('without_attachment')}
            className={`${mobileChipBase} ${filterStatus === 'without_attachment' ? mobileChipOn : mobileChipIdle}`}
          >
            No file
          </button>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className={`${mobileChipBase} flex items-center gap-1.5 sm:gap-2 ${mobileChipIdle}`}
          >
            <Filter className="h-3.5 w-3.5 opacity-80 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
            Filters
            {hasSheetFilters ? (
              <span className="flex h-2 w-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50 dark:bg-indigo-400" aria-hidden />
            ) : null}
          </button>
        </div>

        <div className="mt-2.5 flex flex-col gap-2 sm:mt-3">
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-10 w-full rounded-xl border border-slate-200/90 bg-white py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.04] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500/40 sm:min-h-11 sm:py-2.5 sm:text-sm"
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            onClick={openAdd}
            className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/20 transition-colors hover:bg-indigo-500 active:scale-[0.99] dark:bg-indigo-500 dark:shadow-indigo-950/40 dark:hover:bg-indigo-400 sm:min-h-12 sm:py-3.5 sm:text-base"
          >
            + Record expense
          </button>
        </div>
      </div>

      <div className="hidden md:flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between xl:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              strokeWidth={2}
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search expenses, vendors, categories…"
              autoComplete="off"
              aria-label="Search expenses"
              className={`${inputClass} w-full pl-9 pr-9`}
            />
            {searchInput ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="-mx-1 flex min-w-0 flex-wrap items-end gap-2 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:overflow-visible sm:px-0">
            <div className="flex min-w-[8.5rem] flex-1 flex-col gap-1 sm:flex-initial sm:min-w-[9rem]">
              <label htmlFor="expense-filter-category" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Category
              </label>
              <select
                id="expense-filter-category"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className={selectClass}
              >
                <option value="all">All categories</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[8.5rem] flex-1 flex-col gap-1 sm:flex-initial sm:min-w-[10rem]">
              <label htmlFor="expense-filter-status" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Status
              </label>
              <select
                id="expense-filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
                className={selectClass}
              >
                <option value="all">All</option>
                <option value="recorded">Recorded</option>
                <option value="with_attachment">Has attachment</option>
                <option value="without_attachment">No attachment</option>
              </select>
            </div>
            <div className="flex min-w-[9.5rem] flex-1 flex-col gap-1 sm:flex-initial">
              <label htmlFor="expense-filter-from" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                From
              </label>
              <input
                id="expense-filter-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex min-w-[9.5rem] flex-1 flex-col gap-1 sm:flex-initial">
              <label htmlFor="expense-filter-to" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                To
              </label>
              <input
                id="expense-filter-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex min-w-[5.5rem] flex-1 flex-col gap-1 sm:max-w-[6.5rem]">
              <label htmlFor="expense-filter-min" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Min amt
              </label>
              <input
                id="expense-filter-min"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex min-w-[5.5rem] flex-1 flex-col gap-1 sm:max-w-[6.5rem]">
              <label htmlFor="expense-filter-max" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Max amt
              </label>
              <input
                id="expense-filter-max"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="∞"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                className={inputClass}
              />
            </div>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mb-0.5 h-[38px] shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.04] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/30"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="inline-flex h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          + Record expense
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 md:rounded-xl md:py-12">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 md:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Inbox className="h-7 w-7 text-slate-400 dark:text-slate-500" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">No expenses yet</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Record your first expense to see it here.</p>
          </div>
          <p className="hidden text-sm text-slate-600 dark:text-slate-400 md:block">
            No expenses yet. Record your first expense to see it here.
          </p>
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/60 px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-800/40 md:rounded-xl md:border-solid md:bg-white md:py-12 dark:md:bg-slate-900">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 md:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-900">
              <Search className="h-7 w-7 text-slate-300 dark:text-slate-600" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">No expenses found</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Try adjusting your search or filters.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 w-full max-w-xs rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:border-indigo-300 dark:border-slate-600 dark:bg-slate-900 dark:text-indigo-300"
            >
              Clear filters
            </button>
          </div>
          <div className="hidden md:block">
            <p className="text-sm text-slate-600 dark:text-slate-400">No expenses match your search or filters.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filteredExpenses.map((row, index) => {
              const rowMenuId = row.id || `${row.expense_date}-${row.description}-${index}`;
              return (
                <div
                  key={rowMenuId}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openView(row);
                    }
                  }}
                  onClick={() => openView(row)}
                  className="relative overflow-visible rounded-2xl border border-slate-200/90 bg-white p-4 shadow-md shadow-slate-900/[0.04] transition-colors active:bg-slate-50/90 dark:border-slate-700/90 dark:bg-slate-900 dark:shadow-black/25 dark:active:bg-slate-800/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">
                        {row.description?.trim() || 'Untitled expense'}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                      {formatCurrencyAmount(Number(row.amount), currency)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span className="rounded-md bg-slate-100/90 px-2 py-0.5 text-slate-700 dark:bg-slate-800/90 dark:text-slate-200">
                      {row.category || 'General'}
                    </span>
                    <span aria-hidden className="text-slate-300 dark:text-slate-600">
                      •
                    </span>
                    <span>{formatDisplayDate(row.expense_date)}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <ExpenseStatusBadge row={row} />
                    <div className="flex shrink-0 items-center gap-0.5">
                      {row.attachment_url?.trim() ? (
                        <button
                          type="button"
                          disabled={attachmentPreview.loading && attachmentPreview.expenseId === row.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void openAttachmentPreview(row);
                          }}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-indigo-600 transition-colors hover:bg-indigo-500/[0.1] disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-400/10"
                          aria-label="Open attachment"
                          aria-busy={attachmentPreview.loading && attachmentPreview.expenseId === row.id}
                        >
                          <Paperclip className="h-5 w-5" strokeWidth={2} aria-hidden />
                        </button>
                      ) : null}
                      <div
                        ref={activeExpenseMenuId === rowMenuId && !isMdUp ? menuWrapRef : undefined}
                        className="relative z-[130] inline-flex justify-end"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (activeExpenseMenuId === rowMenuId) {
                              setActiveExpenseMenuId(null);
                              setDeleteConfirmId(null);
                            } else {
                              setDeleteConfirmId(null);
                              setActiveExpenseMenuId(rowMenuId);
                            }
                          }}
                          ref={(el) => {
                            mobileTriggerRefs.current[rowMenuId] = el;
                          }}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-indigo-500/[0.08] hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300"
                          aria-label="Row actions"
                          aria-expanded={activeExpenseMenuId === rowMenuId}
                          aria-haspopup="true"
                          aria-controls={`expense-menu-${rowMenuId}`}
                        >
                          <MoreVertical className="pointer-events-none h-5 w-5" strokeWidth={2} aria-hidden />
                        </button>
                        {activeExpenseMenuId === rowMenuId && !isMdUp
                          ? renderExpenseRowMenu(row, rowMenuId, 'anchored')
                          : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="app-table-shell hidden overflow-visible md:block">
            <div className="app-table-scroll">
              <table className="app-table min-w-[720px] w-full">
              <thead>
                <tr>
                  <th className="app-th">
                    Date
                  </th>
                  <th className="app-th">
                    Description
                  </th>
                  <th className="app-th">
                    Category
                  </th>
                  <th className="app-th-num">
                    Amount
                  </th>
                  <th className="app-th text-center">
                    Attachment
                  </th>
                  <th className="app-th-actions relative w-14">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="app-tbody">
                {filteredExpenses.map((row, index) => {
                  const rowMenuId = row.id || `${row.expense_date}-${row.description}-${index}`;
                  return (
                    <tr
                      key={rowMenuId}
                      onClick={() => openView(row)}
                      className="app-tr-hover cursor-pointer"
                    >
                      <td className="app-td-secondary whitespace-nowrap">
                        {formatDisplayDate(row.expense_date)}
                      </td>
                      <td className="app-td-primary max-w-[280px]">
                        <span className="line-clamp-2">{row.description}</span>
                      </td>
                      <td className="app-td-secondary whitespace-nowrap">
                        {row.category || '—'}
                      </td>
                      <td className="app-td-num whitespace-nowrap font-medium text-slate-900 dark:text-white">
                        {formatCurrencyAmount(Number(row.amount), currency)}
                      </td>
                      <td className="app-td text-center">
                        {row.attachment_url?.trim() ? (
                          <button
                            type="button"
                            disabled={attachmentPreview.loading && attachmentPreview.expenseId === row.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void openAttachmentPreview(row);
                            }}
                            className="inline-flex items-center justify-center rounded-lg p-1.5 text-indigo-600 transition-colors hover:bg-indigo-500/[0.08] disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-400/10"
                            aria-label="Open attachment"
                            aria-busy={attachmentPreview.loading && attachmentPreview.expenseId === row.id}
                          >
                            <Paperclip className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </button>
                        ) : (
                          <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td
                        className="relative px-2 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div
                          className="relative inline-flex justify-end"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (activeExpenseMenuId === rowMenuId) {
                                setActiveExpenseMenuId(null);
                                setDeleteConfirmId(null);
                              } else {
                                setDeleteConfirmId(null);
                                setActiveExpenseMenuId(rowMenuId);
                                setTimeout(() => updateMenuPosition(rowMenuId), 0);
                              }
                            }}
                            ref={(el) => {
                              desktopTriggerRefs.current[rowMenuId] = el;
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-indigo-500/[0.06] hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300"
                            aria-label="Row actions"
                            aria-expanded={activeExpenseMenuId === rowMenuId}
                            aria-haspopup="true"
                            aria-controls={`expense-menu-${rowMenuId}`}
                          >
                            <MoreVertical className="pointer-events-none h-4 w-4" strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {filterSheetOpen ? (
        <div className="fixed inset-0 z-[155] md:hidden" role="dialog" aria-modal="true" aria-labelledby="expense-filters-title">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] transition-opacity"
            onClick={() => setFilterSheetOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-3xl border border-slate-200/80 bg-white shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.2)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50">
            <div className="sticky top-0 z-10 flex flex-col items-center border-b border-slate-100 bg-white/95 pb-3 pt-2 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
              <div className="h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden />
              <h2 id="expense-filters-title" className="mt-3 px-6 text-lg font-semibold text-slate-900 dark:text-white">
                Filters
              </h2>
            </div>

            <div className="space-y-4 px-5 pb-6 pt-2">
              <div className="space-y-1.5">
                <label htmlFor="m-expense-filter-category" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Category
                </label>
                <select
                  id="m-expense-filter-category"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className={`${selectClass} w-full rounded-xl py-3 text-base`}
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="m-expense-filter-status" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Status
                </label>
                <select
                  id="m-expense-filter-status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
                  className={`${selectClass} w-full rounded-xl py-3 text-base`}
                >
                  <option value="all">All</option>
                  <option value="recorded">Recorded</option>
                  <option value="with_attachment">Has attachment</option>
                  <option value="without_attachment">No attachment</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="m-expense-filter-from" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    From
                  </label>
                  <input
                    id="m-expense-filter-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={`${sheetFieldClass} w-full`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="m-expense-filter-to" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    To
                  </label>
                  <input
                    id="m-expense-filter-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={`${sheetFieldClass} w-full`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="m-expense-filter-min" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Min amount
                  </label>
                  <input
                    id="m-expense-filter-min"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    className={`${sheetFieldClass} w-full`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="m-expense-filter-max" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Max amount
                  </label>
                  <input
                    id="m-expense-filter-max"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="Any"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    className={`${sheetFieldClass} w-full`}
                  />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex gap-3 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  setFilterSheetOpen(false);
                }}
                className="flex-1 touch-manipulation rounded-xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="flex-1 touch-manipulation rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-indigo-900/15 transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ExpenseFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={refetch}
        businessId={businessId}
        expense={editing}
      />
      {activeExpenseMenuId && menuPosition && isMdUp && typeof document !== 'undefined' && (() => {
        const activeRow = filteredExpenses.find((row, index) => {
          const rowMenuId = row.id || `${row.expense_date}-${row.description}-${index}`;
          return rowMenuId === activeExpenseMenuId;
        });
        if (!activeRow) return null;
        return createPortal(renderExpenseRowMenu(activeRow, activeExpenseMenuId, 'fixed'), document.body);
      })()}
      {selectedExpense && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close expense view"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectedExpense(null)}
          />
          <div
            className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close expense view"
              onClick={() => setSelectedExpense(null)}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <h3 className="pr-10 text-base font-semibold text-slate-900 dark:text-white">Expense Details</h3>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Vendor / Payee</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{selectedExpense.description || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount</p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {formatCurrencyAmount(Number(selectedExpense.amount), currency)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Date</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{formatDisplayDate(selectedExpense.expense_date)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{selectedExpense.category || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">Recorded</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900 dark:text-white">
                  {selectedExpense.notes?.trim() ? selectedExpense.notes.trim() : '—'}
                </p>
              </div>
            </div>

            {selectedExpense.attachment_url?.trim() ? (
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Attachment</p>
                <button
                  type="button"
                  onClick={() => void openAttachmentPreview(selectedExpense)}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-500/[0.04] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Paperclip className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
                  View attachment
                </button>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => openEdit(selectedExpense)}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = window.confirm('Delete this expense?');
                  if (!ok) return;
                  await handleDelete(selectedExpense.id);
                }}
                className="inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ExpenseAttachmentPreviewModal
        open={attachmentPreview.open}
        onClose={closeAttachmentPreview}
        title={attachmentPreview.title}
        src={attachmentPreview.src}
        variant={attachmentPreview.variant}
        loading={attachmentPreview.loading}
      />
    </div>
  );
}
