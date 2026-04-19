import {
  startOfDay,
  endOfDay,
  addDays,
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  isBefore,
  isAfter,
} from 'date-fns';
import { statusLabel } from '@/lib/invoices/edit-rules';
import { deriveInvoiceStatus } from '@/lib/invoices/status';

export const STATUS_OPTIONS = [
  'draft',
  'pending',
  'sent',
  'overdue',
  'partially_paid',
  'paid',
  'cancelled',
  'voided',
] as const;

/** `?filter=` value: open/outstanding invoices (remaining balance &gt; 0, not paid/void). */
export const INVOICE_MANAGEMENT_FILTER_OPEN = 'open' as const;

export type QuickFilterDef = {
  value: string;
  label: string;
  /** Uses `filter=open` instead of `status=` (balance-based, not raw status). */
  filterParam?: typeof INVOICE_MANAGEMENT_FILTER_OPEN;
};

export const QUICK_FILTERS: QuickFilterDef[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open', filterParam: INVOICE_MANAGEMENT_FILTER_OPEN },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const SCHEDULE_FILTERS = [
  { value: '', label: 'All schedules' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'due_today', label: 'Due Today' },
  { value: 'past_due', label: 'Past due' },
  { value: 'with_schedule', label: 'With Schedule' },
] as const;

export type ScheduleFilter = (typeof SCHEDULE_FILTERS)[number]['value'];

export type DueDateFilter =
  | 'overdue'
  | 'today'
  | 'next_7'
  | 'this_month'
  | 'custom';

export type IssueDateFilter =
  | 'today'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'last_90_days'
  | 'custom';

export interface DueDateRange {
  from: string; // ISO date
  to: string;
}

export interface IssueDateRange {
  from: string; // ISO date
  to: string;
}

const today = () => format(startOfDay(new Date()), 'yyyy-MM-dd');

