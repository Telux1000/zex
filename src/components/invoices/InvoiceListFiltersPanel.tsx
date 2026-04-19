'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { SearchableCustomerSelect } from '@/components/customers/SearchableCustomerSelect';
import {
  QUICK_FILTERS,
  SCHEDULE_FILTERS,
  DUE_DATE_OPTIONS,
  ISSUE_DATE_OPTIONS,
  INVOICE_MANAGEMENT_FILTER_OPEN,
} from '@/lib/invoices/list-filters';

export type InvoiceFilterDraft = {
  status: string;
  useOpenFilter: boolean;
  scheduleFilter: string;
  issue: string;
  issue_from: string;
  issue_to: string;
  due: string;
  due_from: string;
  due_to: string;
  customer: string;
};

type CustomerOption = { id: string; name: string };

type Props = {
  draft: InvoiceFilterDraft;
  setDraft: React.Dispatch<React.SetStateAction<InvoiceFilterDraft>>;
  customers: CustomerOption[];
  onApply: () => void;
  onReset: () => void;
  /** Bottom sheet (mobile) vs right drawer (desktop). */
  variant?: 'sheet' | 'drawer';
  className?: string;
};

export function snapshotFiltersFromUrl(args: {
  status: string;
  filter: string;
  scheduleFilter: string;
  issue: string;
  issue_from: string;
  issue_to: string;
  due: string;
  due_from: string;
  due_to: string;
  customer: string;
}): InvoiceFilterDraft {
  return {
    status: args.filter === INVOICE_MANAGEMENT_FILTER_OPEN ? '' : args.status,
    useOpenFilter: args.filter === INVOICE_MANAGEMENT_FILTER_OPEN,
    scheduleFilter: args.scheduleFilter,
    issue: args.issue,
    issue_from: args.issue_from,
    issue_to: args.issue_to,
    due: args.due,
    due_from: args.due_from,
    due_to: args.due_to,
    customer: args.customer,
  };
}

export function countActiveInvoiceListFilters(p: {
  q: string;
  status: string;
  filter: string;
  balance: string;
  scheduleFilter: string;
  issue: string;
  issue_from: string;
  issue_to: string;
  due: string;
  due_from: string;
  due_to: string;
  customer: string;
}): number {
  let n = 0;
  if (p.q.trim()) n++;
  if (p.filter === INVOICE_MANAGEMENT_FILTER_OPEN || p.balance === 'open') n++;
  else if (p.status) n++;
  if (p.scheduleFilter) n++;
  if (p.issue) n++;
  if (p.due) n++;
  if (p.customer) n++;
  return n;
}