export function getDueDateRange(
  due: DueDateFilter | string | undefined,
  dueFrom?: string,
  dueTo?: string
): DueDateRange | null {
  if (!due) return null;
  const now = new Date();
  const todayStr = format(startOfDay(now), 'yyyy-MM-dd');
  switch (due) {
    case 'overdue':
      return { from: '1970-01-01', to: format(addDays(startOfDay(now), -1), 'yyyy-MM-dd') };
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'next_7':
      return {
        from: todayStr,
        to: format(addDays(now, 7), 'yyyy-MM-dd'),
      };
    case 'this_month':
      return {
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
    case 'custom':
      if (dueFrom && dueTo) return { from: dueFrom, to: dueTo };
      return null;
    default:
      return null;
  }
}

export function getIssueDateRange(
  issue: IssueDateFilter | string | undefined,
  issueFrom?: string,
  issueTo?: string
): IssueDateRange | null {
  if (!issue) return null;
  const now = new Date();
  const todayStr = format(startOfDay(now), 'yyyy-MM-dd');
  switch (issue) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'last_7_days':
      return {
        from: format(addDays(startOfDay(now), -6), 'yyyy-MM-dd'),
        to: todayStr,
      };
    case 'this_month':
      return {
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
    case 'last_month': {
      const thisMonthStart = startOfMonth(now);
      const lastMonthDate = addDays(thisMonthStart, -1);
      return {
        from: format(startOfMonth(lastMonthDate), 'yyyy-MM-dd'),
        to: format(endOfMonth(lastMonthDate), 'yyyy-MM-dd'),
      };
    }
    case 'last_90_days':
      return {
        from: format(addDays(startOfDay(now), -89), 'yyyy-MM-dd'),
        to: todayStr,
      };
    case 'custom':
      if (issueFrom && issueTo) return { from: issueFrom, to: issueTo };
      return null;
    default:
      return null;
  }
}

export function isInvoiceOverdue(dueDate: string, status: string): boolean {
  if (status === 'paid' || status === 'voided' || status === 'cancelled') return false;
  return isBefore(parseISO(dueDate), startOfDay(new Date()));
}

/** Normalize status for filtering: treat overdue as a virtual status */
export function statusForFilter(inv: {
  due_date: string;
  status: string;
  total?: number;
  amount_paid?: number;
  balance_due?: number;
  total_refunded?: number;
}): string {
  const status = deriveInvoiceStatus({
    status: inv.status,
    total: inv.total ?? 0,
    amount_paid: inv.amount_paid ?? 0,
    balance_due: inv.balance_due ?? null,
    total_refunded: inv.total_refunded ?? 0,
  });
  const st = String(status).toLowerCase();
  if (st === 'refunded' || st === 'partially_refunded') return st;
  if (st === 'paid' || st === 'voided' || st === 'cancelled') return st;
  // Keep partially paid explicit, even if due_date has passed.
  if (st === 'partially_paid') return st;
  if (isInvoiceOverdue(inv.due_date, st)) return 'overdue';
  return st;
}

export function isInDueDateRange(
  dueDate: string,
  range: DueDateRange | null
): boolean {
  if (!range) return true;
  const d = parseISO(dueDate);
  const from = parseISO(range.from);
  const to = endOfDay(parseISO(range.to));
  return !isBefore(d, from) && !isAfter(d, to);
}

export const DUE_DATE_OPTIONS: { value: DueDateFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'next_7', label: 'Next 7 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

export const ISSUE_DATE_OPTIONS: { value: IssueDateFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
];

/** Primary sort options for the invoice list toolbar (API-supported). */
export const INVOICE_LIST_SORT_OPTIONS = [
  { value: 'created_at', label: 'Created' },
  { value: 'next_due', label: 'Next due' },
  { value: 'issue_date', label: 'Issue date' },
  { value: 'total', label: 'Amount' },
] as const;

export const SORT_FIELDS = [
  ...INVOICE_LIST_SORT_OPTIONS,
  { value: 'amount', label: 'Amount (balance)' },
  { value: 'due_date', label: 'Due date' },
  { value: 'status', label: 'Status' },
] as const;

export type SortField = (typeof SORT_FIELDS)[number]['value'];

/** Default list sort: newest invoices first. */
export const INVOICE_LIST_DEFAULT_SORT: SortField = 'created_at';

export const INVOICE_LIST_DEFAULT_ORDER: 'asc' | 'desc' = 'desc';

const INVOICE_LIST_SORT_PREFERENCE_KEY = 'zenzex.invoiceList.sort.v1';

export const SORT_FIELD_SET = new Set<string>(SORT_FIELDS.map((f) => f.value));

export function parseInvoiceListSortParam(raw: string | null): SortField {
  const v = raw ?? '';
  return (SORT_FIELD_SET.has(v) ? v : INVOICE_LIST_DEFAULT_SORT) as SortField;
}

/** Default descending (newest / largest first) unless `order=asc` is explicit. */
export function parseInvoiceListOrderParam(raw: string | null): 'asc' | 'desc' {
  return raw === 'asc' ? 'asc' : 'desc';
}

export function getInvoiceListSortPreference(): {
  sort: SortField;
  order: 'asc' | 'desc';
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(INVOICE_LIST_SORT_PREFERENCE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { sort?: string; order?: string };
    if (!p.sort || !SORT_FIELD_SET.has(p.sort)) return null;
    const order = p.order === 'asc' || p.order === 'desc' ? p.order : INVOICE_LIST_DEFAULT_ORDER;
    return { sort: p.sort as SortField, order };
  } catch {
    return null;
  }
}

export function setInvoiceListSortPreference(sort: SortField, order: 'asc' | 'desc') {
  try {
    localStorage.setItem(
      INVOICE_LIST_SORT_PREFERENCE_KEY,
      JSON.stringify({ sort, order })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Compact label for the sort control, e.g. `Created ↓`. */
export function formatInvoiceListSortIndicator(
  sort: SortField,
  order: 'asc' | 'desc'
): string {
  const fromToolbar = INVOICE_LIST_SORT_OPTIONS.find((o) => o.value === sort);
  const label =
    fromToolbar?.label ??
    SORT_FIELDS.find((f) => f.value === sort)?.label ??
    'Created';
  return `${label} ${order === 'desc' ? '↓' : '↑'}`;
}

const STATUS_ORDER: Record<string, number> = {
  overdue: 0,
  draft: 1,
  pending: 2,
  sent: 3,
  viewed: 4,
  partially_paid: 5,
  paid: 6,
  partially_refunded: 7,
  refunded: 8,
  cancelled: 9,
  voided: 10,
};

export function compareInvoices(
  a: { invoice_number: string; customer_name: string; due_date: string; status: string; total: number; next_due_date?: string | null; created_at?: string | null },
  b: { invoice_number: string; customer_name: string; due_date: string; status: string; total: number; next_due_date?: string | null; created_at?: string | null },
  sort: SortField,
  order: 'asc' | 'desc'
): number {
  const mult = order === 'asc' ? 1 : -1;
  const statusA = statusForFilter({ due_date: a.due_date, status: a.status });
  const statusB = statusForFilter({ due_date: b.due_date, status: b.status });

  switch (sort) {
    case 'next_due':
    case 'due_date':
      return mult * (
        parseISO(a.next_due_date || a.due_date).getTime() -
        parseISO(b.next_due_date || b.due_date).getTime()
      );
    case 'issue_date':
      return mult * (
        parseISO((a as { issue_date?: string | null }).issue_date || a.due_date).getTime() -
        parseISO((b as { issue_date?: string | null }).issue_date || b.due_date).getTime()
      );
    case 'total':
      return mult * (a.total - b.total);
    case 'status':
      return mult * ((STATUS_ORDER[statusA] ?? 99) - (STATUS_ORDER[statusB] ?? 99));
    case 'amount':
      return mult * (a.total - b.total);
    case 'created_at':
      return mult * (
        parseISO(a.created_at || a.due_date).getTime() -
        parseISO(b.created_at || b.due_date).getTime()
      );
    default:
      return 0;
  }
}

export { statusLabel };