export function InvoiceListFiltersPanel({
  draft,
  setDraft,
  customers,
  onApply,
  onReset,
  variant = 'drawer',
  className,
}: Props) {
  const sheetTouch = variant === 'sheet';

  const statusSelectValue = draft.useOpenFilter
    ? INVOICE_MANAGEMENT_FILTER_OPEN
    : draft.status;

  const onStatusSelectChange = (value: string) => {
    if (value === '') {
      setDraft((d) => ({ ...d, status: '', useOpenFilter: false }));
      return;
    }
    const def = QUICK_FILTERS.find((f) => f.value === value);
    if (def?.filterParam === INVOICE_MANAGEMENT_FILTER_OPEN) {
      setDraft((d) => ({ ...d, status: '', useOpenFilter: true }));
    } else {
      setDraft((d) => ({ ...d, status: value, useOpenFilter: false }));
    }
  };

  const customerOptions = useMemo(
    () => customers.map((c) => ({ id: c.id, label: c.name })),
    [customers]
  );

  const selectClass = cn(
    'w-full touch-manipulation rounded-lg border border-slate-200 bg-white px-3 shadow-sm transition-colors',
    'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
    'dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100',
    sheetTouch ? 'min-h-12 py-3 text-base' : 'h-10 py-2 text-sm'
  );

  const customerTriggerClass = cn(
    'border-slate-200 shadow-sm dark:border-slate-600',
    sheetTouch && 'min-h-12 h-auto py-3 text-base'
  );

  const sectionTitleEl = (id: string, text: string) => (
    <p
      id={id}
      className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
    >
      {text}
    </p>
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        variant === 'sheet' && 'max-h-full',
        className
      )}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-y-contain py-2 [-webkit-overflow-scrolling:touch]">
        {sectionTitleEl('inv-filters-timeline-group-label', 'Timeline')}

        <section className="space-y-2" aria-labelledby="inv-filters-issue-label">
          {sectionTitleEl('inv-filters-issue-label', 'Issue date')}
          <select
            id="inv-filters-issue"
            aria-labelledby="inv-filters-issue-label"
            value={draft.issue}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                issue: e.target.value,
                issue_from: e.target.value === 'custom' ? d.issue_from : '',
                issue_to: e.target.value === 'custom' ? d.issue_to : '',
              }))
            }
            className={selectClass}
          >
            <option value="">All issue dates</option>
            {ISSUE_DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {draft.issue === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="date"
                aria-label="Issue from"
                value={draft.issue_from}
                onChange={(e) => setDraft((d) => ({ ...d, issue_from: e.target.value }))}
                className={cn(
                  'min-w-[8rem] flex-1 touch-manipulation rounded-lg border border-slate-200 px-3 dark:border-slate-600 dark:bg-slate-900',
                  sheetTouch ? 'min-h-12 py-2 text-base' : 'min-h-0 py-2 text-sm'
                )}
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                aria-label="Issue to"
                value={draft.issue_to}
                onChange={(e) => setDraft((d) => ({ ...d, issue_to: e.target.value }))}
                className={cn(
                  'min-w-[8rem] flex-1 touch-manipulation rounded-lg border border-slate-200 px-3 dark:border-slate-600 dark:bg-slate-900',
                  sheetTouch ? 'min-h-12 py-2 text-base' : 'min-h-0 py-2 text-sm'
                )}
              />
            </div>
          )}
        </section>

        <section className="space-y-2" aria-labelledby="inv-filters-due-label">
          {sectionTitleEl('inv-filters-due-label', 'Due date')}
          <select
            id="inv-filters-due"
            aria-labelledby="inv-filters-due-label"
            value={draft.due}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                due: e.target.value,
                due_from: e.target.value === 'custom' ? d.due_from : '',
                due_to: e.target.value === 'custom' ? d.due_to : '',
              }))
            }
            className={selectClass}
          >
            <option value="">All due dates</option>
            {DUE_DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {draft.due === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="date"
                aria-label="Due from"
                value={draft.due_from}
                onChange={(e) => setDraft((d) => ({ ...d, due_from: e.target.value }))}
                className={cn(
                  'min-w-[8rem] flex-1 touch-manipulation rounded-lg border border-slate-200 px-3 dark:border-slate-600 dark:bg-slate-900',
                  sheetTouch ? 'min-h-12 py-2 text-base' : 'min-h-0 py-2 text-sm'
                )}
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                aria-label="Due to"
                value={draft.due_to}
                onChange={(e) => setDraft((d) => ({ ...d, due_to: e.target.value }))}
                className={cn(
                  'min-w-[8rem] flex-1 touch-manipulation rounded-lg border border-slate-200 px-3 dark:border-slate-600 dark:bg-slate-900',
                  sheetTouch ? 'min-h-12 py-2 text-base' : 'min-h-0 py-2 text-sm'
                )}
              />
            </div>
          )}
        </section>

        {sectionTitleEl('inv-filters-state-group-label', 'State')}
        <section className="space-y-2" aria-labelledby="inv-filters-status-label">
          {sectionTitleEl('inv-filters-status-label', 'Status')}
          <select
            id="inv-filters-status"
            aria-labelledby="inv-filters-status-label"
            value={statusSelectValue}
            onChange={(e) => onStatusSelectChange(e.target.value)}
            className={selectClass}
          >
            <option value="">All statuses</option>
            {QUICK_FILTERS.filter((f) => f.value !== '').map((f) => (
              <option key={`${f.value}-${f.label}`} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </section>

        {sectionTitleEl('inv-filters-entity-group-label', 'Entity')}
        <section className="space-y-2" aria-labelledby="inv-filters-customer-label">
          <div className="flex items-center justify-between gap-2">
            {sectionTitleEl('inv-filters-customer-label', 'Customer')}
            {draft.customer ? (
              <button
                type="button"
                className="shrink-0 touch-manipulation text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                onClick={() => setDraft((d) => ({ ...d, customer: '' }))}
              >
                Clear
              </button>
            ) : null}
          </div>
          <SearchableCustomerSelect
            id="inv-filters-customer"
            aria-labelledby="inv-filters-customer-label"
            options={customerOptions}
            value={draft.customer}
            onChange={(customerId) => setDraft((d) => ({ ...d, customer: customerId }))}
            placeholder="All customers"
            triggerClassName={customerTriggerClass}
          />
        </section>

        {sectionTitleEl('inv-filters-structure-group-label', 'Structure')}
        <section className="space-y-2" aria-labelledby="inv-filters-schedule-label">
          {sectionTitleEl('inv-filters-schedule-label', 'Schedule')}
          <select
            id="inv-filters-schedule"
            aria-labelledby="inv-filters-schedule-label"
            value={draft.scheduleFilter}
            onChange={(e) => setDraft((d) => ({ ...d, scheduleFilter: e.target.value }))}
            className={selectClass}
          >
            {SCHEDULE_FILTERS.map((f) => (
              <option key={f.value || 'all-s'} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </section>
      </div>

      <div
        className={cn(
          'mt-auto flex shrink-0 gap-2 border-t border-slate-200 bg-white pt-4 dark:border-slate-700 dark:bg-slate-900',
          variant === 'sheet' && 'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
        )}
      >
        <button
          type="button"
          onClick={onReset}
          className={cn(
            'flex-1 touch-manipulation rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors active:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:active:bg-slate-800',
            sheetTouch ? 'min-h-12 py-3' : 'min-h-0 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800'
          )}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onApply}
          className={cn(
            'flex-1 touch-manipulation rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm transition-colors active:bg-indigo-700 dark:bg-indigo-500 dark:active:bg-indigo-600',
            sheetTouch ? 'min-h-12 py-3' : 'min-h-0 py-2.5 hover:bg-indigo-500 dark:hover:bg-indigo-400'
          )}
        >
          Apply filters
        </button>
      </div>
    </div>
  );
}

export type QuickChipKey =
  | 'all'
  | 'draft'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue';

export type QuickChipDef = {
  key: QuickChipKey;
  label: string;
  /** Maps to `?status=` (must match API / filter panel, e.g. `partially_paid`). */
  status?: string;
  /** Active-state palette (default matches indigo chips). */
  tone?: 'default' | 'warning';
};

export const INVOICE_QUICK_CHIPS: QuickChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft', status: 'draft' },
  { key: 'sent', label: 'Sent', status: 'sent' },
  {
    key: 'partially_paid',
    label: 'Partially Paid',
    status: 'partially_paid',
    tone: 'warning',
  },
  { key: 'paid', label: 'Paid', status: 'paid' },
  { key: 'overdue', label: 'Past due', status: 'overdue' },
];
