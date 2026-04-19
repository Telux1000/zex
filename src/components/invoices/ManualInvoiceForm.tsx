'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import type { Customer, PaymentSettings } from '@/lib/database.types';
import { countries as locationCountries, getStates, normalizeCountryCode as normalizeCountryCodeLocation } from '@/lib/location';
import { formatDisplayDate } from '@/lib/utils/date';
import { resolveDiscountAmount } from '@/lib/validations/invoice';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { InvoicePaymentMethods } from './InvoicePaymentMethods';
import { CurrencySelect } from '@/components/currency/CurrencySelect';
import { CountrySelect } from '@/components/location/CountrySelect';
import { formatMoneyCodeFirst } from '@/lib/utils/currency';
import { roundMoney2 } from '@/lib/currency/amounts-in-base';
import { computeInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import {
  canEditInvoiceCurrency,
  getInvoiceBaseAmounts,
  getInvoicePreviewCurrency,
  normalizeInvoiceCurrencyFields,
  recalculateInvoiceForCurrency,
} from '@/lib/invoices/currency-edit';
import { ItemNameInput } from '@/components/items/ItemNameInput';
import { persistSavedLineItemsFromSave } from '@/lib/items/saved-line-items-store';
import { SearchableCustomerSelect } from '@/components/customers/SearchableCustomerSelect';
import CustomerFormModal from '@/components/customers/CustomerFormModal';
import { CustomerRequiredModal } from '@/components/customers/CustomerRequiredModal';
import { cn } from '@/lib/utils/cn';
import { getBusinessBaseCurrency, resolveInvoiceTransactionCurrency } from '@/lib/business/currency-policy';
import { CalendarDays, Lock, Plus, Trash2 } from 'lucide-react';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { useDashboardSetupProgress } from '@/contexts/DashboardAccessContext';
import { isSetupProgressFullySatisfied } from '@/lib/onboarding/setup-progress';
import { InvoiceCoreSetupBlockedFromContext } from '@/components/onboarding/InvoiceCoreSetupBlockedFromContext';
import { InvoiceCustomerSetupPanel } from '@/components/onboarding/InvoiceCustomerSetupPanel';
import { InvoiceManualEntrySetup } from '@/components/invoices/InvoiceManualEntrySetup';
import { BusinessAddressInvoiceSoftPrompt } from '@/components/invoices/BusinessAddressInvoiceSoftPrompt';
import { isBusinessSenderAddressMissingForInvoices } from '@/lib/business/profile';
import { isFinalPaymentComplete, PaymentModal } from '@/components/invoices/PaymentModal';
import { useBillingPlan } from '@/hooks/use-billing-plan';
import { hasPlanFeature } from '@/lib/billing/plans';
import { UpgradePlanModal } from '@/components/billing/UpgradePlanModal';
import { mapApiCodeToUpgradeTrigger, type UpgradeTrigger } from '@/lib/billing/upgrade-modal';
import { formatInvoiceUnitLabelForDisplay, normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { buildInvoiceTimeSummaryDoc } from '@/lib/invoices/invoice-time-summary';
import { InvoiceLineUnitField } from '@/components/invoices/InvoiceLineUnitField';
import {
  MANUAL_INVOICE_FIELD_FOCUS,
  MANUAL_INVOICE_FIELD_FOCUS_ERROR,
} from '@/components/invoices/manual-invoice-field-classes';

type LineItem = {
  name: string;
  description: string;
  quantity: number;
  unit_label: string;
  unit_price: number;
  tax_percent: number;
  /** Shown when Time Summary is enabled; optional consultant / staff name. */
  assignee: string;
};

type PaymentScheduleRow = {
  id?: string;
  description: string;
  percentage: number;
  amount: number;
  due_date: string;
  status?: 'pending' | 'paid' | 'refund';
  paid_at?: string | null;
  _lastEdited?: 'percentage' | 'amount' | 'auto';
};

type FormErrors = Partial<{
  customer_name: string;
  due_date: string;
  issue_date: string;
  items: string;
  delivery: string;
  discount: string;
}>;

type LineItemFieldErrors = Record<number, { name?: string; quantity?: string; unit_price?: string }>;

function resolveCountryCode(value: string | null | undefined): string {
  return normalizeCountryCodeLocation(value);
}

function resolveStateCode(countryCode: string, value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  const code = resolveCountryCode(countryCode);
  if (!code) return value.trim();
  const states = getStates(code);
  if (states.length === 0) return value.trim();
  const v = value.trim();
  const found = states.find((s) => s.code === v || s.name.toLowerCase() === v.toLowerCase());
  return found ? found.code : v;
}

function getCountryNameFromCode(code: string): string {
  return locationCountries.find((c) => c.code === code)?.name ?? code;
}

const PHONE_DIAL_CODE_BY_COUNTRY: Record<string, string> = {
  US: '+1',
  CA: '+1',
  GB: '+44',
  AU: '+61',
  DE: '+49',
  FR: '+33',
  IN: '+91',
  IE: '+353',
  NL: '+31',
  NZ: '+64',
  ES: '+34',
};

function normalizePhone(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return `${hasPlus ? '+' : ''}${digits}`;
}

function formatPhoneForDisplay(value: string): string {
  const normalized = normalizePhone(value);
  if (!normalized) return '';
  const hasPlus = normalized.startsWith('+');
  const digits = normalized.replace(/\D/g, '');
  const groups: string[] = [];
  let i = 0;
  while (i < digits.length) {
    const size = i === 0 && digits.length > 10 ? 3 : 3;
    groups.push(digits.slice(i, i + size));
    i += size;
  }
  return `${hasPlus ? '+' : ''}${groups.join(' ')}`.trim();
}

export type EditModeInitialData = {
  invoice: {
    status?: string;
    currency?: string;
    base_currency_code?: string;
    exchange_rate_to_base?: number;
    subtotal_in_base?: number | null;
    tax_amount_in_base?: number | null;
    total_in_base?: number | null;
    customer_id?: string | null;
    customer_name: string;
    customer_email?: string | null;
    issue_date: string;
    due_date: string;
    invoice_number?: string | null;
    use_payment_schedule?: boolean;
    amount_paid?: number;
    balance_due?: number;
    reference_po?: string | null;
    notes?: string | null;
    terms?: string | null;
    show_time_summary?: boolean;
    discount_amount?: number;
    /** Line-level tax % (invoice header); loaded from server row. */
    tax_percent?: number | null;
    /** Invoice-level discount % when used instead of amount. */
    discount_percent?: number | null;
    tax_amount?: number;
    subtotal?: number;
    total?: number;
    /** When set, merged with root `payment_schedule` for load order (schedule lives on invoice). */
    paymentSchedule?: PaymentScheduleRow[];
    metadata?: {
      contact_person?: string | null;
      company?: string | null;
      billing_phone?: string | null;
      billing_address_line1?: string | null;
      billing_address_line2?: string | null;
      billing_address?: string | null;
      billing_city?: string | null;
      billing_state?: string | null;
      billing_postal_code?: string | null;
      billing_country?: string | null;
      use_delivery_address?: boolean | null;
      delivery_company?: string | null;
      delivery_contact_person?: string | null;
      delivery_address?: string | null;
      delivery_city?: string | null;
      delivery_state?: string | null;
      delivery_postal_code?: string | null;
      delivery_country?: string | null;
      delivery_phone?: string | null;
      delivery_email?: string | null;
    } | null;
  };
  items: {
    name: string;
    description?: string | null;
    quantity: number;
    unit_label?: string | null;
    unit_price: number;
    tax_percent?: number;
    assignee?: string | null;
  }[];
  payment_schedule?: PaymentScheduleRow[];
  business: {
    id: string;
    name: string;
    currency: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    tax_id?: string | null;
    payment_settings?: PaymentSettings | null;
    stripe_charges_enabled?: boolean;
  };
};

type ManualInvoiceFormProps = {
  initialCustomerId?: string;
  invoiceId?: string;
  initialData?: EditModeInitialData;
  onSaved?: (payload: { invoiceId: string; data?: unknown }) => void;
  mode?: 'create' | 'edit';
  editInvoiceNumber?: string | null;
  disableSchedulePaymentActions?: boolean;
  /** When true (edit + invoiceId), render only the Payment schedule section — same UI and logic as Edit Invoice. */
  paymentScheduleOnly?: boolean;
  /** When true with paymentScheduleOnly, show Invoice Live Preview beside the schedule (desktop) / below (mobile). */
  paymentScheduleWithPreview?: boolean;
  /** Persisted payment schedule on server (e.g. Manage Payment); when set, overrides `invoice.use_payment_schedule` from initialData for lock rules. */
  paymentScheduleSavedOnServer?: boolean;
  /** Called when user discards an unsaved schedule (Manage Payment / paymentScheduleOnly). */
  onUnsavedPaymentScheduleDiscarded?: () => void;
  /** When set (Manage Payment), schedule "Mark paid" opens parent record-payment modal instead of inline confirm. */
  onOpenRecordPaymentFromSchedule?: (args: { scheduleItemId: string; installmentAmount: number }) => void;
  /** Embedded in Assistant invoice workspace modal: compact chrome, split layout from `lg`, live preview beside form. */
  workspaceEmbed?: boolean;
  /** Leave edit workspace (view mode in parent); replaces Cancel when `workspaceEmbed`. */
  onWorkspaceBack?: () => void;
  /** Below `lg`: show only form or only live preview (parent-driven tabs). Omit for stacked form+preview on mobile. */
  workspaceMobilePanel?: 'form' | 'preview';
  /** `form` attribute linkage for external Save button in parent (mobile top bar). */
  htmlFormId?: string;
  /** When true with `workspaceEmbed`, hide bottom Back/Save row (parent provides chrome). */
  workspaceMobileSuppressFooter?: boolean;
};

type InvoiceFormHeaderProps = {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  mode: 'create' | 'edit';
  status?: string;
};

function InvoiceFormHeader({ backHref, backLabel, title, subtitle, mode, status }: InvoiceFormHeaderProps) {
  const normalizedStatus = (status ?? '').trim().toLowerCase();
  const statusLabel = normalizedStatus ? normalizedStatus[0]?.toUpperCase() + normalizedStatus.slice(1) : '';

  return (
    <header className="mb-6 border-b border-slate-200/80 pb-5 dark:border-slate-800/90 sm:mb-7 sm:pb-6">
      <div className="flex flex-col gap-2">
        <Link
          href={backHref}
          className="-mx-1 inline-flex w-fit items-center rounded-lg px-1 py-0.5 text-sm text-slate-500 transition-colors hover:bg-indigo-500/[0.06] hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-300"
        >
          ← {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
          {mode === 'edit' && statusLabel ? (
            <span className="inline-flex h-6 items-center rounded-full border border-slate-300 bg-slate-50 px-2.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {statusLabel}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p> : null}
      </div>
    </header>
  );
}

const defaultLineItem: LineItem = {
  name: '',
  description: '',
  quantity: 1,
  unit_label: 'item',
  unit_price: 0,
  tax_percent: 0,
  assignee: '',
};

const defaultScheduleRows: PaymentScheduleRow[] = [
  { description: 'Deposit', percentage: 30, amount: 0, due_date: '' },
  { description: 'Balance', percentage: 70, amount: 0, due_date: '' },
];

/** Hide native number-input spinners (WebKit/Firefox) for cleaner invoice line numeric fields. */
const INVOICE_LINE_NUMBER_NO_SPINNER =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function roundPercent(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** 0 = deposit, 1 = installments, 3 = refund audit rows (last) */
function getPaymentScheduleRowSortTier(row: Pick<PaymentScheduleRow, 'description' | 'status'>): number {
  if (row.status === 'refund') return 3;
  const t = String(row.description ?? '').trim().toLowerCase();
  if (t === 'deposit' || t.startsWith('deposit ')) return 0;
  return 1;
}

/** Deposit first, then due date ascending, then original index for stability */
function sortPaymentScheduleRows(rows: PaymentScheduleRow[]): PaymentScheduleRow[] {
  const decorated = rows.map((row, origIndex) => ({ row, origIndex }));
  decorated.sort((a, b) => {
    const ta = getPaymentScheduleRowSortTier(a.row);
    const tb = getPaymentScheduleRowSortTier(b.row);
    if (ta !== tb) return ta - tb;
    const da = a.row.due_date || '';
    const db = b.row.due_date || '';
    if (da !== db) return da.localeCompare(db);
    return a.origIndex - b.origIndex;
  });
  return decorated.map((d) => d.row);
}

function applyScheduleRemainderToLastRow(rows: PaymentScheduleRow[], invoiceTotal: number): PaymentScheduleRow[] {
  if (rows.length < 2) return rows;
  const next = rows.map((r) => ({ ...r }));
  let idx = next.length - 1;
  while (idx >= 0 && ((next[idx].status ?? 'pending') === 'paid' || next[idx].status === 'refund')) {
    idx -= 1;
  }
  if (idx < 0) return rows;
  const sumOthers = next.reduce((s, r, i) => (i === idx ? s : s + (Number(r.amount) || 0)), 0);
  const targetAmt = roundMoney(Math.max(0, invoiceTotal - sumOthers));
  const row = next[idx];
  next[idx] = {
    ...row,
    amount: targetAmt,
    percentage: invoiceTotal > 0 ? roundPercent((targetAmt / invoiceTotal) * 100) : 0,
    _lastEdited: row._lastEdited ?? 'auto',
  };
  return next;
}

/** Fix cent drift after splits so sum matches invoice total (adjust last pending row only). */
function snapPaymentScheduleSumToTotal(rows: PaymentScheduleRow[], invoiceTotal: number): PaymentScheduleRow[] {
  if (rows.length < 1) return rows;
  const target = roundMoney(invoiceTotal);
  const sorted = sortPaymentScheduleRows(rows);
  const sum = roundMoney(sorted.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const drift = roundMoney(target - sum);
  if (Math.abs(drift) < 0.0001) return sorted;
  const next = sorted.map((r) => ({ ...r }));
  let li = next.length - 1;
  while (li >= 0 && ((next[li].status ?? 'pending') === 'paid' || next[li].status === 'refund')) {
    li -= 1;
  }
  if (li < 0) return sorted;
  const r = next[li];
  const newAmt = roundMoney(Number(r.amount) + drift);
  if (!(newAmt > 0)) return sorted;
  next[li] = {
    ...r,
    amount: newAmt,
    percentage: target > 0 ? roundPercent((newAmt / target) * 100) : 0,
    _lastEdited: r._lastEdited ?? 'auto',
  };
  return next;
}

/** Same as snapPaymentScheduleSumToTotal but does not re-sort — keeps paid/unpaid partition stable after split/save. */
function snapPaymentScheduleSumToTotalPreserveOrder(rows: PaymentScheduleRow[], invoiceTotal: number): PaymentScheduleRow[] {
  if (rows.length < 1) return rows;
  const target = roundMoney(invoiceTotal);
  const sum = roundMoney(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  const drift = roundMoney(target - sum);
  if (Math.abs(drift) < 0.0001) return rows.map((r) => ({ ...r }));
  const next = rows.map((r) => ({ ...r }));
  let li = next.length - 1;
  while (li >= 0 && ((next[li].status ?? 'pending') === 'paid' || next[li].status === 'refund')) li -= 1;
  if (li < 0) return rows.map((r) => ({ ...r }));
  const r = next[li];
  const newAmt = roundMoney(Number(r.amount) + drift);
  if (!(newAmt > 0)) return rows.map((r) => ({ ...r }));
  next[li] = {
    ...r,
    amount: newAmt,
    percentage: target > 0 ? roundPercent((newAmt / target) * 100) : 0,
    _lastEdited: r._lastEdited ?? 'auto',
  };
  return next;
}

/** Paid rows first (stable), then unpaid — sequence for persistence without interleaving paid/unpaid. */
function partitionPaidThenUnpaid(rows: PaymentScheduleRow[]): PaymentScheduleRow[] {
  const sorted = sortPaymentScheduleRows(rows);
  const paid: PaymentScheduleRow[] = [];
  const unpaid: PaymentScheduleRow[] = [];
  const refunds: PaymentScheduleRow[] = [];
  for (const r of sorted) {
    if (r.status === 'refund') refunds.push({ ...r });
    else if ((r.status ?? 'pending') === 'paid') paid.push({ ...r });
    else unpaid.push({ ...r });
  }
  return [...paid, ...unpaid, ...refunds];
}

function sumUnpaidScheduleAmount(rows: PaymentScheduleRow[]): number {
  return roundMoney(
    rows.reduce((s, r) => {
      if (r.status === 'refund') return s;
      if ((r.status ?? 'pending') === 'paid') return s;
      return s + (Number(r.amount) || 0);
    }, 0)
  );
}

/** Adjust last pending row so sum(unpaid) matches remaining balance (invoice total − amount paid). */
function snapUnpaidScheduleToRemainingBalance(
  rows: PaymentScheduleRow[],
  remainingBalance: number,
  invoiceTotal: number
): PaymentScheduleRow[] {
  if (rows.length < 1) return rows;
  const target = roundMoney(remainingBalance);
  const next = rows.map((r) => ({ ...r }));
  const sumU = sumUnpaidScheduleAmount(next);
  const drift = roundMoney(target - sumU);
  if (Math.abs(drift) < 0.0001) return next;
  let li = next.length - 1;
  while (li >= 0 && ((next[li].status ?? 'pending') === 'paid' || next[li].status === 'refund')) li--;
  if (li < 0) return rows;
  const r = next[li];
  const newAmt = roundMoney(Number(r.amount) + drift);
  if (newAmt < -0.0001) return rows;
  const clamped = Math.max(0, newAmt);
  next[li] = {
    ...r,
    amount: clamped,
    percentage: invoiceTotal > 0 ? roundPercent((clamped / invoiceTotal) * 100) : 0,
    _lastEdited: r._lastEdited ?? 'auto',
  };
  return next;
}

function reconcilePaymentScheduleForSave(
  rows: PaymentScheduleRow[],
  invoiceTotal: number,
  remainingBalance: number,
  mode: 'new' | 'existing'
): PaymentScheduleRow[] {
  let next = partitionPaidThenUnpaid(rows);
  const rem = mode === 'existing' ? roundMoney(remainingBalance) : roundMoney(invoiceTotal);
  next = snapUnpaidScheduleToRemainingBalance(next, rem, invoiceTotal);
  // Preserve row order (do not re-sort) so paid/unpaid partition and split rows stay stable; when
  // sum(paid) + balanceDue === invoice total, drift is 0 and this does not fight snapUnpaid.
  next = snapPaymentScheduleSumToTotalPreserveOrder(next, invoiceTotal);
  return next;
}

function focusVisibleInvoiceDesc(index: number) {
  requestAnimationFrame(() => {
    const nodes = document.querySelectorAll(`[data-invoice-desc="${index}"]`);
    for (const n of Array.from(nodes)) {
      const el = n as HTMLElement;
      if (el.offsetParent !== null) {
        el.focus();
        break;
      }
    }
  });
}

function currencySymbol(code: string): string {
  const c = (code || '').toUpperCase();
  if (c === 'USD') return '$';
  if (c === 'EUR') return '€';
  if (c === 'GBP') return '£';
  if (c === 'CAD') return 'CA$';
  if (c === 'AUD') return 'A$';
  if (c === 'NZD') return 'NZ$';
  if (c === 'JPY') return '¥';
  return c;
}

function defaultScheduleForTotal(total: number, issueDate: string, dueDate: string): PaymentScheduleRow[] {
  const t = roundMoney(total);
  const depositPct = 30;
  const balancePct = 70;
  const deposit = roundMoney((t * depositPct) / 100);
  const balance = roundMoney(t - deposit);
  return [
    { description: 'Deposit', percentage: depositPct, amount: deposit, due_date: issueDate || '', _lastEdited: 'auto' },
    { description: 'Balance', percentage: balancePct, amount: balance, due_date: dueDate || issueDate || '', _lastEdited: 'auto' },
  ];
}

function formatDateLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mapInvoicePaymentScheduleApiToRows(items: unknown, invTotal: number): PaymentScheduleRow[] {
  if (!Array.isArray(items) || items.length < 1) return [];
  const rows: PaymentScheduleRow[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const amount = Number(r.amount ?? 0);
    const idRaw = r.id != null ? String(r.id).trim() : '';
    const stRaw = String(r.status ?? '').toLowerCase();
    const rowStatus: 'pending' | 'paid' | 'refund' =
      stRaw === 'paid' ? 'paid' : stRaw === 'refund' ? 'refund' : 'pending';
    rows.push({
      ...(idRaw ? { id: idRaw } : {}),
      description: String(r.description ?? ''),
      amount,
      due_date: r.due_date != null ? formatDateLocal(String(r.due_date)) : '',
      status: rowStatus,
      paid_at: r.paid_at != null ? String(r.paid_at) : null,
      percentage: invTotal > 0 ? roundPercent((amount / invTotal) * 100) : 0,
      _lastEdited: 'auto',
    });
  }
  return sortPaymentScheduleRows(rows);
}

function extractInvoicePaymentScheduleItems(data: Record<string, unknown> | null | undefined): unknown[] {
  if (!data || typeof data !== 'object') return [];
  const direct = data.invoice_payment_schedule_items;
  if (Array.isArray(direct) && direct.length > 0) return direct;
  const inv = data.invoice as Record<string, unknown> | undefined;
  if (inv && Array.isArray(inv.invoice_payment_schedule_items)) return inv.invoice_payment_schedule_items;
  const ps = data.paymentSchedule;
  if (Array.isArray(ps) && ps.length > 0) {
    return ps.map((raw) => {
      const p = raw as Record<string, unknown>;
      const st = String(p.status ?? '').toLowerCase();
      return {
        id: p.id,
        description: String(p.description ?? ''),
        amount: p.amount,
        due_date: p.due_date ?? p.dueDate,
        status: st === 'paid' ? 'paid' : st === 'refund' ? 'refund' : 'pending',
        paid_at: p.paid_at ?? null,
      };
    });
  }
  return [];
}

export default function ManualInvoiceForm({
  initialCustomerId,
  invoiceId,
  initialData,
  onSaved,
  mode,
  editInvoiceNumber,
  disableSchedulePaymentActions = false,
  paymentScheduleOnly = false,
  paymentScheduleWithPreview = false,
  paymentScheduleSavedOnServer,
  onUnsavedPaymentScheduleDiscarded,
  onOpenRecordPaymentFromSchedule,
  workspaceEmbed = false,
  onWorkspaceBack,
  workspaceMobilePanel,
  htmlFormId,
  workspaceMobileSuppressFooter = false,
}: ManualInvoiceFormProps = {}) {
  const supabase = createClient();
  const setupProgress = useDashboardSetupProgress();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [business, setBusiness] = useState<{
    id: string;
    name: string;
    currency: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    tax_id: string | null;
    payment_settings: PaymentSettings | null;
    stripe_charges_enabled: boolean;
  } | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  /** False only after the active workspace fetch settles (avoids treating in-flight state as “no business”). */
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  /** Bumps on cleanup and before each run so stale async completions cannot flip loading or render onboarding. */
  const workspaceFetchGen = useRef(0);
  /** Increment after inline business setup so workspace data is re-fetched without a full page reload. */
  const [workspaceLoadKey, setWorkspaceLoadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [lineItemErrors, setLineItemErrors] = useState<LineItemFieldErrors>({});
  const lastLineItemErrorsRef = useRef<LineItemFieldErrors>({});
  const lastErrorsRef = useRef<FormErrors>({});

  const [issueDate, setIssueDate] = useState(formatDateLocal(new Date().toISOString().slice(0, 10)));
  const [dueDate, setDueDate] = useState('');

  const [usePaymentSchedule, setUsePaymentSchedule] = useState(false);
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentScheduleRow[]>(
    defaultScheduleRows.map((r) => ({ ...r, _lastEdited: 'auto' }))
  );
  const paymentScheduleRef = useRef(paymentSchedule);
  paymentScheduleRef.current = paymentSchedule;
  const [amountPaid, setAmountPaid] = useState(0);
  /** Cumulative refunds; refunds reduce net paid and never increase balance above total. */
  const [totalRefunded, setTotalRefunded] = useState(0);
  const [balanceDue, setBalanceDue] = useState(0);
  const [scheduleActivationError, setScheduleActivationError] = useState<string | null>(null);
  const [scheduleRemovalError, setScheduleRemovalError] = useState<string | null>(null);
  const [isScheduleSavedOnServer, setIsScheduleSavedOnServer] = useState(false);
  const [scheduleActivationConfirmOpen, setScheduleActivationConfirmOpen] = useState(false);
  const bypassScheduleActivationConfirmRef = useRef(false);
  const invoiceFormRef = useRef<HTMLFormElement>(null);
  const savedScheduleFinancialBaselineRef = useRef({ amountPaid: 0, balanceDue: 0 });
  const [flashLineItems, setFlashLineItems] = useState(false);
  const lineItemsSectionRef = useRef<HTMLElement | null>(null);
  const customerSectionRef = useRef<HTMLElement | null>(null);
  const invoiceDetailsSectionRef = useRef<HTMLElement | null>(null);
  const issueDateInputRef = useRef<HTMLInputElement | null>(null);
  const dueDateInputRef = useRef<HTMLInputElement | null>(null);
  const customerInvoiceApplyGenRef = useRef(0);
  const [isUpdatingInvoice, setIsUpdatingInvoice] = useState(false);
  const [customerApplyMode, setCustomerApplyMode] = useState<'select' | 'create' | null>(null);
  const [showCustomerApplyFeedback, setShowCustomerApplyFeedback] = useState(false);
  // `window.setTimeout` returns a number in the browser; using `number` avoids Node `Timeout` type conflicts.
  const customerApplyFeedbackTimerRef = useRef<number | null>(null);
  const { showSuccessToast, showErrorToast } = useToasts();
  const { plan: billingPlan } = useBillingPlan();
  const automationUnlocked = hasPlanFeature(billingPlan, 'automation');
  const [upgradeModal, setUpgradeModal] = useState<UpgradeTrigger | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  const manualInvoiceReturnTo =
    pathname + (urlSearchParams.toString() ? `?${urlSearchParams.toString()}` : '');

  const [openScheduleMenuKey, setOpenScheduleMenuKey] = useState<string | null>(null);
  const [scheduleMenuPosition, setScheduleMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const scheduleMenuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [openScheduleSheet, setOpenScheduleSheet] = useState<{ key: string; index: number } | null>(null);
  const [scheduleSheetVisible, setScheduleSheetVisible] = useState(false);

  const [scheduleSwipeX, setScheduleSwipeX] = useState<Record<string, number>>({});
  const scheduleSwipeRef = useRef<{
    activeKey: string | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragging: boolean;
  }>({
    activeKey: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dragging: false,
  });

  type SchedulePaymentDismissAction = 'desktop_menu' | 'mobile_sheet' | 'swipe';
  const [schedulePaymentModal, setSchedulePaymentModal] = useState<{
    row: PaymentScheduleRow;
    dismiss: { action: SchedulePaymentDismissAction; swipeKey?: string };
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number } | null>(null);
  const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);
  const [deleteConfirmError, setDeleteConfirmError] = useState<string | null>(null);

  const [extendDateModal, setExtendDateModal] = useState<{ index: number; newDueDate: string } | null>(null);
  const [splitPaymentModal, setSplitPaymentModal] = useState<{
    index: number;
    parts: number;
    sourceRowId?: string;
  } | null>(null);
  const [scheduleActionError, setScheduleActionError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [createCustomerModalOpen, setCreateCustomerModalOpen] = useState(false);
  const [customerRequiredModalOpen, setCustomerRequiredModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [billingAddressLine1, setBillingAddressLine1] = useState('');
  const [billingAddressLine2, setBillingAddressLine2] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [billingCountry, setBillingCountry] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [useDeliveryAddress, setUseDeliveryAddress] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCountry, setDeliveryCountry] = useState('');
  const [deliveryCompany, setDeliveryCompany] = useState('');
  const [deliveryEmail, setDeliveryEmail] = useState('');
  const [deliveryContactPerson, setDeliveryContactPerson] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [customerNameTouched, setCustomerNameTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [notesTermsExpanded, setNotesTermsExpanded] = useState(false);
  const [showTimeSummary, setShowTimeSummary] = useState(false);
  const [referencePo, setReferencePo] = useState('');

  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...defaultLineItem }]);
  const [taxPercent, setTaxPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  /** UI toggle: only one discount input visible at a time (amount vs percent). */
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');

  const [invoiceCurrency, setInvoiceCurrency] = useState('USD');
  const [liveExchangeRate, setLiveExchangeRate] = useState(1);
  const [savedInvoiceStatus, setSavedInvoiceStatus] = useState<string>('draft');
  const [serverExchangeRate, setServerExchangeRate] = useState<number | null>(null);
  const [fxFetchError, setFxFetchError] = useState<string | null>(null);
  const [isFxFetching, setIsFxFetching] = useState(false);
  const isFxFetchingRef = useRef(false);
  isFxFetchingRef.current = isFxFetching;

  useEffect(() => {
    const gen = ++workspaceFetchGen.current;
    const isCurrent = () => gen === workspaceFetchGen.current;

    (async () => {
      if (initialData && invoiceId) {
        if (!isCurrent()) return;
        const { business: biz, invoice: inv, items: invItems } = initialData;
        setBusinessId(biz.id);
        setBusiness({
          id: biz.id,
          name: biz.name,
          currency: biz.currency ?? 'USD',
          address_line1: biz.address_line1 ?? null,
          address_line2: biz.address_line2 ?? null,
          city: biz.city ?? null,
          state: biz.state ?? null,
          postal_code: biz.postal_code ?? null,
          country: biz.country ?? null,
          tax_id: biz.tax_id ?? null,
          payment_settings: (biz.payment_settings as PaymentSettings | null) ?? null,
          stripe_charges_enabled: biz.stripe_charges_enabled ?? false,
        });
        setIssueDate(inv.issue_date ? formatDateLocal(inv.issue_date) : formatDateLocal(new Date().toISOString().slice(0, 10)));
        setUsePaymentSchedule(!!inv.use_payment_schedule);
        const ap0 = Number(inv.amount_paid ?? 0);
        const tr0 = Number((inv as { total_refunded?: number }).total_refunded ?? 0);
        const bd0 = Number(
          inv.balance_due ??
            Math.max(0, Number(inv.total ?? 0) - ap0 + tr0)
        );
        setAmountPaid(ap0);
        setTotalRefunded(tr0);
        setBalanceDue(bd0);
        savedScheduleFinancialBaselineRef.current = { amountPaid: ap0, balanceDue: bd0 };
        setIsScheduleSavedOnServer(
          paymentScheduleSavedOnServer !== undefined
            ? paymentScheduleSavedOnServer
            : !!inv.use_payment_schedule
        );
        setDueDate(inv.due_date ?? '');
        setCustomerId(inv.customer_id ?? null);
        setCustomerName(inv.customer_name ?? '');
        setCustomerEmail(inv.customer_email ?? '');
        setReferencePo(inv.reference_po ?? '');
        setNotes(inv.notes ?? '');
        setTerms(inv.terms ?? '');
        setShowTimeSummary(!!(inv as { show_time_summary?: boolean }).show_time_summary);
        const invDiscountAmt = Number(inv.discount_amount ?? 0);
        const invDiscountPct = Number((inv as { discount_percent?: number | null }).discount_percent ?? 0);
        setDiscountAmount(invDiscountAmt);
        setDiscountPercent(invDiscountPct);
        setDiscountMode(invDiscountAmt > 0 ? 'amount' : invDiscountPct > 0 ? 'percent' : 'amount');
        setTaxPercent(Number((inv as { tax_percent?: number | null }).tax_percent ?? 0));
        const normalizedInvCurrency = normalizeInvoiceCurrencyFields(
          {
            currency: (inv as { currency?: string }).currency ?? biz.currency ?? 'USD',
            base_currency_code: (inv as { base_currency_code?: string }).base_currency_code ?? biz.currency,
            exchange_rate_to_base: (inv as { exchange_rate_to_base?: number }).exchange_rate_to_base ?? null,
            subtotal: Number(inv.subtotal ?? 0),
            tax_amount: Number(inv.tax_amount ?? 0),
            total: Number(inv.total ?? 0),
            subtotal_in_base: (inv as { subtotal_in_base?: number }).subtotal_in_base ?? null,
            tax_amount_in_base: (inv as { tax_amount_in_base?: number }).tax_amount_in_base ?? null,
            total_in_base: (inv as { total_in_base?: number }).total_in_base ?? null,
          },
          biz.currency ?? 'USD'
        );
        setInvoiceCurrency(String(normalizedInvCurrency.currency));
        setSavedInvoiceStatus(String((inv as { status?: string }).status ?? 'draft'));
        const er = (inv as { exchange_rate_to_base?: number }).exchange_rate_to_base;
        const erNum = er != null ? Number(er) : null;
        setServerExchangeRate(erNum);
        setLiveExchangeRate(erNum != null && erNum > 0 ? erNum : 1);
        const meta = inv.metadata;
        if (meta) {
          const metaCompany = String(meta.company ?? '').trim();
          const metaName = String(inv.customer_name ?? '').trim();
          setCustomerCompany(
            metaCompany &&
              metaName &&
              metaCompany.toLowerCase() === metaName.toLowerCase()
              ? ''
              : metaCompany
          );
          setBillingAddressLine1(meta.billing_address_line1 ?? '');
          setBillingAddressLine2(meta.billing_address_line2 ?? '');
          setBillingAddress(
            meta.billing_address ??
              [
                meta.billing_address_line1,
                meta.billing_address_line2,
              ]
                .filter(Boolean)
                .join(', ')
          );
          setBillingCity(meta.billing_city ?? '');
          setBillingState(meta.billing_state ?? '');
          setBillingPostalCode(meta.billing_postal_code ?? '');
          setBillingCountry(meta.billing_country ? normalizeCountryCodeLocation(meta.billing_country) : '');
          setBillingPhone(meta.billing_phone ?? '');
          setContactPerson(meta.contact_person ?? '');
          setUseDeliveryAddress(!!meta.use_delivery_address);
          setDeliveryAddress(meta.delivery_address ?? '');
          setDeliveryCity(meta.delivery_city ?? '');
          setDeliveryState(meta.delivery_state ?? '');
          setDeliveryPostalCode(meta.delivery_postal_code ?? '');
          setDeliveryCountry(meta.delivery_country ? normalizeCountryCodeLocation(meta.delivery_country) : '');
          // Backward compatible mapping:
          // - New invoices: delivery_company + delivery_contact_person are stored separately.
          // - Legacy invoices: only delivery_contact_person existed; treat it as delivery_company.
          if (meta.delivery_company !== undefined) {
            setDeliveryCompany(meta.delivery_company ?? '');
            setDeliveryContactPerson(meta.delivery_contact_person ?? '');
          } else {
            setDeliveryCompany(meta.delivery_contact_person ?? '');
            setDeliveryContactPerson('');
          }
          setDeliveryEmail(meta.delivery_email ?? '');
          setDeliveryPhone(meta.delivery_phone ?? '');
        }
        setLineItems(
          invItems.length > 0
            ? invItems.map((i) => ({
                name: i.name,
                description: i.description ?? '',
                quantity: i.quantity,
                unit_label: normalizeInvoiceUnitLabel(
                  (i as { unit_label?: string | null }).unit_label ?? 'item'
                ),
                unit_price: i.unit_price,
                tax_percent: i.tax_percent ?? 0,
                assignee: String((i as { assignee?: string | null }).assignee ?? '').trim(),
              }))
            : [{ ...defaultLineItem }]
        );

        if (isCurrent()) {
          const invTotal = Number(inv.total ?? 0);
          const scheduleFromInvoice = (inv as { paymentSchedule?: PaymentScheduleRow[] }).paymentSchedule;
          const fromApi = mapInvoicePaymentScheduleApiToRows(
            initialData.payment_schedule ?? scheduleFromInvoice ?? [],
            invTotal
          );
          setPaymentSchedule(
            fromApi.length > 0
              ? fromApi
              : sortPaymentScheduleRows(defaultScheduleRows.map((r) => ({ ...r, _lastEdited: 'auto' as const })))
          );
        }
        const { data: cust } = await supabase.from('customers').select('*').eq('business_id', biz.id).order('name');
        if (!isCurrent()) return;
        setCustomers(cust ?? []);
        const selected = (cust ?? []).find((c) => c.id === (inv.customer_id ?? null));
        if (selected) {
          setSelectedCustomer(selected as Customer);
        } else {
          setSelectedCustomer(null);
        }
        setWorkspaceLoading(false);
        return;
      }

      let user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        const { data: sessionData } = await supabase.auth.getSession();
        user = sessionData.session?.user ?? null;
      }
      if (!isCurrent()) return;
      if (!user) {
        setBusinessId(null);
        setBusiness(null);
        setCustomers([]);
        setWorkspaceLoading(false);
        return;
      }
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, name, currency, invoice_settings, address_line1, address_line2, city, state, postal_code, country, tax_id, payment_settings, stripe_charges_enabled')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (!isCurrent()) return;
      if (!biz) {
        setBusinessId(null);
        setBusiness(null);
        setCustomers([]);
        setWorkspaceLoading(false);
        return;
      }
      setBusinessId(biz.id);
      const defaultCurrency = getBusinessBaseCurrency(
        biz as {
          currency?: string | null;
          invoice_settings?: { default_currency?: string | null } | null;
        }
      );
      setBusiness({
        id: biz.id,
        name: biz.name,
        currency: defaultCurrency,
        address_line1: biz.address_line1 ?? null,
        address_line2: biz.address_line2 ?? null,
        city: biz.city ?? null,
        state: biz.state ?? null,
        postal_code: biz.postal_code ?? null,
        country: biz.country ?? null,
        tax_id: biz.tax_id ?? null,
        payment_settings: (biz.payment_settings as PaymentSettings | null) ?? null,
        stripe_charges_enabled: biz.stripe_charges_enabled ?? false,
      });
      setInvoiceCurrency(String(defaultCurrency).toUpperCase());
      setSavedInvoiceStatus('draft');
      setServerExchangeRate(null);
      setLiveExchangeRate(1);
      const { data: cust } = await supabase.from('customers').select('*').eq('business_id', biz.id).order('name');
      if (!isCurrent()) return;
      setCustomers(cust ?? []);

      if (initialCustomerId && (cust ?? []).length > 0) {
        const prefill = (cust ?? []).find((c) => c.id === initialCustomerId);
        if (prefill) {
          setSelectedCustomer(prefill as Customer);
          setCustomerId(prefill.id);
          const prefCur = (prefill as { preferred_currency_code?: string | null }).preferred_currency_code;
          setInvoiceCurrency(
            resolveInvoiceTransactionCurrency({
              businessBase: defaultCurrency,
              customerPreferred: prefCur,
              invoiceCurrencyOverride: null,
            })
          );
          const displayName = (prefill.company ?? '').trim() || (prefill.name ?? '').trim();
          if (displayName) {
            setCustomerName(displayName);
          }
          if ((prefill.email ?? '').trim()) setCustomerEmail(prefill.email ?? '');
          if ((prefill.name ?? '').trim()) setContactPerson(prefill.name ?? '');
          setCustomerCompany('');
          setBillingAddressLine1((prefill.address_line1 ?? '').trim());
          setBillingAddressLine2((prefill.address_line2 ?? '').trim());
          const joinedAddress = [prefill.address_line1, prefill.address_line2].filter(Boolean).join(', ').trim();
          if (joinedAddress) setBillingAddress(joinedAddress);
          if ((prefill.city ?? '').trim()) setBillingCity(prefill.city ?? '');
          if ((prefill.postal_code ?? '').trim()) setBillingPostalCode(prefill.postal_code ?? '');
          const countryCode = resolveCountryCode(prefill.country ?? '');
          if (countryCode) {
            setBillingCountry(countryCode);
            const nextState = resolveStateCode(countryCode, prefill.state ?? '');
            if (nextState) setBillingState(nextState);
          } else if ((prefill.state ?? '').trim()) {
            setBillingState(prefill.state ?? '');
          }
        }
      }
      if (isCurrent()) setWorkspaceLoading(false);
    })().catch(() => {
      if (isCurrent()) {
        setWorkspaceLoading(false);
      }
    });
    return () => {
      workspaceFetchGen.current += 1;
    };
  }, [supabase, initialCustomerId, invoiceId, initialData, paymentScheduleSavedOnServer, workspaceLoadKey]);

  const applyCustomerAutofill = useCallback((c: Customer) => {
    const displayName = (c.company ?? '').trim() || (c.name ?? '').trim();
    if (displayName) {
      setCustomerName(displayName);
    }
    if ((c.email ?? '').trim()) setCustomerEmail(c.email ?? '');
    if ((c.name ?? '').trim()) setContactPerson(c.name ?? '');
    if ((c.phone ?? '').trim()) setBillingPhone(formatPhoneForDisplay(c.phone ?? ''));

    // Company in invoice billing is "if different", so keep empty by default.
    setCustomerCompany('');

    setBillingAddressLine1((c.address_line1 ?? '').trim());
    setBillingAddressLine2((c.address_line2 ?? '').trim());
    const joinedAddress = [c.address_line1, c.address_line2].filter(Boolean).join(', ').trim();
    if (joinedAddress) setBillingAddress(joinedAddress);
    if ((c.city ?? '').trim()) setBillingCity(c.city ?? '');
    if ((c.postal_code ?? '').trim()) setBillingPostalCode(c.postal_code ?? '');

    const countryCode = resolveCountryCode(c.country ?? '');
    if (countryCode) {
      setBillingCountry(countryCode);
      const nextState = resolveStateCode(countryCode, c.state ?? '');
      if (nextState) setBillingState(nextState);
    } else if ((c.state ?? '').trim()) {
      setBillingState(c.state ?? '');
    }
    const prefCur = (c as { preferred_currency_code?: string | null }).preferred_currency_code;
    setInvoiceCurrency(
      resolveInvoiceTransactionCurrency({
        businessBase: business?.currency ?? 'USD',
        customerPreferred: prefCur,
        invoiceCurrencyOverride: null,
      })
    );
  }, [business?.currency]);

  useEffect(() => {
    if (!business) {
      setIsFxFetching(false);
      return;
    }
    const base = (business.currency ?? 'USD').toUpperCase();
    const inv = invoiceCurrency.trim().toUpperCase();
    if (inv === base) {
      setLiveExchangeRate(1);
      setFxFetchError(null);
      setIsFxFetching(false);
      return;
    }
    if (savedInvoiceStatus !== 'draft') {
      setLiveExchangeRate(serverExchangeRate != null && serverExchangeRate > 0 ? serverExchangeRate : 1);
      setFxFetchError(null);
      setIsFxFetching(false);
      return;
    }
    let cancelled = false;
    setFxFetchError(null);
    setIsFxFetching(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/exchange-rate?from=${encodeURIComponent(inv)}&to=${encodeURIComponent(base)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Rate unavailable');
        setLiveExchangeRate(Number(data.rate));
      } catch (e) {
        if (!cancelled) {
          setFxFetchError(e instanceof Error ? e.message : 'FX error');
          setLiveExchangeRate(serverExchangeRate != null && serverExchangeRate > 0 ? serverExchangeRate : 1);
        }
      } finally {
        if (!cancelled) setIsFxFetching(false);
      }
    })();
    return () => {
      cancelled = true;
      setIsFxFetching(false);
    };
  }, [business, invoiceCurrency, savedInvoiceStatus, serverExchangeRate]);

  const yieldForPaint = useCallback(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
    []
  );

  useEffect(() => {
    if (!isUpdatingInvoice) {
      setShowCustomerApplyFeedback(false);
      if (customerApplyFeedbackTimerRef.current) window.clearTimeout(customerApplyFeedbackTimerRef.current);
      customerApplyFeedbackTimerRef.current = null;
      return;
    }

    if (customerApplyFeedbackTimerRef.current) window.clearTimeout(customerApplyFeedbackTimerRef.current);
    customerApplyFeedbackTimerRef.current = window.setTimeout(() => {
      setShowCustomerApplyFeedback(true);
    }, 300);

    return () => {
      if (customerApplyFeedbackTimerRef.current) window.clearTimeout(customerApplyFeedbackTimerRef.current);
      customerApplyFeedbackTimerRef.current = null;
    };
  }, [isUpdatingInvoice]);

  const waitForFxSettle = useCallback(
    async (maxWaitMs = 8000) => {
      const start = Date.now();
      let fetchStarted = isFxFetchingRef.current;

      while (Date.now() - start < maxWaitMs) {
        await yieldForPaint();

        if (isFxFetchingRef.current) fetchStarted = true;

        // If the fetch started, wait until it finishes.
        if (fetchStarted && !isFxFetchingRef.current) return;

        // If nothing started soon after the customer change, stop waiting so we don't
        // block the UI unnecessarily.
        if (!fetchStarted && Date.now() - start > 400) return;
      }
    },
    [yieldForPaint]
  );

  const onInvoiceCustomerIdChange = useCallback(
    (id: string) => {
      setCustomerNameTouched(true);

      if (!id) {
        customerInvoiceApplyGenRef.current += 1;
        setIsUpdatingInvoice(false);
        setCustomerApplyMode(null);
        setCustomerId(null);
        setSelectedCustomer(null);
        setCustomerName('');
        setCustomerEmail('');
        setCustomerCompany('');
        setBillingAddressLine1('');
        setBillingAddressLine2('');
        setBillingAddress('');
        setBillingCity('');
        setBillingState('');
        setBillingPostalCode('');
        setBillingCountry('');
        setBillingPhone('');
        setContactPerson('');
        setErrors((prev) => {
          const next = { ...prev, customer_name: 'Please select a customer' };
          delete next.delivery;
          return next;
        });
        return;
      }

      const c = customers.find((x) => x.id === id) ?? null;
      if (!c) return;

      const gen = (customerInvoiceApplyGenRef.current += 1);
      setIsUpdatingInvoice(true);
      setCustomerApplyMode('select');

      void (async () => {
        await yieldForPaint();
        if (gen !== customerInvoiceApplyGenRef.current) return;

        try {
          setCustomerId(c.id);
          setSelectedCustomer(c);
          setCustomerName((c.company ?? '').trim() || (c.name ?? '').trim());
          setErrors((prev) => {
            const next = { ...prev };
            delete next.customer_name;
            return next;
          });
          applyCustomerAutofill(c);
          await yieldForPaint();
          await waitForFxSettle();
          showSuccessToast('Customer added to invoice');
          await yieldForPaint();
        } finally {
          if (gen === customerInvoiceApplyGenRef.current) {
            setIsUpdatingInvoice(false);
            setCustomerApplyMode(null);
          }
        }
      })();
    },
    [customers, applyCustomerAutofill, waitForFxSettle, yieldForPaint]
  );

  const handleCustomerCreated = useCallback(
    async (customer?: Customer) => {
      if (!customer?.id) return;

      const gen = (customerInvoiceApplyGenRef.current += 1);
      setIsUpdatingInvoice(true);
      setCustomerApplyMode('create');

      await yieldForPaint();
      if (gen !== customerInvoiceApplyGenRef.current) return;

      try {
        setCustomers((prev) => {
          const withoutNew = prev.filter((c) => c.id !== customer.id);
          return [...withoutNew, customer].sort((a, b) =>
            String((a.company ?? a.name ?? '').trim()).localeCompare(
              String((b.company ?? b.name ?? '').trim()),
              undefined,
              { sensitivity: 'base' }
            )
          );
        });

        setCustomerNameTouched(true);
        setCustomerId(customer.id);
        setSelectedCustomer(customer);
        setErrors((prev) => {
          const next = { ...prev };
          delete next.customer_name;
          return next;
        });
        applyCustomerAutofill(customer);
        setCreateCustomerModalOpen(false);

        await yieldForPaint();
        await waitForFxSettle();
        showSuccessToast('Customer added to invoice');
        await yieldForPaint();
      } finally {
        if (gen === customerInvoiceApplyGenRef.current) {
          setIsUpdatingInvoice(false);
          setCustomerApplyMode(null);
        }
      }
    },
    [applyCustomerAutofill, waitForFxSettle, yieldForPaint]
  );

  useEffect(() => {
    if (notes.trim() || terms.trim()) setNotesTermsExpanded(true);
  }, [notes, terms]);

  const clearFieldError = useCallback((field: keyof FormErrors) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearLineItemFieldError = useCallback((index: number, field: 'quantity' | 'unit_price') => {
    setLineItemErrors((prev) => {
      const next = { ...prev };
      if (next[index]) {
        const row = { ...next[index] };
        delete row[field];
        if (Object.keys(row).length === 0) delete next[index];
        else next[index] = row;
      }
      return next;
    });
  }, []);

  const updateLineItem = useCallback((index: number, updates: Partial<LineItem>) => {
    clearFieldError('items');
    if ('quantity' in updates) clearLineItemFieldError(index, 'quantity');
    if ('unit_price' in updates) clearLineItemFieldError(index, 'unit_price');
    setLineItems((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }, [clearFieldError, clearLineItemFieldError]);

  const addLineItem = useCallback(() => {
    clearFieldError('items');
    setLineItems((prev) => [...prev, { ...defaultLineItem }]);
  }, [clearFieldError]);

  const removeLineItem = useCallback((index: number) => {
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const { subtotal, totalTax, total, discount: effectiveDiscount, invoiceTax } = useMemo(() => {
    let st = 0;
    let taxSum = 0;
    lineItems.forEach((item) => {
      const lineTotal = item.quantity * item.unit_price;
      st += lineTotal;
      taxSum += lineTotal * (item.tax_percent / 100);
    });
    const discount = resolveDiscountAmount(st, {
      discount_amount: discountAmount,
      discount_percent: discountPercent,
    });
    const afterDiscount = st - discount;
    const invoiceTax = afterDiscount * (taxPercent / 100);
    const totalValue = afterDiscount + invoiceTax + taxSum;
    return { subtotal: st, totalTax: taxSum + invoiceTax, total: totalValue, discount, invoiceTax };
  }, [lineItems, taxPercent, discountAmount, discountPercent]);

  /** Derived from computed `total` and recorded `amountPaid` — always matches line items / tax / discount. */
  const liveBalanceDue = useMemo(
    () => computeInvoiceBalanceDue(total, amountPaid, totalRefunded),
    [total, amountPaid, totalRefunded]
  );
  const netPaidDisplayed = useMemo(
    () => roundMoney(Math.max(0, amountPaid - totalRefunded)),
    [amountPaid, totalRefunded]
  );

  /** Amount-mode discount greater than line subtotal (inline + submit validation). */
  const discountExceedsSubtotal = useMemo(() => {
    if (discountMode !== 'amount') return false;
    const da = Number(discountAmount) || 0;
    if (da <= 0) return false;
    return da > roundMoney(subtotal) + 1e-9;
  }, [discountMode, discountAmount, subtotal]);

  useEffect(() => {
    if (!discountExceedsSubtotal) clearFieldError('discount');
  }, [discountExceedsSubtotal, clearFieldError]);

  const epdPreview = useMemo(() => {
    return computeEarlyPaymentDiscount({
      settings: business?.payment_settings ?? null,
      issue_date: issueDate || null,
      now: new Date(),
      balance_due: liveBalanceDue,
    });
  }, [business?.payment_settings, issueDate, liveBalanceDue]);

  const timeSummaryPreview = useMemo(
    () =>
      buildInvoiceTimeSummaryDoc(
        lineItems.map((i) => ({
          quantity: i.quantity,
          unit_price: i.unit_price,
          amount: i.quantity * i.unit_price,
          unit_label: i.unit_label,
          tax_percent: i.tax_percent,
          assignee: i.assignee,
        })),
        {
          show: showTimeSummary,
          currencyCode: invoiceCurrency,
          formatMoney: (amount, code) => formatMoneyCodeFirst(amount, code),
        }
      ),
    [lineItems, showTimeSummary, invoiceCurrency]
  );

  const baseCurrencyCode = (business?.currency ?? 'USD').toUpperCase();
  const invCurUpper = getInvoicePreviewCurrency(
    { currency: invoiceCurrency, base_currency_code: baseCurrencyCode },
    baseCurrencyCode
  );
  const showFxPanel = invCurUpper !== baseCurrencyCode;
  const displayFxRate =
    savedInvoiceStatus !== 'draft' && serverExchangeRate != null && serverExchangeRate > 0
      ? serverExchangeRate
      : liveExchangeRate;
  const convertedTotalPreview = roundMoney2(total * (showFxPanel ? displayFxRate : 1));
  const currencySelectorLocked = !canEditInvoiceCurrency(savedInvoiceStatus);

  const customerSelectOptions = useMemo(
    () =>
      customers.map((c) => ({
        id: c.id,
        label: (c.company ?? '').trim() || (c.name ?? '').trim() || 'Customer',
        company: c.company,
        email: c.email,
      })),
    [customers]
  );

  const paymentScheduleOrdered = useMemo(
    () => sortPaymentScheduleRows(paymentSchedule),
    [paymentSchedule]
  );

  const [invoice, setInvoice] = useState<{ id?: string; paymentSchedule: PaymentScheduleRow[] }>({
    paymentSchedule: [],
  });

  useEffect(() => {
    setInvoice({
      id: invoiceId ?? undefined,
      paymentSchedule: sortPaymentScheduleRows(paymentSchedule),
    });
  }, [invoiceId, paymentSchedule]);

  const scheduleSum = useMemo(
    () => paymentScheduleOrdered.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [paymentScheduleOrdered]
  );
  const unpaidScheduleSum = useMemo(() => {
    return paymentScheduleOrdered.reduce((s, r) => {
      const st = (r.status ?? 'pending') as 'pending' | 'paid';
      if (st === 'paid') return s;
      return s + (Number(r.amount) || 0);
    }, 0);
  }, [paymentScheduleOrdered]);
  const hasPartialPayment = useMemo(() => amountPaid > 0.0001, [amountPaid]);
  const hasRecordedPayments = useMemo(
    () =>
      amountPaid > 0.0001 ||
      paymentSchedule.some((r) => (r.status ?? 'pending') === 'paid'),
    [amountPaid, paymentSchedule]
  );
  const criticalFieldsLocked = hasPartialPayment;
  const itemMemoryBusinessId = business?.id ?? businessId;
  const isScheduleEnabled = usePaymentSchedule;
  const isScheduleSaved = isScheduleSavedOnServer;
  const hasRecordedPayment = hasRecordedPayments;
  const cannotUncheckPaymentSchedule =
    isScheduleEnabled && (isScheduleSaved || hasRecordedPayment);
  const scheduleUnpaidMismatch = useMemo(() => {
    if (!usePaymentSchedule) return false;
    if (!invoiceId) return false;
    return Math.abs(unpaidScheduleSum - liveBalanceDue) > 0.12;
  }, [usePaymentSchedule, invoiceId, unpaidScheduleSum, liveBalanceDue]);

  const canDeleteScheduleRowAt = useCallback((index: number) => {
    if (paymentScheduleOrdered.length <= 1) return false;
    const deletingRow = paymentScheduleOrdered[index];
    if (!deletingRow) return false;
    const rowStatus = (deletingRow.status ?? 'pending') as 'pending' | 'paid';
    if (rowStatus === 'paid') return false;
    const unpaidCount = paymentScheduleOrdered.filter((r) => (r.status ?? 'pending') !== 'paid').length;
    if (unpaidCount <= 1) return false;
    return true;
  }, [paymentScheduleOrdered]);

  const schedulePercentSum = useMemo(
    () => paymentScheduleOrdered.reduce((s, r) => s + (Number(r.percentage) || 0), 0),
    [paymentScheduleOrdered]
  );
  const maxScheduleDueDate = useMemo(() => {
    const dates = paymentScheduleOrdered.map((r) => r.due_date).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : '';
  }, [paymentScheduleOrdered]);

  useEffect(() => {
    if (!usePaymentSchedule) return;
    setPaymentSchedule((prev) => {
      if (prev.length < 1) return prev;
      const synced = prev.map((r) => {
        const pct = Number(r.percentage) || 0;
        const amt = Number(r.amount) || 0;
        if (r._lastEdited === 'percentage') {
          return { ...r, amount: roundMoney((total * pct) / 100) };
        }
        if (r._lastEdited === 'amount') {
          return { ...r, percentage: total > 0 ? roundPercent((amt / total) * 100) : 0 };
        }
        if (total > 0 && pct > 0) return { ...r, amount: roundMoney((total * pct) / 100) };
        if (total > 0 && amt > 0) return { ...r, percentage: roundPercent((amt / total) * 100) };
        return r;
      });

      let ordered = sortPaymentScheduleRows(synced);
      if (ordered.length >= 2) {
        ordered = applyScheduleRemainderToLastRow(ordered, total);
      }
      return ordered;
    });
  }, [total, usePaymentSchedule]);

  const closeScheduleMenu = useCallback(() => {
    setOpenScheduleMenuKey(null);
    setScheduleMenuPosition(null);
  }, []);

  const closeScheduleSheet = useCallback(() => {
    setScheduleSheetVisible(false);
    window.setTimeout(() => setOpenScheduleSheet(null), 180);
  }, []);

  const setSwipeX = useCallback((key: string, x: number) => {
    setScheduleSwipeX((prev) => {
      const curr = prev[key] ?? 0;
      if (curr === x) return prev;
      return { ...prev, [key]: x };
    });
  }, []);

  const resetSwipe = useCallback((key: string) => {
    setSwipeX(key, 0);
  }, [setSwipeX]);

  const handleSchedulePointerDown = useCallback((key: string, e: React.PointerEvent) => {
    // Only enable swipe for touch/pen (mobile).
    if (e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement | null;
    // Don't start swipe when tapping the 3-dot menu button.
    if (target?.closest?.('[data-payment-schedule-menu-button="true"]')) return;
    scheduleSwipeRef.current.activeKey = key;
    scheduleSwipeRef.current.pointerId = e.pointerId;
    scheduleSwipeRef.current.startX = e.clientX;
    scheduleSwipeRef.current.startY = e.clientY;
    scheduleSwipeRef.current.lastX = e.clientX;
    scheduleSwipeRef.current.lastY = e.clientY;
    scheduleSwipeRef.current.dragging = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const handleSchedulePointerMove = useCallback((key: string, e: React.PointerEvent) => {
    const ref = scheduleSwipeRef.current;
    if (ref.activeKey !== key || ref.pointerId !== e.pointerId) return;
    if (e.pointerType === 'mouse') return;
    const dx = e.clientX - ref.startX;
    const dy = e.clientY - ref.startY;
    ref.lastX = e.clientX;
    ref.lastY = e.clientY;

    // Start dragging only after a small horizontal threshold, and only if horizontal dominates.
    if (!ref.dragging) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) return;
      ref.dragging = true;
    }

    // Clamp swipe distance.
    const clamped = Math.max(-180, Math.min(180, dx));
    setSwipeX(key, clamped);
  }, [setSwipeX]);

  const handleSchedulePointerEnd = useCallback((key: string, e: React.PointerEvent) => {
    const ref = scheduleSwipeRef.current;
    if (ref.activeKey !== key || ref.pointerId !== e.pointerId) return;
    if (e.pointerType === 'mouse') return;

    const x = scheduleSwipeX[key] ?? 0;
    const abs = Math.abs(x);
    const fullTrigger = 150;
    const reveal = 72;
    if (abs >= fullTrigger) {
      // Leave the action execution to the button handlers (full swipe just reveals).
      setSwipeX(key, x > 0 ? 96 : -96);
    } else if (abs >= reveal) {
      setSwipeX(key, x > 0 ? 96 : -96);
    } else {
      resetSwipe(key);
    }

    ref.activeKey = null;
    ref.pointerId = null;
    ref.dragging = false;
  }, [scheduleSwipeX, setSwipeX, resetSwipe]);

  useEffect(() => {
    if (!openScheduleMenuKey) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const menuEl = typeof document !== 'undefined' ? document.getElementById('payment-schedule-row-menu') : null;
      const fromButton = Object.values(scheduleMenuButtonRefs.current).some((btn) => btn && btn.contains(target));
      if (menuEl && !menuEl.contains(target) && !fromButton) closeScheduleMenu();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [openScheduleMenuKey, closeScheduleMenu]);

  useEffect(() => {
    if (!openScheduleSheet) return;
    setScheduleSheetVisible(false);
    const raf = window.requestAnimationFrame(() => setScheduleSheetVisible(true));
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeScheduleSheet();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openScheduleSheet, closeScheduleSheet]);

  const validate = useCallback((): boolean => {
    const e: FormErrors = {};
    if (!customerName.trim()) e.customer_name = 'Please select a customer';
    if (!issueDate.trim()) e.issue_date = 'Issue date is required.';
    if (!usePaymentSchedule) {
      if (!dueDate.trim()) e.due_date = 'Due date is required.';
      else if (issueDate && dueDate < issueDate) e.due_date = 'Due date must be on or after issue date.';
    } else {
      // Schedule rows must have amount + due_date, and sum to invoice total.
      const effectiveDue = (r: (typeof paymentScheduleOrdered)[0]) =>
        String(r.due_date ?? '').trim() ||
        String(issueDate ?? '').trim() ||
        String(dueDate ?? '').trim() ||
        String(maxScheduleDueDate ?? '').trim();
      const missing = paymentScheduleOrdered.some(
        (r) => !r.description.trim() || !effectiveDue(r) || !(Number(r.amount) > 0)
      );
      if (missing) e.due_date = 'Each payment schedule row must have description, due date, and amount.';
      if (issueDate && maxScheduleDueDate && maxScheduleDueDate < issueDate) e.due_date = 'Schedule due dates must be on or after issue date.';
      if (invoiceId) {
        const u = sumUnpaidScheduleAmount(paymentScheduleOrdered);
        if (Math.abs(u - roundMoney(liveBalanceDue)) > 0.12) {
          e.due_date = 'Unpaid installments must equal the remaining balance.';
        }
      }
    }

    const lineErrors: LineItemFieldErrors = {};
    lineItems.forEach((item, index) => {
      const row: { name?: string; quantity?: string; unit_price?: string } = {};

      if (!item.name.trim()) {
        row.name = 'Item name is required';
      }
      if (item.quantity <= 0 || Number.isNaN(item.quantity)) {
        row.quantity = item.quantity === 0 ? 'Quantity is required' : 'Quantity must be greater than 0';
      }
      const priceEmpty = item.unit_price === 0 || item.unit_price === undefined || item.unit_price === null;
      const priceInvalid = typeof item.unit_price !== 'number' || Number.isNaN(item.unit_price) || item.unit_price < 0;
      if (priceInvalid || priceEmpty) {
        row.unit_price = priceEmpty && !priceInvalid ? 'Rate is required' : 'Enter a valid rate';
      }
      if (Object.keys(row).length > 0) lineErrors[index] = row;
    });
    lastLineItemErrorsRef.current = lineErrors;
    lastErrorsRef.current = e;
    setLineItemErrors(lineErrors);

    const hasValidItem = lineItems.some((i) => i.name.trim() && i.quantity > 0 && typeof i.unit_price === 'number' && !Number.isNaN(i.unit_price) && i.unit_price > 0);
    if (!hasValidItem) e.items = 'Add at least one item';
    if (useDeliveryAddress) {
      if (!deliveryAddress.trim()) e.delivery = 'Delivery street address is required.';
      else if (!deliveryCity.trim()) e.delivery = 'Delivery city is required.';
      else if (!resolveCountryCode(deliveryCountry)) e.delivery = 'Delivery country is required.';
    }

    let subtotalCalc = 0;
    lineItems.forEach((item) => {
      subtotalCalc += item.quantity * item.unit_price;
    });
    subtotalCalc = roundMoney(subtotalCalc);
    if (discountMode === 'amount') {
      const da = Number(discountAmount) || 0;
      if (da > 0 && da > subtotalCalc + 1e-9) {
        e.discount = "Discount can't exceed subtotal.";
      }
    }

    lastErrorsRef.current = e;
    setErrors(e);
    return Object.keys(e).length === 0 && Object.keys(lineErrors).length === 0;
  }, [
    customerName,
    dueDate,
    issueDate,
    lineItems,
    usePaymentSchedule,
    paymentScheduleOrdered,
    total,
    maxScheduleDueDate,
    useDeliveryAddress,
    deliveryAddress,
    deliveryCity,
    deliveryCountry,
    invoiceId,
    liveBalanceDue,
    discountMode,
    discountAmount,
  ]);

  const updateScheduleRow = useCallback(
    (index: number, updates: Partial<PaymentScheduleRow>, source?: 'percentage' | 'amount') => {
      setPaymentSchedule((prev) => {
        const sortedPrev = sortPaymentScheduleRows(prev);
        const next = [...sortedPrev];
        const row = next[index];
        if (!row) return sortedPrev;
        if ((row.status ?? 'pending') === 'paid') return sortedPrev;

        const merged: PaymentScheduleRow = { ...row, ...updates };
        if (source === 'percentage') merged._lastEdited = 'percentage';
        if (source === 'amount') merged._lastEdited = 'amount';

        const pct = Number(merged.percentage) || 0;
        const amt = Number(merged.amount) || 0;
        if (source === 'percentage') {
          merged.amount = roundMoney((total * pct) / 100);
        } else if (source === 'amount') {
          merged.percentage = total > 0 ? roundPercent((amt / total) * 100) : 0;
        }

        next[index] = merged;

        let afterSort = sortPaymentScheduleRows(next);

        if (afterSort.length < 2) {
          return afterSort;
        }

        const editedKey = merged.id != null && String(merged.id).trim() !== '' ? String(merged.id) : null;
        let editedPosition = -1;
        if (editedKey) {
          editedPosition = afterSort.findIndex((r) => String(r.id ?? '') === editedKey);
        }
        if (editedPosition < 0) {
          editedPosition = afterSort.findIndex(
            (r) =>
              r.description === merged.description &&
              r.due_date === merged.due_date &&
              Number(r.amount) === Number(merged.amount) &&
              Number(r.percentage) === Number(merged.percentage)
          );
        }
        if (editedPosition < 0) {
          editedPosition = Math.min(index, afterSort.length - 1);
        }

        const userEditedLastRow = editedPosition === afterSort.length - 1;
        if (!userEditedLastRow) {
          afterSort = applyScheduleRemainderToLastRow(afterSort, total);
        }

        return afterSort;
      });
      clearFieldError('due_date');
    },
    [clearFieldError, total]
  );

  const addScheduleRow = useCallback(() => {
    setPaymentSchedule((prev) => {
      const next = [
        ...prev,
        { description: 'Milestone', percentage: 0, amount: 0, due_date: '', _lastEdited: 'auto' as const },
      ];
      let ordered = sortPaymentScheduleRows(next);
      if (ordered.length >= 2) {
        ordered = applyScheduleRemainderToLastRow(ordered, total);
      }
      return ordered;
    });
    clearFieldError('due_date');
  }, [clearFieldError, total]);

  const removeScheduleRow = useCallback(
    (index: number) => {
      setPaymentSchedule((prev) => {
        const sorted = sortPaymentScheduleRows(prev);
        if (sorted.length <= 1) return sorted;
        const removed = sorted[index];
        if (!removed) return sorted;
        const st = (removed.status ?? 'pending') as 'pending' | 'paid';
        if (st === 'paid') return sorted;
        const removedAmt = Number(removed.amount ?? 0);
        const next = sorted.filter((_, i) => i !== index);
        let mergeIdx = -1;
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if ((next[i]?.status ?? 'pending') !== 'paid') {
            mergeIdx = i;
            break;
          }
        }
        if (mergeIdx >= 0 && removedAmt > 0.0001) {
          const row = next[mergeIdx];
          const newAmt = roundMoney(Number(row.amount ?? 0) + removedAmt);
          next[mergeIdx] = {
            ...row,
            amount: newAmt,
            percentage: total > 0 ? roundPercent((newAmt / total) * 100) : 0,
            _lastEdited: 'auto',
          };
        }
        let ordered = sortPaymentScheduleRows(next);
        if (ordered.length >= 2) {
          ordered = applyScheduleRemainderToLastRow(ordered, total);
        }
        return ordered;
      });
      clearFieldError('due_date');
    },
    [clearFieldError, total]
  );

  const openSchedulePaymentModal = useCallback((row: PaymentScheduleRow, dismiss: { action: SchedulePaymentDismissAction; swipeKey?: string }) => {
    if (!invoiceId || !row.id) return;
    const installmentAmount = Number(row.amount ?? 0);
    if (!(installmentAmount > 0)) return;
    setSchedulePaymentModal({ row, dismiss });
  }, [invoiceId]);

  const openRecordPaymentFromScheduleRow = useCallback(
    (row: PaymentScheduleRow, opts?: { afterOpen?: () => void; swipeKey?: string }) => {
      if (!row.id) return;
      const installmentAmount = Number(row.amount ?? 0);
      if (!(installmentAmount > 0)) return;
      if (onOpenRecordPaymentFromSchedule) {
        onOpenRecordPaymentFromSchedule({ scheduleItemId: String(row.id), installmentAmount });
        opts?.afterOpen?.();
        return;
      }
      openSchedulePaymentModal(row, { action: 'swipe', swipeKey: opts?.swipeKey });
    },
    [onOpenRecordPaymentFromSchedule, openSchedulePaymentModal]
  );

  const handleSchedulePaymentModalSuccess = useCallback(
    ({ invoice }: { invoice?: Record<string, unknown> }) => {
      setSchedulePaymentModal((prev) => {
        if (prev) {
          const d = prev.dismiss;
          if (d.action === 'desktop_menu') closeScheduleMenu();
          if (d.action === 'mobile_sheet') closeScheduleSheet();
          if (d.action === 'swipe' && d.swipeKey) resetSwipe(d.swipeKey);
        }
        return null;
      });
      if (!invoice) return;
      if (isFinalPaymentComplete(invoice) && invoiceId) {
        showSuccessToast('Payment complete. Invoice fully paid.');
        router.push(`/dashboard/invoices/${invoiceId}`);
        return;
      }
      setAmountPaid(Number(invoice.amount_paid ?? 0));
      setTotalRefunded(Number((invoice as { total_refunded?: number }).total_refunded ?? 0));
      setBalanceDue(Number(invoice.balance_due ?? 0));
      const invTotal = Number(invoice.total ?? total ?? 0);
      setPaymentSchedule(
        mapInvoicePaymentScheduleApiToRows(
          (invoice.invoice_payment_schedule_items as unknown[] | undefined) ?? [],
          invTotal
        )
      );
      showSuccessToast('Payment recorded');
    },
    [closeScheduleMenu, closeScheduleSheet, resetSwipe, total, invoiceId, router]
  );

  const requestDeleteScheduleRow = useCallback(
    (index: number) => {
      const deleteConstraintError =
        'Cannot delete this item. The remaining schedule must still cover the unpaid balance.';
      const allowed = canDeleteScheduleRowAt(index);
      setDeleteConfirmError(allowed ? null : deleteConstraintError);
      setDeleteConfirmLoading(false);
      setDeleteConfirm({ index });
    },
    [canDeleteScheduleRowAt]
  );

  const confirmDeleteScheduleRow = useCallback(() => {
    if (!deleteConfirm) return;
    const { index } = deleteConfirm;
    const deleteConstraintError = 'Cannot delete this item. The remaining schedule must still cover the unpaid balance.';
    if (!canDeleteScheduleRowAt(index)) {
      setDeleteConfirmError(deleteConstraintError);
      return;
    }

    setDeleteConfirmLoading(true);
    setDeleteConfirm(null);
    setDeleteConfirmError(null);

    closeScheduleMenu();

    removeScheduleRow(index);
    setDeleteConfirmLoading(false);
  }, [deleteConfirm, closeScheduleMenu, removeScheduleRow, canDeleteScheduleRowAt]);

  const cancelDeleteScheduleRow = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  const openExtendDate = useCallback(
    (index: number) => {
      const row = paymentScheduleOrdered[index];
      if (!row) return;
      const st = (row.status ?? 'pending') as 'pending' | 'paid';
      if (st === 'paid') return;
      setScheduleActionError(null);
      setExtendDateModal({ index, newDueDate: row.due_date || '' });
    },
    [paymentScheduleOrdered]
  );

  const confirmExtendDate = useCallback(() => {
    if (!extendDateModal) return;
    const { index, newDueDate } = extendDateModal;
    if (!newDueDate) return;
    setPaymentSchedule((prev) => {
      const sortedPrev = sortPaymentScheduleRows(prev);
      const next = [...sortedPrev];
      const row = next[index];
      if (!row) return sortedPrev;
      const st = (row.status ?? 'pending') as 'pending' | 'paid';
      if (st === 'paid') return sortedPrev;
      next[index] = { ...row, due_date: newDueDate };
      let ordered = sortPaymentScheduleRows(next);
      if (ordered.length >= 2) {
        ordered = applyScheduleRemainderToLastRow(ordered, total);
      }
      return ordered;
    });
    setExtendDateModal(null);
  }, [extendDateModal, total]);

  const openSplitPayment = useCallback(
    (index: number) => {
      const row = paymentScheduleOrdered[index];
      if (!row) return;
      const st = (row.status ?? 'pending') as 'pending' | 'paid';
      if (st === 'paid') return;
      setScheduleActionError(null);
      setSplitPaymentModal({
        index,
        parts: 2,
        ...(row.id && String(row.id).trim() !== '' ? { sourceRowId: String(row.id) } : {}),
      });
    },
    [paymentScheduleOrdered]
  );

  const splitPreview = useMemo(() => {
    if (!splitPaymentModal) return null;
    const parts = Math.max(2, Math.min(12, Math.floor(splitPaymentModal.parts || 2)));
    let idx =
      splitPaymentModal.sourceRowId && String(splitPaymentModal.sourceRowId).trim() !== ''
        ? paymentScheduleOrdered.findIndex((r) => String(r.id ?? '') === String(splitPaymentModal.sourceRowId))
        : splitPaymentModal.index;
    if (idx < 0) idx = splitPaymentModal.index;
    const row = idx >= 0 ? paymentScheduleOrdered[idx] : null;
    if (!row) return null;
    const st = (row.status ?? 'pending') as 'pending' | 'paid';
    if (st === 'paid') return null;

    const unpaidOtherSum = paymentScheduleOrdered.reduce((s, r, i) => {
      if (i === idx) return s;
      const rst = (r.status ?? 'pending') as 'pending' | 'paid';
      if (rst === 'paid') return s;
      return s + (Number(r.amount) || 0);
    }, 0);

    // Remaining balance after other unpaid rows (derived from current total − paid).
    const target = invoiceId
      ? roundMoney(Math.max(0, liveBalanceDue - unpaidOtherSum))
      : roundMoney(Math.max(0, Number(row.amount) || 0));
    const base = roundMoney(Math.floor((target / parts) * 100) / 100);
    const out: number[] = [];
    for (let i = 0; i < parts; i += 1) out.push(base);
    const sumBase = roundMoney(base * parts);
    const remainder = roundMoney(target - sumBase);
    out[out.length - 1] = roundMoney(out[out.length - 1] + remainder);
    return { target, parts, amounts: out };
  }, [splitPaymentModal, paymentScheduleOrdered, invoiceId, liveBalanceDue]);

  const confirmSplitPayment = useCallback(() => {
    if (!splitPaymentModal || !splitPreview) return;
    const { index, sourceRowId } = splitPaymentModal;
    let rowIndex =
      sourceRowId && String(sourceRowId).trim() !== ''
        ? paymentScheduleOrdered.findIndex((r) => String(r.id ?? '') === String(sourceRowId))
        : index;
    if (rowIndex < 0) rowIndex = index;
    const row = rowIndex >= 0 ? paymentScheduleOrdered[rowIndex] : null;
    if (!row) return;
    const st = (row.status ?? 'pending') as 'pending' | 'paid';
    if (st === 'paid') return;

    // Enforce "sum(unpaid) = balance_due" after split.
    const unpaidOtherSum = paymentScheduleOrdered.reduce((s, r, i) => {
      if (i === rowIndex) return s;
      const rst = (r.status ?? 'pending') as 'pending' | 'paid';
      if (rst === 'paid') return s;
      return s + (Number(r.amount) || 0);
    }, 0);

    const nextUnpaidSum = roundMoney(unpaidOtherSum + splitPreview.target);
    if (invoiceId && Math.abs(nextUnpaidSum - liveBalanceDue) > 0.1) {
      setScheduleActionError('Cannot split: the unpaid schedule must still cover the unpaid balance.');
      return;
    }

    const dueFallback =
      String(row.due_date ?? '').trim() ||
      String(issueDate ?? '').trim() ||
      String(dueDate ?? '').trim() ||
      '';

    setPaymentSchedule((prev) => {
      const sortedPrev = sortPaymentScheduleRows(prev);
      let at =
        sourceRowId && String(sourceRowId).trim() !== ''
          ? sortedPrev.findIndex((r) => String(r.id ?? '') === String(sourceRowId))
          : -1;
      if (at < 0) {
        at = sortedPrev.findIndex(
          (r) =>
            r.description === row.description &&
            r.due_date === row.due_date &&
            Number(r.amount) === Number(row.amount) &&
            (r.status ?? 'pending') === (row.status ?? 'pending')
        );
      }
      if (at < 0 && rowIndex >= 0 && rowIndex < sortedPrev.length) {
        at = rowIndex;
      }
      if (at < 0) return sortedPrev;
      const next = [...sortedPrev];
      const before = next.slice(0, at);
      const after = next.slice(at + 1);
      const due = dueFallback;
      const generated: PaymentScheduleRow[] = splitPreview.amounts.map((amt, i) => ({
        description: `${row.description || 'Payment'} (${i + 1}/${splitPreview.parts})`,
        amount: amt,
        percentage: total > 0 ? roundPercent((amt / total) * 100) : 0,
        due_date: due,
        status: 'pending',
        _lastEdited: 'auto',
      }));
      const combined = [...before, ...generated, ...after];
      const remainingBal = invoiceId ? roundMoney(liveBalanceDue) : roundMoney(total);
      return reconcilePaymentScheduleForSave(combined, total, remainingBal, invoiceId ? 'existing' : 'new');
    });

    setSplitPaymentModal(null);
    setScheduleActionError(null);
  }, [splitPaymentModal, splitPreview, paymentScheduleOrdered, invoiceId, liveBalanceDue, total, issueDate, dueDate]);

  const scrollToLineItems = useCallback(() => {
    const el = lineItemsSectionRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFlashLineItems(true);
    window.setTimeout(() => setFlashLineItems(false), 900);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const isCreating = mode === 'create' || (!invoiceId && mode !== 'edit');
      if (isCreating && !workspaceLoading && customerSelectOptions.length === 0) {
        setCustomerRequiredModalOpen(true);
        return;
      }
      setSubmitAttempted(true);
      if (!customerId) {
        const el = customerSectionRef.current;
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (!validate()) {
        const errSnap = lastErrorsRef.current;
        if (usePaymentSchedule && errSnap.due_date) {
          showErrorToast(errSnap.due_date);
        } else if (usePaymentSchedule && errSnap.items) {
          showErrorToast(errSnap.items);
        }
        const itemCardHasError =
          Boolean(lastErrorsRef.current.items) || Object.keys(lastLineItemErrorsRef.current).length > 0;

        if (itemCardHasError) {
          scrollToLineItems();
          const lineErrorsSnapshot = lastLineItemErrorsRef.current;
          const invalidIndices = Object.keys(lineErrorsSnapshot)
            .map((k) => Number(k))
            .filter(
              (i) =>
                lineErrorsSnapshot[i] &&
                (lineErrorsSnapshot[i].name || lineErrorsSnapshot[i].quantity || lineErrorsSnapshot[i].unit_price)
            )
            .sort((a, b) => a - b);
          const firstInvalidIndex = invalidIndices[0] ?? null;

          window.setTimeout(() => {
            if (firstInvalidIndex == null) return;

            const err = lineErrorsSnapshot[firstInvalidIndex] ?? {};
            const focusFirstVisibleByIds = (ids: string[]) => {
              for (const id of ids) {
                const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
                if (el && (el as HTMLElement).offsetParent !== null) {
                  (el as HTMLElement).focus?.();
                  return true;
                }
              }
              for (const id of ids) {
                const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
                if (el) {
                  (el as HTMLElement).focus?.();
                  return true;
                }
              }
              return false;
            };

            if (err.name) {
              focusFirstVisibleByIds([
                `invoice-line-${firstInvalidIndex}-name-desktop`,
                `invoice-line-${firstInvalidIndex}-name-mobile`,
              ]);
              return;
            }

            if (err.quantity) {
              focusFirstVisibleByIds([
                `invoice-line-${firstInvalidIndex}-qty-desktop`,
                `invoice-line-${firstInvalidIndex}-qty-mobile`,
              ]);
              return;
            }

            if (err.unit_price) {
              focusFirstVisibleByIds([
                `invoice-line-${firstInvalidIndex}-rate-desktop`,
                `invoice-line-${firstInvalidIndex}-rate-mobile`,
              ]);
            }
          }, 0);
          return;
        }

        const hasMissingIssueDate = !issueDate.trim();
        const hasMissingDueDate = !usePaymentSchedule && !dueDate.trim();
        if (hasMissingIssueDate || hasMissingDueDate) {
          invoiceDetailsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (hasMissingIssueDate) issueDateInputRef.current?.focus();
          else if (hasMissingDueDate) dueDateInputRef.current?.focus();
        }
        if (
          useDeliveryAddress &&
          (!deliveryAddress.trim() || !deliveryCity.trim() || !resolveCountryCode(deliveryCountry))
        ) {
          customerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      const bid = businessId;
      if (!bid) {
        setError('Create a business first.');
        return;
      }
      if (
        !paymentScheduleOnly &&
        invoiceId &&
        usePaymentSchedule &&
        !isScheduleSavedOnServer
      ) {
        if (!bypassScheduleActivationConfirmRef.current) {
          setScheduleActivationConfirmOpen(true);
          return;
        }
        bypassScheduleActivationConfirmRef.current = false;
      }
      setSubmitting(true);
      try {
        const normalizedCurrency = recalculateInvoiceForCurrency(
          {
            base_currency_code: baseCurrencyCode,
            subtotal: Math.round(subtotal * 100) / 100,
            tax_amount: Math.round((invoiceId ? totalTax : invoiceTax) * 100) / 100,
            total: Math.round(total * 100) / 100,
          },
          invoiceCurrency.trim().toUpperCase(),
          showFxPanel ? displayFxRate : 1
        );
        const baseAmounts = getInvoiceBaseAmounts(normalizedCurrency, baseCurrencyCode);

        const invoiceTotalForSchedule = roundMoney(Number(normalizedCurrency.total ?? total));
        const latestScheduleRows = [...sortPaymentScheduleRows(paymentSchedule)];
        const remainingBalanceForSave = invoiceId
          ? roundMoney(liveBalanceDue)
          : invoiceTotalForSchedule;
        const scheduleRowsForPayload = usePaymentSchedule
          ? reconcilePaymentScheduleForSave(
              latestScheduleRows,
              invoiceTotalForSchedule,
              remainingBalanceForSave,
              invoiceId ? 'existing' : 'new'
            )
          : latestScheduleRows;

        if (usePaymentSchedule && invoiceId) {
          const unpaidSaved = sumUnpaidScheduleAmount(scheduleRowsForPayload);
          if (Math.abs(unpaidSaved - roundMoney(liveBalanceDue)) > 0.12) {
            showErrorToast('Unpaid installments must equal the remaining balance.');
            setSubmitting(false);
            return;
          }
        }

        const scheduleRowsWithoutRefunds = scheduleRowsForPayload.filter((r) => r.status !== 'refund');
        const paymentSchedulePayload = usePaymentSchedule
          ? scheduleRowsWithoutRefunds.map((row, index) => ({
              id: row.id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `row-${index}`),
              type: (getPaymentScheduleRowSortTier(row) === 0 ? 'deposit' : 'installment') as
                | 'deposit'
                | 'installment',
              amount: Number(row.amount),
              dueDate: row.due_date,
              status: (row.status ?? 'pending') === 'paid' ? 'paid' : 'unpaid',
              sequence: index,
              description: row.description.trim(),
              percentage: row.percentage ?? null,
            }))
          : undefined;

        const schedulePayload = usePaymentSchedule
          ? {
              use_payment_schedule: true,
              payment_schedule: scheduleRowsWithoutRefunds.map((r) => {
                const idStr = r.id != null ? String(r.id).trim() : '';
                const dueRaw = String(r.due_date ?? '').trim();
                const dueDateNorm =
                  dueRaw || String(issueDate ?? '').trim() || String(dueDate ?? '').trim() || String(maxScheduleDueDate ?? '').trim();
                return {
                  ...(idStr ? { id: idStr } : {}),
                  description: r.description.trim(),
                  amount: Number(r.amount),
                  due_date: dueDateNorm,
                  status: r.status ?? 'pending',
                };
              }),
            }
          : { use_payment_schedule: false, payment_schedule: [] as PaymentScheduleRow[] };

        const payload = {
          business_id: bid,
          customer_id: customerId || null,
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim() || null,
          currency: normalizedCurrency.currency,
          base_currency_code: baseAmounts.base_currency_code,
          exchange_rate_to_base: baseAmounts.exchange_rate_to_base,
          subtotal_in_base: baseAmounts.subtotal_in_base,
          tax_amount_in_base: baseAmounts.tax_amount_in_base,
          total_in_base: baseAmounts.total_in_base,
          due_date: usePaymentSchedule ? (maxScheduleDueDate || dueDate) : dueDate,
          issue_date: issueDate || new Date().toISOString().slice(0, 10),
          subtotal: normalizedCurrency.subtotal,
          total: normalizedCurrency.total,
          tax_amount: normalizedCurrency.tax_amount,
          discount_amount: Math.round(effectiveDiscount * 100) / 100,
          discount_percent: discountPercent,
          notes: notes.trim() || null,
          terms: terms.trim() || null,
          reference_po: referencePo.trim() || null,
          show_time_summary: showTimeSummary,
          client_billing: {
            contact_person: contactPerson.trim() || null,
            company: customerCompany.trim() || null,
            billing_address_line1: billingAddressLine1.trim() || null,
            billing_address_line2: billingAddressLine2.trim() || null,
            billing_address: billingAddress.trim() || null,
            billing_city: billingCity.trim() || null,
            billing_state: billingState.trim() || null,
            billing_postal_code: billingPostalCode.trim() || null,
            billing_country: resolveCountryCode(billingCountry) || null,
            billing_phone: billingPhone.trim() ? normalizePhone(billingPhone) : null,
            use_delivery_address: useDeliveryAddress,
            delivery_company: useDeliveryAddress ? (deliveryCompany.trim() || null) : null,
            delivery_email: useDeliveryAddress ? (deliveryEmail.trim() || null) : null,
            delivery_contact_person: useDeliveryAddress ? (deliveryContactPerson.trim() || null) : null,
            delivery_phone: useDeliveryAddress ? (normalizePhone(deliveryPhone) || null) : null,
            delivery_address: useDeliveryAddress ? (deliveryAddress.trim() || null) : null,
            delivery_city: useDeliveryAddress ? (deliveryCity.trim() || null) : null,
            delivery_state: useDeliveryAddress ? (deliveryState.trim() || null) : null,
            delivery_postal_code: useDeliveryAddress ? (deliveryPostalCode.trim() || null) : null,
            delivery_country: useDeliveryAddress ? (resolveCountryCode(deliveryCountry) || null) : null,
          },
          ...schedulePayload,
          items: lineItems
            .filter((i) => i.name.trim() && i.quantity > 0)
            .map((i) => ({
              name: i.name.trim(),
              description: i.description.trim() || null,
              quantity: i.quantity,
              unit_label: normalizeInvoiceUnitLabel(i.unit_label),
              unit_price: i.unit_price,
              tax_percent: i.tax_percent ?? 0,
              assignee: i.assignee.trim() ? i.assignee.trim().slice(0, 200) : null,
            })),
        };
        if (invoiceId) {
          const res = await fetch(`/api/invoices/${invoiceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              items: payload.items,
              ...(paymentSchedulePayload ? { paymentSchedule: paymentSchedulePayload } : {}),
            }),
          });
          const data = (await res.json()) as Record<string, unknown>;
          if (!res.ok) throw new Error(String(data.error ?? 'Failed to update invoice'));
          if (usePaymentSchedule) {
            const invTot = Number(data.total ?? normalizedCurrency.total ?? 0);
            let itemsToHydrate = extractInvoicePaymentScheduleItems(data);
            if (itemsToHydrate.length === 0 && invoiceId) {
              const refRes = await fetch(`/api/invoices/${invoiceId}`);
              if (refRes.ok) {
                const refData = (await refRes.json()) as Record<string, unknown>;
                itemsToHydrate = extractInvoicePaymentScheduleItems(refData);
              }
            }
            const paymentSchedule =
              itemsToHydrate.length > 0
                ? mapInvoicePaymentScheduleApiToRows(itemsToHydrate, invTot)
                : scheduleRowsForPayload;
            const nextSchedule = sortPaymentScheduleRows(paymentSchedule);
            setPaymentSchedule(nextSchedule);
            setInvoice((prev) => ({
              ...prev,
              id: invoiceId ?? prev.id,
              paymentSchedule: nextSchedule,
            }));
          }
          if (data.amount_paid != null) setAmountPaid(Number(data.amount_paid));
          if (data.balance_due != null) setBalanceDue(Number(data.balance_due));
          if (data.amount_paid != null || data.balance_due != null) {
            savedScheduleFinancialBaselineRef.current = {
              amountPaid:
                data.amount_paid != null
                  ? Number(data.amount_paid)
                  : savedScheduleFinancialBaselineRef.current.amountPaid,
              balanceDue:
                data.balance_due != null
                  ? Number(data.balance_due)
                  : savedScheduleFinancialBaselineRef.current.balanceDue,
            };
          }
          if (data.use_payment_schedule != null) setUsePaymentSchedule(Boolean(data.use_payment_schedule));
          if (paymentScheduleOnly && usePaymentSchedule) setIsScheduleSavedOnServer(true);
          if (businessId) {
            persistSavedLineItemsFromSave(
              businessId,
              payload.items.map((i) => ({
                name: i.name,
                unitPrice: i.unit_price,
                description: i.description,
                taxPercent: i.tax_percent,
              }))
            );
          }
          if (onSaved) {
            showSuccessToast('Invoice saved');
            onSaved({ invoiceId, data });
          } else {
            showSuccessToast('Invoice saved');
            window.location.href = `/dashboard/invoices/${invoiceId}`;
          }
        } else {
          const res = await fetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              ...(paymentSchedulePayload ? { paymentSchedule: paymentSchedulePayload } : {}),
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            const trigger = mapApiCodeToUpgradeTrigger(
              typeof data?.code === 'string' ? data.code : null
            );
            if (trigger) setUpgradeModal(trigger);
            throw new Error(data.error ?? 'Failed to create invoice');
          }
          if (businessId) {
            persistSavedLineItemsFromSave(
              businessId,
              payload.items.map((i) => ({
                name: i.name,
                unitPrice: i.unit_price,
                description: i.description,
                taxPercent: i.tax_percent,
              }))
            );
          }
          showSuccessToast('Invoice saved');
          window.location.href = `/dashboard/invoices/${data.id}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn\u2019t save invoice. Try again";
        showErrorToast(msg);
        setError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [
      businessId,
      customerId,
      customerName,
      customerEmail,
      invoiceCurrency,
      dueDate,
      issueDate,
      subtotal,
      total,
      invoiceTax,
      totalTax,
      effectiveDiscount,
      notes,
      terms,
      referencePo,
      discountAmount,
      discountPercent,
      contactPerson,
      customerCompany,
      billingAddressLine1,
      billingAddressLine2,
      billingAddress,
      billingCity,
      billingState,
      billingPostalCode,
      billingCountry,
      billingPhone,
      useDeliveryAddress,
      deliveryCompany,
      deliveryEmail,
      deliveryContactPerson,
      deliveryPhone,
      deliveryAddress,
      deliveryCity,
      deliveryState,
      deliveryPostalCode,
      deliveryCountry,
      lineItems,
      showTimeSummary,
      validate,
      invoiceId,
      usePaymentSchedule,
      paymentSchedule,
      paymentScheduleOrdered,
      maxScheduleDueDate,
      onSaved,
      paymentScheduleOnly,
      isScheduleSavedOnServer,
      showErrorToast,
      liveBalanceDue,
      mode,
      invoiceId,
      customerSelectOptions,
      workspaceLoading,
    ]
  );

  if (workspaceLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-500 dark:text-slate-400">Loading invoice…</p>
      </div>
    );
  }

  if (!business) {
    return (
      <InvoiceManualEntrySetup
        onWorkspaceReady={() => {
          setWorkspaceLoading(true);
          setWorkspaceLoadKey((k) => k + 1);
        }}
      />
    );
  }

  const isCreateMode = mode === 'create' || (!invoiceId && mode !== 'edit');
  if (isCreateMode && !isSetupProgressFullySatisfied(setupProgress)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <InvoiceCoreSetupBlockedFromContext invoiceFlow />
      </div>
    );
  }

  if (isCreateMode && !paymentScheduleOnly && !workspaceLoading && customerSelectOptions.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <InvoiceCustomerSetupPanel invoiceFlow returnTo={manualInvoiceReturnTo} />
      </div>
    );
  }

  const inputClassBase =
    'mt-1 block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white';
  const inputClass = (hasError: boolean) =>
    cn(
      inputClassBase,
      hasError
        ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
        : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
    );
  const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
  const errorMessageClass = 'mt-1 text-sm text-red-600 dark:text-red-400';
  const invoiceDateInputClass = (hasError: boolean) =>
    cn(
      'app-date-field w-full pl-10 disabled:cursor-not-allowed disabled:opacity-60',
      hasError && 'border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500'
    );
  const showCustomerRequiredError = (submitAttempted || customerNameTouched) && !customerId;
  const hasMissingIssueDate = submitAttempted && !issueDate.trim();
  const hasMissingDueDate = submitAttempted && !usePaymentSchedule && !dueDate.trim();
  const showInvoiceDetailsDateError = hasMissingIssueDate || hasMissingDueDate;
  const hasNotesOrTerms = Boolean(notes.trim() || terms.trim());
  const formMode: 'create' | 'edit' = mode ?? (invoiceId ? 'edit' : 'create');
  const createHeader = {
    backHref: '/dashboard/invoices/new',
    backLabel: 'Back',
    title: 'Create invoice',
    subtitle: 'Manual entry — fill in the details below',
  };
  const editHeader = {
    backHref: invoiceId ? `/dashboard/invoices/${invoiceId}` : '/dashboard/invoices',
    backLabel: 'Back to Invoice',
    title: `Edit Invoice ${editInvoiceNumber?.trim() || ''}`.trim(),
    subtitle: 'Update invoice details',
  };
  const header = formMode === 'edit' ? editHeader : createHeader;

  const invoiceCustomerOrphanLabel =
    customerId && !customerSelectOptions.some((o) => o.id === customerId) && customerName.trim()
      ? customerName.trim()
      : undefined;

  const billingCountryCode = resolveCountryCode(billingCountry);
  const deliveryCountryCode = resolveCountryCode(deliveryCountry);
  const billingCountryName = billingCountryCode ? getCountryNameFromCode(billingCountryCode) : '';
  const billingStateName =
    billingCountryCode && billingState
      ? getStates(billingCountryCode).find((s) => s.code === billingState)?.name ?? billingState
      : billingState;
  const deliveryCountryName = deliveryCountryCode ? getCountryNameFromCode(deliveryCountryCode) : '';
  const deliveryStateName =
    deliveryCountryCode && deliveryState
      ? getStates(deliveryCountryCode).find((s) => s.code === deliveryState)?.name ?? deliveryState
      : deliveryState;
  const effectiveDeliveryCountry = deliveryCountryCode || billingCountryCode || 'US';
  const deliveryDialCode = PHONE_DIAL_CODE_BY_COUNTRY[effectiveDeliveryCountry] ?? '+';
  const getScheduleStatusText = (row: Pick<PaymentScheduleRow, 'status' | 'due_date' | 'paid_at'>, isOverdue: boolean) => {
    const st = (row.status ?? 'pending') as 'pending' | 'paid' | 'refund';
    if (st === 'refund') {
      const refDate = row.paid_at || row.due_date;
      return refDate ? `Refunded ${formatDisplayDate(String(refDate))}` : 'Refunded';
    }
    if (st === 'paid') {
      const paidDate = row.paid_at || row.due_date;
      return paidDate ? `Paid ${formatDisplayDate(String(paidDate))}` : 'Paid';
    }
    if (isOverdue) return 'Past due';
    return row.due_date ? `Due ${formatDisplayDate(String(row.due_date))}` : 'Due —';
  };

  const showLivePreviewAside = !paymentScheduleOnly || (paymentScheduleOnly && paymentScheduleWithPreview);

  const workspaceMobileTabMode = workspaceEmbed && workspaceMobilePanel != null;
  const workspaceSplit = showLivePreviewAside && workspaceEmbed && !workspaceMobileTabMode;

  return (
    <div
      className={cn(
        'mx-auto overflow-x-hidden',
        workspaceEmbed ? 'w-full max-w-none' : paymentScheduleOnly && !paymentScheduleWithPreview ? 'max-w-4xl' : 'max-w-7xl'
      )}
    >
      {!paymentScheduleOnly && !workspaceEmbed && (
        <InvoiceFormHeader
          backHref={header.backHref}
          backLabel={header.backLabel}
          title={header.title}
          subtitle={header.subtitle}
          mode={formMode}
          status={status}
        />
      )}
      {isCreateMode &&
      business &&
      isBusinessSenderAddressMissingForInvoices(business) &&
      !paymentScheduleOnly ? (
        <BusinessAddressInvoiceSoftPrompt />
      ) : null}
      {paymentScheduleOnly && invoiceId ? (
        <div className="mb-6 border-b border-slate-200/80 pb-5 dark:border-slate-800/90 sm:mb-7 sm:pb-6">
          <Link
            href={`/dashboard/invoices/${invoiceId}`}
            className="inline-flex w-fit items-center text-sm text-slate-500 transition hover:text-zenzex-600 dark:text-slate-400 dark:hover:text-zenzex-400"
          >
            ← Back to invoice
          </Link>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">Payment schedule</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Same installment setup as Edit Invoice.</p>
        </div>
      ) : null}

      <div
        className={cn(
          'relative min-w-0 gap-8 md:gap-10',
          workspaceSplit
            ? 'flex w-full flex-col lg:flex-row lg:items-start'
            : 'grid min-h-0 grid-cols-1',
          showLivePreviewAside && !workspaceEmbed && 'xl:grid-cols-[minmax(0,1fr),420px]',
          !showLivePreviewAside && !workspaceEmbed && 'xl:grid-cols-1'
        )}
      >
      {!paymentScheduleOnly && showCustomerApplyFeedback ? (
        <div
          className="pointer-events-none hidden md:absolute md:inset-0 md:z-40 md:flex md:items-center md:justify-center bg-white/40 backdrop-blur-sm dark:bg-black/25"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-3 px-4">
            <span
              className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400"
              aria-hidden
            />
            <div className="flex flex-col items-center">
              <p className="text-sm text-gray-700 dark:text-gray-200">Applying customer details...</p>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                {customerApplyMode === 'create' ? 'Creating customer...' : 'Applying selected customer...'}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <form
        ref={invoiceFormRef}
        id={htmlFormId}
        onSubmit={handleSubmit}
        className={cn(
          'min-w-0 space-y-10 md:space-y-12',
          workspaceSplit && 'flex-1',
          workspaceMobileTabMode && workspaceMobilePanel === 'preview' && 'hidden'
        )}
      >
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {!paymentScheduleOnly && hasPartialPayment ? (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
            role="status"
          >
            This invoice can no longer be edited because payments have been recorded.
          </div>
        ) : null}

        {!paymentScheduleOnly && (
          <>
        {/* Customer */}
        <section
          ref={customerSectionRef}
          className={cn(
            'w-full max-w-full overflow-x-hidden rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 sm:p-7',
            showCustomerRequiredError
              ? 'border-red-300 dark:border-red-500/70'
              : 'border-slate-200 dark:border-slate-800'
          )}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Customer</h2>
          {showCustomerApplyFeedback ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-200">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400"
                aria-hidden
              />
              <div className="flex flex-col">
                <span className="font-medium">Applying customer details...</span>
                <span className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                  {customerApplyMode === 'create' ? 'Creating customer...' : 'Applying selected customer...'}
                </span>
              </div>
            </div>
          ) : null}
          {(showCustomerRequiredError || errors.customer_name) && (
            <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400" role="alert">
              {errors.customer_name ?? 'Customer is required'}
            </p>
          )}

          <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/50 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-600 dark:text-slate-300 md:col-span-2" htmlFor="invoice-customer-select">
              <span>
                Onboarded customer <span className="text-red-500">*</span>
              </span>
              <SearchableCustomerSelect
                id="invoice-customer-select"
                options={customerSelectOptions}
                value={customerId ?? ''}
                onChange={onInvoiceCustomerIdChange}
                placeholder="Select customer"
                orphanValueLabel={invoiceCustomerOrphanLabel}
                disabled={criticalFieldsLocked}
                triggerClassName={
                  errors.customer_name || showCustomerRequiredError
                    ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30 dark:border-red-500 dark:focus-visible:border-red-500'
                    : undefined
                }
              />
            </label>

            {customerId ? (
              <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bill to</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-white">{customerName.trim() || '—'}</p>
                {customerCompany.trim() ? (
                  <p className="mt-0.5 text-slate-600 dark:text-slate-300">{customerCompany.trim()}</p>
                ) : null}
                {customerEmail.trim() ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{customerEmail.trim()}</p>
                ) : null}
                {billingPhone.trim() ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{billingPhone.trim()}</p>
                ) : null}
                {billingAddress || billingCity || billingState || billingPostalCode || billingCountry ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    {billingAddress.trim()}
                    {billingCity || billingState || billingPostalCode || billingCountry ? (
                      <>
                        {billingAddress.trim() ? <br /> : null}
                        {[billingCity, billingStateName || billingState, billingPostalCode]
                          .filter(Boolean)
                          .join(', ')}
                        {billingCountryName ? (
                          <>
                            <br />
                            {billingCountryName}
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </p>
                ) : null}
                {contactPerson.trim() ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contact: {contactPerson.trim()}</p>
                ) : null}
              </div>
            ) : null}

            <label className="space-y-1 text-sm text-slate-600 dark:text-slate-300 md:col-span-2" htmlFor="invoice-reference-po">
              <span>Reference / PO Number</span>
              <input
                id="invoice-reference-po"
                type="text"
                className={cn(
                  'mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
                  MANUAL_INVOICE_FIELD_FOCUS
                )}
                value={referencePo}
                onChange={(e) => setReferencePo(e.target.value)}
                placeholder="Optional — PO, ref, or order #"
                autoComplete="off"
                disabled={criticalFieldsLocked}
              />
            </label>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => setCreateCustomerModalOpen(true)}
                disabled={!businessId || criticalFieldsLocked}
                className="text-xs font-medium text-indigo-600 transition hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-400"
              >
                Create new customer
              </button>
            </div>

            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/30">
              <label
                className={cn(
                  'flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200',
                  criticalFieldsLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-zenzex-600 focus:ring-zenzex-500 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-800"
                  checked={useDeliveryAddress}
                  disabled={criticalFieldsLocked}
                  onChange={(e) => {
                    setUseDeliveryAddress(e.target.checked);
                    if (!e.target.checked) clearFieldError('delivery');
                  }}
                />
                <span>Use different delivery address</span>
              </label>
            </div>

            {errors.delivery && (
              <p className="md:col-span-2 text-sm text-red-600 dark:text-red-400" role="alert">
                {errors.delivery}
              </p>
            )}

            {useDeliveryAddress && (
              <div className="md:col-span-2 w-full max-w-full overflow-x-hidden rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Delivery address
                </p>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className={labelClass}>Address line 1</label>
                    <input
                      type="text"
                      className={inputClass(!!errors.delivery)}
                      value={deliveryAddress}
                      onChange={(e) => {
                        setDeliveryAddress(e.target.value);
                        clearFieldError('delivery');
                      }}
                      placeholder="Street address"
                      disabled={criticalFieldsLocked}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className={labelClass}>City</label>
                      <input
                        type="text"
                        className={inputClass(!!errors.delivery)}
                        value={deliveryCity}
                        onChange={(e) => {
                          setDeliveryCity(e.target.value);
                          clearFieldError('delivery');
                        }}
                        placeholder="City"
                        disabled={criticalFieldsLocked}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>State / Province</label>
                      {(() => {
                        const stateOptions = getStates(resolveCountryCode(deliveryCountry));
                        if (stateOptions.length > 0) {
                          return (
                            <select
                              className={inputClass(!!errors.delivery)}
                              value={deliveryState}
                              onChange={(e) => {
                                setDeliveryState(e.target.value);
                                clearFieldError('delivery');
                              }}
                              aria-label="Delivery state or province"
                              disabled={criticalFieldsLocked}
                            >
                              <option value="">Select state</option>
                              {stateOptions.map((s) => (
                                <option key={s.code} value={s.code}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          );
                        }
                        return (
                          <input
                            type="text"
                            className={inputClass(!!errors.delivery)}
                            value={deliveryState}
                            onChange={(e) => {
                              setDeliveryState(e.target.value);
                              clearFieldError('delivery');
                            }}
                            placeholder="State / Province"
                            disabled={criticalFieldsLocked}
                          />
                        );
                      })()}
                    </div>
                    <div>
                      <label className={labelClass}>Postal code</label>
                      <input
                        type="text"
                        className={inputClass(!!errors.delivery)}
                        value={deliveryPostalCode}
                        onChange={(e) => {
                          setDeliveryPostalCode(e.target.value);
                          clearFieldError('delivery');
                        }}
                        placeholder="Postal code"
                        disabled={criticalFieldsLocked}
                      />
                    </div>
                    <div className="md:col-span-2 lg:col-span-4 min-w-0 max-w-full">
                      <label className={labelClass}>Country</label>
                      <CountrySelect
                        id="invoice-delivery-country"
                        ariaLabel="Delivery country"
                        value={deliveryCountry}
                        onChange={(isoCode) => {
                          setDeliveryCountry(isoCode);
                          setDeliveryState('');
                          clearFieldError('delivery');
                        }}
                        className={inputClass(!!errors.delivery)}
                        disabled={criticalFieldsLocked}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Company / recipient (optional)</label>
                    <input
                      type="text"
                      className={inputClass(false)}
                      value={deliveryCompany}
                      onChange={(e) => setDeliveryCompany(e.target.value)}
                      placeholder="Company name"
                      disabled={criticalFieldsLocked}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email (optional)</label>
                    <input
                      type="email"
                      className={inputClass(false)}
                      value={deliveryEmail}
                      onChange={(e) => setDeliveryEmail(e.target.value)}
                      placeholder="delivery@client.com"
                      autoComplete="email"
                      disabled={criticalFieldsLocked}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Contact person (optional)</label>
                    <input
                      type="text"
                      className={inputClass(false)}
                      value={deliveryContactPerson}
                      onChange={(e) => setDeliveryContactPerson(e.target.value)}
                      placeholder="Name"
                      disabled={criticalFieldsLocked}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Delivery phone (optional)</label>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {deliveryDialCode}
                      </span>
                      <input
                        type="tel"
                        className={inputClass(false)}
                        value={deliveryPhone}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const withPrefix = raw.startsWith('+') ? raw : `${deliveryDialCode}${raw}`;
                          setDeliveryPhone(formatPhoneForDisplay(withPrefix));
                        }}
                        placeholder={`${deliveryDialCode} 555 123 4567`}
                        inputMode="tel"
                        autoComplete="tel"
                        disabled={criticalFieldsLocked}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      International format supported. We save as normalized number.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        <section
          ref={invoiceDetailsSectionRef}
          className={cn(
            'rounded-2xl border bg-white p-6 shadow-sm transition-colors sm:p-7',
            showInvoiceDetailsDateError
              ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
              : 'border-slate-200 dark:border-slate-800 dark:bg-slate-900'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice details</h2>
            {invoiceId ? <p className="text-xs text-slate-500 dark:text-slate-400">Edit mode</p> : null}
          </div>
          {showInvoiceDetailsDateError && (
            <p className="mt-3 text-sm text-red-500" role="alert">
              Please select issue and due date
            </p>
          )}
          <div className="mt-5 space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className={labelClass}>Invoice number</label>
                <p className="mt-1 h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm leading-10 text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
                  {invoiceId
                    ? (editInvoiceNumber?.trim() ||
                        String((initialData?.invoice as { invoice_number?: string | null } | undefined)?.invoice_number ?? '').trim() ||
                        '—')
                    : 'Auto-generated when saved'}
                </p>
              </div>
              <div className="md:col-span-1 xl:col-span-2">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Issue date <span className="text-red-500">*</span></label>
                    <div className="relative mt-1">
                      <CalendarDays
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                        aria-hidden
                      />
                      <input
                        ref={issueDateInputRef}
                        type="date"
                        className={invoiceDateInputClass(!!errors.issue_date)}
                        value={issueDate}
                        disabled={criticalFieldsLocked}
                        onChange={(e) => {
                          setIssueDate(e.target.value);
                          clearFieldError('issue_date');
                        }}
                      />
                    </div>
                  </div>
                  {!usePaymentSchedule && (
                    <div>
                      <label className={labelClass}>Due date <span className="text-red-500">*</span></label>
                      <div className="relative mt-1">
                        <CalendarDays
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                          aria-hidden
                        />
                        <input
                          ref={dueDateInputRef}
                          type="date"
                          className={invoiceDateInputClass(!!errors.due_date)}
                          value={dueDate}
                          disabled={criticalFieldsLocked}
                          onChange={(e) => {
                            setDueDate(e.target.value);
                            clearFieldError('due_date');
                          }}
                          min={issueDate || undefined}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-span-2 xl:col-span-3">
                <label htmlFor="invoice-currency" className={labelClass}>
                  Invoice currency
                </label>
                <CurrencySelect
                  id="invoice-currency"
                  value={invoiceCurrency}
                  disabled={currencySelectorLocked || criticalFieldsLocked}
                  onChange={(code) => setInvoiceCurrency(code.toUpperCase())}
                  className={inputClass(false)}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Amounts on this invoice use {invCurUpper}. Reporting uses {baseCurrencyCode}.
                </p>
                {currencySelectorLocked ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Currency can only be changed while the invoice is in draft. Stored rate:{' '}
                    {serverExchangeRate != null ? serverExchangeRate.toFixed(6) : '—'}
                  </p>
                ) : null}
              </div>
            </div>

          </div>
        </section>


        {/* Line items */}
        <section
          ref={(el) => {
            lineItemsSectionRef.current = el as HTMLElement | null;
          }}
          className={`rounded-2xl border bg-white shadow-sm transition-colors duration-200 dark:bg-slate-900 ${
            (errors.items || Object.keys(lineItemErrors).length > 0)
              ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-900/10'
              : flashLineItems
                ? 'border-amber-500 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/10'
                : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="border-b border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Line items</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Add services or products. Amounts update totals automatically.</p>
              </div>
                {!criticalFieldsLocked && (
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    + Add line
                  </button>
                )}
            </div>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3 p-4">
            {lineItems.map((item, index) => {
              const lineTotal = item.quantity * item.unit_price;
              const lineTax = lineTotal * (item.tax_percent / 100);
              const lineTotalWithTax = lineTotal + lineTax;
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Description</label>
                      <ItemNameInput
                        businessId={itemMemoryBusinessId}
                        currencyCode={invoiceCurrency}
                        value={item.name}
                        onChange={(v) => updateLineItem(index, { name: v })}
                        onPickSuggestion={(s) =>
                          updateLineItem(index, {
                            name: s.name,
                            description: s.description ?? '',
                            unit_label: 'item',
                            unit_price: s.unitPrice,
                            tax_percent: s.taxPercent ?? 0,
                          })
                        }
                        placeholder="Item or service"
                        disabled={criticalFieldsLocked}
                        aria-invalid={lineItemErrors[index]?.name ? true : undefined}
                        className={cn(
                          'mt-1 h-11 w-full rounded-xl border bg-white px-3 text-base shadow-sm dark:bg-slate-900 dark:text-white',
                          lineItemErrors[index]?.name
                            ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                            : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                        )}
                        id={`invoice-line-${index}-name-mobile`}
                        onAfterSelect={() => focusVisibleInvoiceDesc(index)}
                      />
                      <input
                        type="text"
                        data-invoice-desc={index}
                        className={cn(
                          'mt-2 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                          MANUAL_INVOICE_FIELD_FOCUS
                        )}
                        value={item.description}
                        onChange={(e) => updateLineItem(index, { description: e.target.value })}
                        placeholder="Optional details"
                        disabled={criticalFieldsLocked}
                      />
                      {showTimeSummary ? (
                        <input
                          type="text"
                          className={cn(
                            'mt-2 h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                            MANUAL_INVOICE_FIELD_FOCUS
                          )}
                          value={item.assignee}
                          onChange={(e) => updateLineItem(index, { assignee: e.target.value })}
                          placeholder="Consultant (optional)"
                          disabled={criticalFieldsLocked}
                          maxLength={200}
                          aria-label="Consultant name"
                        />
                      ) : null}
                    </div>
                    {!criticalFieldsLocked && lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-red-950/20"
                        aria-label="Remove line item"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Quantity</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        id={`invoice-line-${index}-qty-mobile`}
                        className={cn(
                          `${INVOICE_LINE_NUMBER_NO_SPINNER} mt-1 h-11 w-full rounded-xl border bg-white px-3 text-right text-base tabular-nums shadow-sm dark:bg-slate-900 dark:text-white`,
                          lineItemErrors[index]?.quantity
                            ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                            : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                        )}
                        value={item.quantity || ''}
                        onChange={(e) => updateLineItem(index, { quantity: parseFloat(e.target.value) || 0 })}
                        aria-invalid={lineItemErrors[index]?.quantity ? true : undefined}
                        disabled={criticalFieldsLocked}
                      />
                      {lineItemErrors[index]?.quantity && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                          {lineItemErrors[index].quantity}
                        </p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor={`invoice-line-${index}-unit-mobile`}
                        className="text-xs font-medium text-slate-500 dark:text-slate-400"
                      >
                        Unit
                      </label>
                      <InvoiceLineUnitField
                        id={`invoice-line-${index}-unit-mobile`}
                        variant="mobile"
                        unitLabel={item.unit_label}
                        onChange={(next) => updateLineItem(index, { unit_label: next })}
                        disabled={criticalFieldsLocked}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Rate</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        id={`invoice-line-${index}-rate-mobile`}
                        className={cn(
                          `${INVOICE_LINE_NUMBER_NO_SPINNER} mt-1 h-11 w-full rounded-xl border bg-white px-3 text-right text-base tabular-nums shadow-sm dark:bg-slate-900 dark:text-white`,
                          lineItemErrors[index]?.unit_price
                            ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                            : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                        )}
                        value={item.unit_price || ''}
                        onChange={(e) => updateLineItem(index, { unit_price: parseFloat(e.target.value) || 0 })}
                        aria-invalid={lineItemErrors[index]?.unit_price ? true : undefined}
                        disabled={criticalFieldsLocked}
                      />
                      {lineItemErrors[index]?.unit_price && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                          {lineItemErrors[index].unit_price}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tax %</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        className={cn(
                          `${INVOICE_LINE_NUMBER_NO_SPINNER} mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-right text-base tabular-nums shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white`,
                          MANUAL_INVOICE_FIELD_FOCUS
                        )}
                        value={item.tax_percent || ''}
                        onChange={(e) => updateLineItem(index, { tax_percent: parseFloat(e.target.value) || 0 })}
                        disabled={criticalFieldsLocked}
                      />
                    </div>
                    <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount</p>
                      <p className="mt-1 text-right text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatMoneyCodeFirst(lineTotalWithTax, invoiceCurrency)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop/tablet table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full table-fixed divide-y divide-slate-200 dark:divide-slate-800">
              <colgroup>
                <col className="w-[27%]" />
                <col className="w-16" />
                <col className="min-w-[120px] w-[160px]" />
                <col className="w-28" />
                <col className="min-w-[72px] w-20" />
                <col className="w-28" />
                <col className="w-12" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Unit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tax %</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount</th>
                  <th className="w-12 shrink-0 px-2 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {lineItems.map((item, index) => {
                  const lineTotal = item.quantity * item.unit_price;
                  const lineTax = lineTotal * (item.tax_percent / 100);
                  const lineTotalWithTax = lineTotal + lineTax;
                  return (
                    <tr key={index} className="bg-white hover:bg-slate-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/40">
                      <td className="align-top px-4 py-3">
                        <ItemNameInput
                          businessId={itemMemoryBusinessId}
                          currencyCode={invoiceCurrency}
                          value={item.name}
                          onChange={(v) => updateLineItem(index, { name: v })}
                          onPickSuggestion={(s) =>
                            updateLineItem(index, {
                              name: s.name,
                              description: s.description ?? '',
                              unit_label: 'item',
                              unit_price: s.unitPrice,
                              tax_percent: s.taxPercent ?? 0,
                            })
                          }
                          placeholder="Item or service"
                          disabled={criticalFieldsLocked}
                        aria-invalid={lineItemErrors[index]?.name ? true : undefined}
                        className={cn(
                          'h-10 w-full rounded-lg border bg-white px-3 text-sm shadow-sm dark:bg-slate-900 dark:text-white',
                          lineItemErrors[index]?.name
                            ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                            : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                        )}
                          id={`invoice-line-${index}-name-desktop`}
                          onAfterSelect={() => focusVisibleInvoiceDesc(index)}
                        />
                        <input
                          type="text"
                          data-invoice-desc={index}
                          className={cn(
                            'mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                            MANUAL_INVOICE_FIELD_FOCUS
                          )}
                          value={item.description}
                          onChange={(e) => updateLineItem(index, { description: e.target.value })}
                          placeholder="Optional description"
                          disabled={criticalFieldsLocked}
                        />
                        {showTimeSummary ? (
                          <input
                            type="text"
                            className={cn(
                              'mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                              MANUAL_INVOICE_FIELD_FOCUS
                            )}
                            value={item.assignee}
                            onChange={(e) => updateLineItem(index, { assignee: e.target.value })}
                            placeholder="Consultant (optional)"
                            disabled={criticalFieldsLocked}
                            maxLength={200}
                            aria-label="Consultant name"
                          />
                        ) : null}
                      </td>
                      <td className="align-top px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            id={`invoice-line-${index}-qty-desktop`}
                            className={cn(
                              `${INVOICE_LINE_NUMBER_NO_SPINNER} h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-right text-sm tabular-nums shadow-sm dark:bg-slate-900 dark:text-white`,
                              lineItemErrors[index]?.quantity
                                ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                                : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                            )}
                            value={item.quantity || ''}
                            onChange={(e) => updateLineItem(index, { quantity: parseFloat(e.target.value) || 0 })}
                            aria-invalid={lineItemErrors[index]?.quantity ? true : undefined}
                            aria-describedby={lineItemErrors[index]?.quantity ? `qty-error-${index}` : undefined}
                            disabled={criticalFieldsLocked}
                          />
                          {lineItemErrors[index]?.quantity && (
                            <p id={`qty-error-${index}`} className="text-xs text-red-600 dark:text-red-400" role="alert">
                              {lineItemErrors[index].quantity}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="align-top px-4 py-3">
                        <InvoiceLineUnitField
                          id={`invoice-line-${index}-unit-desktop`}
                          variant="desktop"
                          unitLabel={item.unit_label}
                          onChange={(next) => updateLineItem(index, { unit_label: next })}
                          disabled={criticalFieldsLocked}
                        />
                      </td>
                      <td className="align-top px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            id={`invoice-line-${index}-rate-desktop`}
                            className={cn(
                              `${INVOICE_LINE_NUMBER_NO_SPINNER} h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-right text-sm tabular-nums shadow-sm dark:bg-slate-900 dark:text-white`,
                              lineItemErrors[index]?.unit_price
                                ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                                : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                            )}
                            value={item.unit_price || ''}
                            onChange={(e) => updateLineItem(index, { unit_price: parseFloat(e.target.value) || 0 })}
                            aria-invalid={lineItemErrors[index]?.unit_price ? true : undefined}
                            aria-describedby={lineItemErrors[index]?.unit_price ? `unit-price-error-${index}` : undefined}
                            disabled={criticalFieldsLocked}
                          />
                          {lineItemErrors[index]?.unit_price && (
                            <p id={`unit-price-error-${index}`} className="text-xs text-red-600 dark:text-red-400" role="alert">
                              {lineItemErrors[index].unit_price}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="align-top px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          className={cn(
                            `${INVOICE_LINE_NUMBER_NO_SPINNER} h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-right text-sm tabular-nums shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white`,
                            MANUAL_INVOICE_FIELD_FOCUS
                          )}
                          value={item.tax_percent || ''}
                          onChange={(e) => updateLineItem(index, { tax_percent: parseFloat(e.target.value) || 0 })}
                          disabled={criticalFieldsLocked}
                        />
                      </td>
                      <td className="px-4 py-3 text-right align-middle text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatMoneyCodeFirst(lineTotalWithTax, invoiceCurrency)}
                      </td>
                      <td className="w-12 shrink-0 px-2 py-3 align-middle">
                        {!criticalFieldsLocked && lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-700"
                            aria-label="Remove line"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {((errors.items || Object.keys(lineItemErrors).length > 0) ? (
            <p className="px-4 pb-2 text-sm text-red-500 dark:text-red-400" role="alert">
              Complete item details
            </p>
          ) : null)}
        </section>

        {/* Totals — Time Summary toggle sits here (above invoice math) so hierarchy is: line items → optional work summary → totals */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Totals</h2>

          {!paymentScheduleOnly && (
            <div className="mt-5 border-b border-slate-200 pb-5 dark:border-slate-700">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Time Summary</p>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={showTimeSummary}
                  onChange={(e) => setShowTimeSummary(e.target.checked)}
                  disabled={criticalFieldsLocked}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900"
                />
                <span>Show Time Summary on the invoice</span>
              </label>
              {showTimeSummary ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  For hour-based lines, optionally add a consultant on each line. The summary is derived from those lines only; subtotal and total below still come from all line items.
                </p>
              ) : null}
            </div>
          )}

          <div className="mt-6 space-y-6">
            {/* Adjustments: inputs only */}
            <div className="space-y-4 border-b border-slate-200 pb-6 dark:border-slate-700">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Adjustments</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6 md:flex-nowrap md:justify-between md:gap-8">
                <div className="min-w-0 sm:max-w-xs">
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Discount</span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div
                      className="inline-flex gap-0.5 rounded-lg border border-indigo-200/70 bg-indigo-50/90 p-0.5 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-950/40"
                      role="group"
                      aria-label="Discount type"
                    >
                      <button
                        type="button"
                        disabled={criticalFieldsLocked}
                        onClick={() => {
                          setDiscountMode('amount');
                          setDiscountPercent(0);
                        }}
                        className={cn(
                          'min-h-9 min-w-[4.5rem] rounded-md px-3 py-2 text-xs font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
                          discountMode === 'amount'
                            ? 'border border-indigo-400/80 bg-indigo-600 text-white shadow-md shadow-indigo-500/25 dark:border-indigo-400 dark:bg-indigo-500 dark:shadow-indigo-900/40'
                            : 'border border-transparent text-slate-600 hover:bg-white/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                        )}
                      >
                        Amount
                      </button>
                      <button
                        type="button"
                        disabled={criticalFieldsLocked}
                        onClick={() => {
                          setDiscountMode('percent');
                          setDiscountAmount(0);
                        }}
                        className={cn(
                          'min-h-9 min-w-[4.5rem] rounded-md px-3 py-2 text-xs font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
                          discountMode === 'percent'
                            ? 'border border-indigo-400/80 bg-indigo-600 text-white shadow-md shadow-indigo-500/25 dark:border-indigo-400 dark:bg-indigo-500 dark:shadow-indigo-900/40'
                            : 'border border-transparent text-slate-600 hover:bg-white/90 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                        )}
                      >
                        %
                      </button>
                    </div>
                    {discountMode === 'amount' ? (
                      <>
                        <label className="sr-only" htmlFor="invoice-discount-amount">
                          Discount amount
                        </label>
                        <input
                          id="invoice-discount-amount"
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="0.00"
                          aria-invalid={discountExceedsSubtotal || errors.discount ? true : undefined}
                          className={cn(
                            'h-10 w-24 shrink-0 rounded-lg border bg-white px-3 text-right text-sm tabular-nums shadow-sm sm:w-36 dark:bg-slate-900 dark:text-white',
                            discountExceedsSubtotal || errors.discount
                              ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                              : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                          )}
                          value={discountAmount || ''}
                          disabled={criticalFieldsLocked}
                          onChange={(e) => {
                            setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0));
                            setDiscountPercent(0);
                            clearFieldError('discount');
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor="invoice-discount-percent">
                          Discount percent
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            id="invoice-discount-percent"
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            placeholder="0"
                            className={cn(
                              'h-10 w-[4.5rem] rounded-lg border border-slate-300 bg-white px-2.5 text-right text-sm tabular-nums shadow-sm sm:w-20 sm:px-3 dark:border-slate-600 dark:bg-slate-900 dark:text-white',
                              MANUAL_INVOICE_FIELD_FOCUS
                            )}
                            value={discountPercent || ''}
                            disabled={criticalFieldsLocked}
                            onChange={(e) => {
                              setDiscountPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)));
                              setDiscountAmount(0);
                            }}
                          />
                          <span className="text-sm text-slate-500 dark:text-slate-400" aria-hidden>
                            %
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  {(discountExceedsSubtotal || errors.discount) && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400" role="alert">
                      {errors.discount ?? "Discount can't exceed subtotal."}
                    </p>
                  )}
                </div>
                <div className="min-w-0 sm:max-w-[14rem] md:w-auto md:shrink-0">
                  <label
                    htmlFor="invoice-tax-percent-totals"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Tax rate
                  </label>
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      id="invoice-tax-percent-totals"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      className={cn(
                        'h-10 w-full max-w-[7rem] rounded-lg border border-slate-300 bg-white px-3 text-right text-sm tabular-nums shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white',
                        MANUAL_INVOICE_FIELD_FOCUS
                      )}
                      value={taxPercent || ''}
                      disabled={criticalFieldsLocked}
                      onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400" aria-hidden>
                      %
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary breakdown */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-800/40">
              {showFxPanel ? (
                <div className="mb-5 rounded-lg border border-indigo-200/60 bg-indigo-50/40 px-3 py-2.5 text-xs dark:border-indigo-500/25 dark:bg-indigo-950/30">
                  <p className="font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-200">
                    Exchange rate snapshot
                  </p>
                  <dl className="mt-2 space-y-1.5 text-slate-700 dark:text-slate-200">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500 dark:text-slate-400">Base currency</dt>
                      <dd className="tabular-nums font-medium">{baseCurrencyCode}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500 dark:text-slate-400">Invoice currency</dt>
                      <dd className="tabular-nums font-medium">{invCurUpper}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500 dark:text-slate-400">Exchange rate</dt>
                      <dd className="tabular-nums font-medium">{displayFxRate.toFixed(6)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-indigo-200/50 pt-1.5 dark:border-indigo-500/20">
                      <dt className="font-medium text-slate-800 dark:text-slate-100">Converted total</dt>
                      <dd className="tabular-nums font-semibold text-slate-900 dark:text-white">
                        {formatMoneyCodeFirst(convertedTotalPreview, baseCurrencyCode)}
                      </dd>
                    </div>
                  </dl>
                  {fxFetchError && savedInvoiceStatus === 'draft' ? (
                    <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{fxFetchError}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-6">
                  <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                  <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                    {formatMoneyCodeFirst(subtotal, invoiceCurrency)}
                  </span>
                </div>
                {effectiveDiscount > 0 ? (
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="text-slate-600 dark:text-slate-400">Discount</span>
                    <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                      −{formatMoneyCodeFirst(effectiveDiscount, invoiceCurrency)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between gap-6">
                  <span className="text-slate-600 dark:text-slate-400">
                    {taxPercent > 0 && !lineItems.some((i) => (i.tax_percent ?? 0) > 0)
                      ? `Tax (${taxPercent}%)`
                      : 'Tax'}
                  </span>
                  <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                    {formatMoneyCodeFirst(totalTax, invoiceCurrency)}
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-4 dark:border-slate-600" />
                <div className="flex items-baseline justify-between gap-6 pt-0">
                  <span className="text-base font-bold text-slate-900 dark:text-white">Total</span>
                  <span className="text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                    {formatMoneyCodeFirst(total, invoiceCurrency)}
                  </span>
                </div>
                {(usePaymentSchedule || invoiceId) && (
                  <>
                    <div className="flex items-baseline justify-between gap-6 border-t border-slate-200 pt-3 text-sm dark:border-slate-600">
                      <span className="text-slate-600 dark:text-slate-400">Paid</span>
                      <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                        {formatMoneyCodeFirst(amountPaid, invoiceCurrency)}
                      </span>
                    </div>
                    {totalRefunded > 0.0001 ? (
                      <div className="flex items-baseline justify-between gap-6 text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Net paid</span>
                        <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                          {formatMoneyCodeFirst(netPaidDisplayed, invoiceCurrency)}
                        </span>
                      </div>
                    ) : null}
                    {totalRefunded > 0.0001 ? (
                      <div className="flex items-baseline justify-between gap-6 text-sm text-rose-700 dark:text-rose-300">
                        <span>Refunded</span>
                        <span className="tabular-nums font-medium">
                          {formatMoneyCodeFirst(totalRefunded, invoiceCurrency)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-baseline justify-between gap-6 text-sm font-semibold">
                      <span className="text-slate-900 dark:text-white">Balance due</span>
                      <span className="tabular-nums text-slate-900 dark:text-white">
                        {formatMoneyCodeFirst(liveBalanceDue, invoiceCurrency)}
                      </span>
                    </div>
                    {epdPreview.enabled && (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>Original total</span>
                          <span className="tabular-nums">{formatMoneyCodeFirst(total, invoiceCurrency)}</span>
                        </div>
                        <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-400">
                          <span>Early payment discount ({epdPreview.percent}% · expires {epdPreview.expires_on ?? '—'})</span>
                          <span className="tabular-nums">−{formatMoneyCodeFirst(epdPreview.eligible ? epdPreview.discount_amount : 0, invoiceCurrency)}</span>
                        </div>
                        <div className="mt-1 flex justify-between font-medium text-slate-900 dark:text-white">
                          <span>Effective payable</span>
                          <span className="tabular-nums">{formatMoneyCodeFirst(epdPreview.eligible ? epdPreview.payable_now : epdPreview.original_due, invoiceCurrency)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {epdPreview.eligible ? 'Valid only if paid before expiry.' : 'Discount not available (expired).'}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

          </>
        )}

        {/* Payment schedule */}
        <section
          className={cn(
            'w-full max-w-full overflow-x-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-6',
            paymentScheduleOnly ? 'mt-0' : 'mt-6'
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Payment schedule
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Split this invoice into installments.</p>
            </div>
            <label
              className={cn(
                'flex min-h-11 min-w-0 shrink-0 items-center gap-3 rounded-lg py-1 pl-1 pr-2 text-sm text-slate-700 dark:text-slate-300 sm:py-0 sm:pl-0',
                cannotUncheckPaymentSchedule || !automationUnlocked
                  ? 'cursor-not-allowed opacity-90'
                  : 'cursor-pointer'
              )}
            >
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 rounded border-slate-300 text-zenzex-600 focus:ring-zenzex-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800"
                checked={usePaymentSchedule}
                disabled={cannotUncheckPaymentSchedule || !automationUnlocked}
                onChange={(e) => {
                  if (!automationUnlocked) {
                    setScheduleActivationError('Upgrade to Growth to unlock automation.');
                    setUpgradeModal('automation');
                    return;
                  }
                  const next = e.target.checked;
                  setScheduleRemovalError(null);
                  setScheduleActivationError(null);
                  clearFieldError('due_date');

                  if (next) {
                    if (!(total > 0)) {
                      setScheduleActivationError(
                        'Add at least one line item to generate the invoice total before creating a payment schedule.'
                      );
                      scrollToLineItems();
                      return;
                    }
                    setUsePaymentSchedule(true);
                    setPaymentSchedule(defaultScheduleForTotal(total, issueDate, dueDate));
                    return;
                  }

                  if (cannotUncheckPaymentSchedule) {
                    if (hasRecordedPayment) {
                      setScheduleRemovalError(
                        'Payment schedule cannot be changed after payments have been recorded.'
                      );
                    } else if (isScheduleSaved) {
                      setScheduleRemovalError('Payment schedule cannot be removed after saving.');
                    }
                    setUsePaymentSchedule(true);
                    return;
                  }

                  setPaymentSchedule([]);
                  setAmountPaid(savedScheduleFinancialBaselineRef.current.amountPaid);
                  setBalanceDue(Math.max(0, savedScheduleFinancialBaselineRef.current.balanceDue));
                  setUsePaymentSchedule(false);
                  if (paymentScheduleOnly) {
                    onUnsavedPaymentScheduleDiscarded?.();
                  }
                }}
              />
              <span className="select-none leading-snug">Use payment schedule</span>
            </label>
          </div>
          {!automationUnlocked ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Upgrade to Growth to unlock automation
              <button
                type="button"
                onClick={() => setUpgradeModal('automation')}
                className="font-semibold underline"
              >
                Upgrade
              </button>
            </p>
          ) : null}
          {hasRecordedPayment && isScheduleEnabled ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Payment schedule cannot be changed after payments have been recorded.
            </p>
          ) : null}
          {isScheduleSaved && isScheduleEnabled && !hasRecordedPayment ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Payment schedule cannot be removed after saving.
            </p>
          ) : null}
          {scheduleActivationError && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300" role="alert">
              {scheduleActivationError}
            </p>
          )}
          {scheduleRemovalError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {scheduleRemovalError}
            </p>
          )}
          <div
            className={`grid transition-all duration-300 ease-out ${
              usePaymentSchedule ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
            aria-hidden={!usePaymentSchedule}
          >
            <div className="min-h-0 overflow-hidden">
              {usePaymentSchedule ? (
                <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-800/30">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        The final installment adjusts automatically.
                      </p>
                      <button
                        type="button"
                        onClick={addScheduleRow}
                        className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        + Add installment
                      </button>
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Scheduled</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                            {formatMoneyCodeFirst(scheduleSum, invoiceCurrency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Total</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                            {formatMoneyCodeFirst(total, invoiceCurrency)}
                          </p>
                        </div>
                        {invoiceId ? (
                          <>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">Paid</p>
                              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                                {formatMoneyCodeFirst(amountPaid, invoiceCurrency)}
                              </p>
                              {totalRefunded > 0.0001 ? (
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  Net paid {formatMoneyCodeFirst(netPaidDisplayed, invoiceCurrency)}
                                </p>
                              ) : null}
                              {totalRefunded > 0.0001 ? (
                                <p className="mt-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                                  Refunded {formatMoneyCodeFirst(totalRefunded, invoiceCurrency)}
                                </p>
                              ) : null}
                            </div>
                            <div>
                              <p className="text-slate-500 dark:text-slate-400">Balance due</p>
                              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                                {formatMoneyCodeFirst(liveBalanceDue, invoiceCurrency)}
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 sm:col-span-2">
                            <p className="text-slate-500 dark:text-slate-400">Allocation</p>
                            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                              {Math.max(0, Math.min(100, schedulePercentSum)).toFixed(0)}% allocated
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <div
                            className={`h-full rounded-full ${
                              Math.abs(scheduleSum - total) <= 0.02
                                ? 'bg-emerald-500'
                                : scheduleSum > total
                                  ? 'bg-red-500'
                                  : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.max(0, Math.min(100, schedulePercentSum))}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {Math.max(0, Math.min(100, schedulePercentSum)).toFixed(0)}% allocated
                        </p>
                      </div>
                    </div>
                    {errors.due_date && <p className={errorMessageClass} role="alert">{errors.due_date}</p>}
                  </div>
                  <div className="overflow-x-auto">
                    {/* Mobile cards (swipe actions) */}
                    <div className="md:hidden space-y-3 p-4">
                      {paymentScheduleOrdered.map((r, idx) => {
                        const statusValue = (r.status ?? 'pending') as 'pending' | 'paid';
                        const rowKey = String(r.id ?? `idx-${idx}`);
                        const x = scheduleSwipeX[rowKey] ?? 0;
                        const swipeEnabled = true;
                        const canMarkPaid =
                          !disableSchedulePaymentActions && !!invoiceId && !!r.id && statusValue !== 'paid';

                        const isOverdue =
                          statusValue !== 'paid' &&
                          Boolean(r.due_date) &&
                          new Date(String(r.due_date)) <
                            new Date(new Date().toISOString().slice(0, 10));
                        const statusLabel = isOverdue ? 'overdue' : statusValue;
                        const statusText = getScheduleStatusText(r, isOverdue);

                        return (
                          <div
                            key={rowKey}
                            className={cn(
                              'relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
                              statusValue === 'paid' && 'ring-1 ring-emerald-200/90 dark:ring-emerald-800/50'
                            )}
                          >
                            {/* Swipe backgrounds */}
                            <div className="absolute inset-0 flex">
                              {statusValue === 'paid' ? (
                                <div className="flex w-full items-center justify-center bg-emerald-50 px-4 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                    <path
                                      d="M9.2 16.2 4.8 11.8l1.4-1.4 3 3 8-8 1.4 1.4-9.4 9.4Z"
                                      fill="currentColor"
                                    />
                                  </svg>
                                </div>
                              ) : (
                                <>
                                  {!disableSchedulePaymentActions ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!canMarkPaid) return;
                                        if (onOpenRecordPaymentFromSchedule) {
                                          openRecordPaymentFromScheduleRow(r, { afterOpen: () => resetSwipe(rowKey) });
                                          return;
                                        }
                                        openSchedulePaymentModal(r, { action: 'swipe', swipeKey: rowKey });
                                      }}
                                      disabled={!canMarkPaid}
                                      className="flex w-full items-center justify-start gap-2 bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-40"
                                      aria-label="Mark Paid"
                                    >
                                      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                        <path
                                          d="M9.2 16.2 4.8 11.8l1.4-1.4 3 3 8-8 1.4 1.4-9.4 9.4Z"
                                          fill="currentColor"
                                        />
                                      </svg>
                                      Mark Paid
                                    </button>
                                  ) : null}
                                </>
                              )}
                            </div>

                            {/* Foreground card */}
                            <div
                              className="relative z-10 bg-white dark:bg-slate-900"
                              style={{
                                transform: `translateX(${swipeEnabled ? x : 0}px)`,
                                transition: scheduleSwipeRef.current.activeKey === rowKey ? 'none' : 'transform 180ms ease-out',
                                touchAction: 'pan-y',
                              }}
                              onPointerDown={(e) => {
                                if (statusValue === 'paid') return;
                                handleSchedulePointerDown(rowKey, e);
                              }}
                              onPointerMove={(e) => handleSchedulePointerMove(rowKey, e)}
                              onPointerUp={(e) => handleSchedulePointerEnd(rowKey, e)}
                              onPointerCancel={(e) => handleSchedulePointerEnd(rowKey, e)}
                            >
                              <div className="flex items-start justify-between gap-3 p-4">
                                <div className="min-w-0 flex-1">
                                  <input
                                    type="text"
                                    className={cn(
                                      'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white',
                                      MANUAL_INVOICE_FIELD_FOCUS
                                    )}
                                    value={r.description}
                                    onChange={(e) => updateScheduleRow(idx, { description: e.target.value })}
                                    disabled={statusValue === 'paid' || statusValue === 'refund'}
                                  />
                                  <div className="mt-2">
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                        statusLabel === 'refund'
                                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                                          : statusLabel === 'paid'
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                            : statusLabel === 'overdue'
                                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                      }`}
                                    >
                                      {statusText}
                                    </span>
                                  </div>
                                </div>

                                {/* Overflow menu (fallback) */}
                                {statusValue === 'paid' ? (
                                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                      <path
                                        d="M9.2 16.2 4.8 11.8l1.4-1.4 3 3 8-8 1.4 1.4-9.4 9.4Z"
                                        fill="currentColor"
                                      />
                                    </svg>
                                  </div>
                                ) : (
                                  <div className="flex shrink-0 items-center gap-1">
                                    {canDeleteScheduleRowAt(idx) ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          requestDeleteScheduleRow(idx);
                                        }}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
                                        aria-label="Remove row"
                                      >
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                      </button>
                                    ) : null}
                                    <button
                                      ref={(el) => { scheduleMenuButtonRefs.current[rowKey] = el; }}
                                      type="button"
                                      data-payment-schedule-menu-button="true"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setOpenScheduleSheet({ key: rowKey, index: idx });
                                      }}
                                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                      aria-label="Open actions menu"
                                      aria-haspopup="true"
                                      aria-expanded={openScheduleSheet?.key === rowKey}
                                    >
                                      <span className="text-lg leading-none" aria-hidden>⋮</span>
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                                <div>
                                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount</label>
                                  <div className="mt-1 space-y-2">
                                    <div className="relative">
                                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                        {currencySymbol(invoiceCurrency)}
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        className={cn(
                                          'h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-right text-sm tabular-nums whitespace-nowrap shadow-sm dark:bg-slate-900 dark:text-white',
                                          scheduleUnpaidMismatch && statusValue !== 'paid' && statusValue !== 'refund'
                                            ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                                            : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                                        )}
                                        value={r.amount || ''}
                                        onChange={(e) => updateScheduleRow(idx, { amount: parseFloat(e.target.value) || 0 }, 'amount')}
                                        disabled={statusValue === 'paid' || statusValue === 'refund'}
                                      />
                                    </div>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.01}
                                        className={cn(
                                          'h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 pr-7 text-right text-xs tabular-nums text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                                          MANUAL_INVOICE_FIELD_FOCUS
                                        )}
                                        value={Number.isFinite(r.percentage) && r.percentage !== 0 ? r.percentage : ''}
                                        onChange={(e) => updateScheduleRow(idx, { percentage: parseFloat(e.target.value) || 0 }, 'percentage')}
                                        disabled={statusValue === 'paid' || statusValue === 'refund'}
                                        aria-label="Percentage"
                                      />
                                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">%</span>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Due date</label>
                                  <div className="relative mt-1">
                                    <CalendarDays
                                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                                      aria-hidden
                                    />
                                    <input
                                      type="date"
                                      className={cn(
                                        invoiceDateInputClass(false),
                                        statusValue === 'paid' && 'cursor-not-allowed opacity-60'
                                      )}
                                      value={r.due_date}
                                      onChange={(e) => updateScheduleRow(idx, { due_date: e.target.value })}
                                      min={issueDate || undefined}
                                      disabled={statusValue === 'paid' || statusValue === 'refund'}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {typeof document !== 'undefined' &&
                      openScheduleSheet &&
                      createPortal((() => {
                        const r = paymentScheduleOrdered[openScheduleSheet.index];
                        if (!r) return null;
                        const statusValue = (r.status ?? 'pending') as 'pending' | 'paid';
                        // If the row is already paid, do not show the mobile action sheet at all.
                        if (statusValue === 'paid') return null;
                        const canMarkPaid = !disableSchedulePaymentActions && !!invoiceId && !!r.id;

                        return (
                          <div className="fixed inset-0 z-[200] md:hidden" role="dialog" aria-modal="true">
                            <button
                              type="button"
                              className="absolute inset-0 bg-slate-900/50"
                              onClick={closeScheduleSheet}
                              aria-label="Close actions"
                            />
                            <div
                              className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900"
                              style={{ transform: scheduleSheetVisible ? 'translateY(0)' : 'translateY(100%)' }}
                            >
                              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
                              <div className="flex items-center justify-between gap-3 px-1">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Payment Schedule Actions</p>
                                <button
                                  type="button"
                                  onClick={closeScheduleSheet}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                                  aria-label="Close"
                                >
                                  ×
                                </button>
                              </div>
                              <div className="mt-1">
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{r.description || 'Payment schedule'}</p>
                              </div>
                              <div className="space-y-2">
                                <>
                                    {!disableSchedulePaymentActions ? (
                                      <button
                                        type="button"
                                        disabled={!canMarkPaid}
                                        onClick={() => {
                                          if (!canMarkPaid) return;
                                          if (onOpenRecordPaymentFromSchedule) {
                                            closeScheduleSheet();
                                            openRecordPaymentFromScheduleRow(r);
                                            return;
                                          }
                                          closeScheduleSheet();
                                          openSchedulePaymentModal(r, { action: 'mobile_sheet' });
                                        }}
                                        className="w-full whitespace-nowrap rounded-xl bg-zenzex-600 px-4 py-3 text-sm font-semibold text-white hover:bg-zenzex-700 disabled:opacity-50"
                                      >
                                        Mark Paid
                                      </button>
                                    ) : null}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        closeScheduleSheet();
                                        openExtendDate(openScheduleSheet.index);
                                      }}
                                      className="w-full whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      Extend Date
                                    </button>

                                    <button
                                      type="button"
                                      disabled={!invoiceId || liveBalanceDue <= 0}
                                      onClick={() => {
                                        closeScheduleSheet();
                                        openSplitPayment(openScheduleSheet.index);
                                      }}
                                      className="w-full whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      Split Payment
                                    </button>

                                    <button
                                      type="button"
                                      onClick={closeScheduleSheet}
                                      className="w-full whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      Close
                                    </button>
                                </>
                              </div>
                            </div>
                          </div>
                        );
                      })(), document.body)}

                    {/* Delete confirmation (permanent accounting action) */}
                    {typeof document !== 'undefined' &&
                      deleteConfirm &&
                      createPortal(
                        <div className="fixed inset-0 z-[460] flex items-center justify-center p-4" role="dialog" aria-modal="true">
                          <button
                            type="button"
                            className="absolute inset-0 bg-slate-900/50"
                            onClick={cancelDeleteScheduleRow}
                            aria-label="Cancel"
                          />
                          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                            <div className="space-y-3">
                              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Delete this payment?</h3>
                              {deleteConfirmError ? (
                                <p className="text-sm font-medium text-red-600 dark:text-red-400">{deleteConfirmError}</p>
                              ) : (
                                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                                  Once deleted, this action cannot be undone.
                                </p>
                              )}
                            </div>

                            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              {deleteConfirmError ? (
                                <button
                                  type="button"
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                  onClick={cancelDeleteScheduleRow}
                                >
                                  Close
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                    onClick={cancelDeleteScheduleRow}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="whitespace-nowrap rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                                    onClick={() => void confirmDeleteScheduleRow()}
                                    disabled={deleteConfirmLoading}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}

                    {/* Extend Date modal */}
                    {typeof document !== 'undefined' &&
                      extendDateModal &&
                      createPortal(
                        <div className="fixed inset-0 z-[470] flex items-center justify-center p-4" role="dialog" aria-modal="true">
                          <button
                            type="button"
                            className="absolute inset-0 bg-slate-900/50"
                            onClick={() => setExtendDateModal(null)}
                            aria-label="Close"
                          />
                          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                            <div className="space-y-2">
                              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Extend payment due date</h3>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                Remaining balance: <span className="font-semibold">{formatMoneyCodeFirst(liveBalanceDue, invoiceCurrency)}</span>
                              </p>
                            </div>

                            <div className="mt-5 space-y-3">
                              <div className="text-sm text-slate-700 dark:text-slate-200">
                                Current due date:{' '}
                                <span className="font-medium">
                                  {paymentScheduleOrdered[extendDateModal.index]?.due_date || '—'}
                                </span>
                              </div>
                              <div>
                                <label className={labelClass}>New due date</label>
                                <div className="relative mt-1">
                                  <CalendarDays
                                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                                    aria-hidden
                                  />
                                  <input
                                    type="date"
                                    className={invoiceDateInputClass(false)}
                                    value={extendDateModal.newDueDate}
                                    min={issueDate || undefined}
                                    onChange={(e) =>
                                      setExtendDateModal((prev) => (prev ? { ...prev, newDueDate: e.target.value } : prev))
                                    }
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              <button
                                type="button"
                                className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                onClick={() => setExtendDateModal(null)}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="whitespace-nowrap rounded-xl bg-zenzex-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zenzex-700 disabled:opacity-60"
                                onClick={confirmExtendDate}
                                disabled={!extendDateModal.newDueDate}
                              >
                                Confirm
                              </button>
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}

                    {/* Split Payment modal */}
                    {typeof document !== 'undefined' &&
                      splitPaymentModal &&
                      createPortal(
                        <div className="fixed inset-0 z-[480] flex items-center justify-center p-4" role="dialog" aria-modal="true">
                          <button
                            type="button"
                            className="absolute inset-0 bg-slate-900/50"
                            onClick={() => {
                              setSplitPaymentModal(null);
                              setScheduleActionError(null);
                            }}
                            aria-label="Close"
                          />
                          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                            <div className="space-y-2">
                              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Split remaining balance</h3>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                Balance due: <span className="font-semibold">{formatMoneyCodeFirst(liveBalanceDue, invoiceCurrency)}</span>
                              </p>
                            </div>

                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                              <div>
                                <label className={labelClass}>Number of parts</label>
                                <input
                                  type="number"
                                  min={2}
                                  max={12}
                                  step={1}
                                  className={inputClass(false)}
                                  value={splitPaymentModal.parts}
                                  onChange={(e) =>
                                    setSplitPaymentModal((prev) =>
                                      prev ? { ...prev, parts: Math.max(2, Math.min(12, parseInt(e.target.value || '2', 10))) } : prev
                                    )
                                  }
                                />
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/30">
                                <p className="text-slate-600 dark:text-slate-400">Preview total</p>
                                <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                                  {formatMoneyCodeFirst(splitPreview?.target ?? 0, invoiceCurrency)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-5">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
                              <div className="mt-2 space-y-2">
                                {(splitPreview?.amounts ?? []).map((amt, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                                  >
                                    <span className="text-slate-700 dark:text-slate-200">Part {i + 1}</span>
                                    <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                                      {formatMoneyCodeFirst(amt, invoiceCurrency)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {(scheduleActionError || scheduleUnpaidMismatch) && (
                                <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400" role="alert">
                                  {scheduleActionError || 'The unpaid schedule must equal the unpaid balance.'}
                                </p>
                              )}
                            </div>

                            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              <button
                                type="button"
                                className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                onClick={() => {
                                  setSplitPaymentModal(null);
                                  setScheduleActionError(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="whitespace-nowrap rounded-xl bg-zenzex-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zenzex-700 disabled:opacity-60"
                                onClick={confirmSplitPayment}
                                disabled={!splitPreview || !!scheduleActionError}
                              >
                                Confirm split
                              </button>
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}

                    {/* Desktop/tablet table */}
                    <div className="hidden md:block">
                      <table className="min-w-[640px] w-full table-auto divide-y divide-slate-200 dark:divide-slate-800">
                      <colgroup>
                        {/* Description: flexible */}
                        <col />
                        {/* Amount: fixed-ish, compact */}
                        <col className="w-[200px]" />
                        {/* Due date: fixed */}
                        <col className="w-[152px]" />
                        {/* Action: shrink to content */}
                        <col className="w-auto" />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Due date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {paymentScheduleOrdered.map((r, idx) => {
                          const statusValue = (r.status ?? 'pending') as 'pending' | 'paid' | 'refund';
                          const rowKey = String(r.id ?? `idx-${idx}`);
                          const isOverdue =
                            statusValue !== 'paid' &&
                            statusValue !== 'refund' &&
                            Boolean(r.due_date) &&
                            new Date(String(r.due_date)) <
                              new Date(new Date().toISOString().slice(0, 10));
                          const statusLabel = isOverdue ? 'overdue' : statusValue;
                          const statusText = getScheduleStatusText(r, isOverdue);
                          return (
                            <tr
                              key={r.id ?? idx}
                              className={cn(
                                'bg-white hover:bg-slate-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/40',
                                statusValue === 'paid' &&
                                  'ring-1 ring-inset ring-emerald-200/80 dark:ring-emerald-800/50',
                                statusValue === 'refund' &&
                                  'ring-1 ring-inset ring-rose-200/80 dark:ring-rose-900/40'
                              )}
                            >
                              <td className="px-4 py-3">
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    className={cn(
                                      'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white',
                                      MANUAL_INVOICE_FIELD_FOCUS
                                    )}
                                    value={r.description}
                                    onChange={(e) => updateScheduleRow(idx, { description: e.target.value })}
                                    disabled={statusValue === 'paid' || statusValue === 'refund'}
                                  />
                                  <div>
                                    <span
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                        statusLabel === 'refund'
                                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                                          : statusLabel === 'paid'
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                            : statusLabel === 'overdue'
                                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                      }`}
                                    >
                                      {statusText}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <div className="ml-auto w-[180px] space-y-2">
                                  <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                      {currencySymbol(invoiceCurrency)}
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      className={cn(
                                        'h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-right text-sm tabular-nums whitespace-nowrap shadow-sm dark:bg-slate-900 dark:text-white',
                                        scheduleUnpaidMismatch && statusValue !== 'paid' && statusValue !== 'refund'
                                          ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
                                          : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
                                      )}
                                      value={r.amount || ''}
                                      onChange={(e) => updateScheduleRow(idx, { amount: parseFloat(e.target.value) || 0 }, 'amount')}
                                      disabled={statusValue === 'paid' || statusValue === 'refund'}
                                    />
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={0.01}
                                      className={cn(
                                        'h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 pr-7 text-right text-xs tabular-nums text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                                        MANUAL_INVOICE_FIELD_FOCUS
                                      )}
                                      value={Number.isFinite(r.percentage) && r.percentage !== 0 ? r.percentage : ''}
                                      onChange={(e) => updateScheduleRow(idx, { percentage: parseFloat(e.target.value) || 0 }, 'percentage')}
                                      disabled={statusValue === 'paid' || statusValue === 'refund'}
                                      aria-label="Percentage"
                                    />
                                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">%</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="relative w-full min-w-[10.5rem]">
                                  <CalendarDays
                                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                                    aria-hidden
                                  />
                                  <input
                                    type="date"
                                    className={cn(
                                      invoiceDateInputClass(false),
                                      statusValue === 'paid' && 'cursor-not-allowed opacity-60'
                                    )}
                                    value={r.due_date}
                                    onChange={(e) => updateScheduleRow(idx, { due_date: e.target.value })}
                                    min={issueDate || undefined}
                                    disabled={statusValue === 'paid' || statusValue === 'refund'}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-left whitespace-nowrap align-top">
                                {statusValue === 'paid' ? (
                                  <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                                      <path
                                        d="M9.2 16.2 4.8 11.8l1.4-1.4 3 3 8-8 1.4 1.4-9.4 9.4Z"
                                        fill="currentColor"
                                      />
                                    </svg>
                                    <span>Paid</span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="inline-flex items-center gap-1">
                                      {canDeleteScheduleRowAt(idx) ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            requestDeleteScheduleRow(idx);
                                          }}
                                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
                                          aria-label="Remove row"
                                        >
                                          <Trash2 className="h-4 w-4" aria-hidden />
                                        </button>
                                      ) : null}
                                      <button
                                        ref={(el) => { scheduleMenuButtonRefs.current[rowKey] = el; }}
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const btn = scheduleMenuButtonRefs.current[rowKey];
                                          if (!btn) return;
                                          const rect = btn.getBoundingClientRect();
                                          setScheduleMenuPosition({ top: rect.bottom + 4, left: rect.left });
                                          setOpenScheduleMenuKey(rowKey);
                                        }}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                        aria-label="Open actions menu"
                                        aria-haspopup="true"
                                        aria-expanded={openScheduleMenuKey === rowKey}
                                      >
                                        <span className="text-lg leading-none" aria-hidden>⋮</span>
                                      </button>
                                    </div>

                                    {typeof document !== 'undefined' &&
                                      openScheduleMenuKey === rowKey &&
                                      scheduleMenuPosition &&
                                      createPortal(
                                        <div
                                          id="payment-schedule-row-menu"
                                          role="menu"
                                          className="fixed z-[250] w-max min-w-0 max-w-[14rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                                          style={{
                                            top: scheduleMenuPosition.top,
                                            left:
                                              typeof window !== 'undefined' && scheduleMenuPosition.left + 192 > window.innerWidth - 16
                                                ? window.innerWidth - 208
                                                : Math.max(8, scheduleMenuPosition.left),
                                          }}
                                        >
                                          {!disableSchedulePaymentActions ? (
                                            <button
                                              type="button"
                                              role="menuitem"
                                              disabled={!invoiceId || !r.id}
                                              onClick={() => {
                                                if (!invoiceId || !r.id) return;
                                                closeScheduleMenu();
                                                if (onOpenRecordPaymentFromSchedule) {
                                                  openRecordPaymentFromScheduleRow(r);
                                                  return;
                                                }
                                                openSchedulePaymentModal(r, { action: 'desktop_menu' });
                                              }}
                                              className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                                            >
                                              Mark Paid
                                            </button>
                                          ) : null}

                                          <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                              closeScheduleMenu();
                                              openExtendDate(idx);
                                            }}
                                            className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                                          >
                                            Extend Date
                                          </button>

                                          <button
                                            type="button"
                                            role="menuitem"
                                            disabled={!invoiceId || liveBalanceDue <= 0}
                                            onClick={() => {
                                              closeScheduleMenu();
                                              openSplitPayment(idx);
                                            }}
                                            className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                                          >
                                            Split Payment
                                          </button>

                                          <button
                                            type="button"
                                            role="menuitem"
                                            onClick={closeScheduleMenu}
                                            className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                                          >
                                            Close
                                          </button>
                                        </div>,
                                        document.body
                                      )}
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {!paymentScheduleOnly && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Notes & terms</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Optional</p>
          </div>

          {!notesTermsExpanded ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setNotesTermsExpanded(true)}
                disabled={criticalFieldsLocked}
                className="inline-flex h-9 items-center whitespace-nowrap rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Add notes & terms
              </button>
            </div>
          ) : (
            <div
              className={`mt-5 grid transition-all duration-200 ease-out ${
                notesTermsExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="space-y-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (!hasNotesOrTerms) setNotesTermsExpanded(false);
                      }}
                      disabled={hasNotesOrTerms || criticalFieldsLocked}
                className="whitespace-nowrap text-xs font-medium text-slate-500 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Remove notes & terms
                    </button>
                  </div>
                  {hasNotesOrTerms && (
                    <p className="-mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Clear both fields to remove this section.
                    </p>
                  )}
                  <div>
                    <label className={labelClass}>Notes (optional)</label>
                    <textarea
                      className={inputClass(false) + ' h-auto py-2.5'}
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Internal or customer-facing notes"
                      disabled={criticalFieldsLocked}
                    />
                  </div>
                  {!usePaymentSchedule && (
                    <div>
                      <label className={labelClass}>Terms (e.g. payment terms)</label>
                      <textarea
                        className={inputClass(false) + ' h-auto py-2.5'}
                        rows={2}
                        value={terms}
                        onChange={(e) => setTerms(e.target.value)}
                        placeholder="Net 30, due on receipt, etc."
                        disabled={criticalFieldsLocked}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
        )}

        {/* Actions */}
        {paymentScheduleOnly && invoiceId ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 dark:border-slate-800">
            <Link
              href={`/dashboard/invoices/${invoiceId}`}
              className="whitespace-nowrap text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Back to invoice
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="whitespace-nowrap rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {submitting ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        ) : workspaceEmbed && onWorkspaceBack ? (
          workspaceMobileSuppressFooter ? null : (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 dark:border-slate-800">
              <button
                type="button"
                onClick={onWorkspaceBack}
                className="whitespace-nowrap text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Back to preview
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="whitespace-nowrap rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {submitting ? 'Saving…' : invoiceId ? 'Save changes' : 'Save as draft'}
              </button>
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 dark:border-slate-800">
            <Link
              href="/dashboard/invoices/new"
              className="whitespace-nowrap text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="whitespace-nowrap rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {submitting ? 'Saving…' : invoiceId ? 'Save changes' : 'Save as draft'}
            </button>
          </div>
        )}
      </form>

        {/* Invoice Preview – same source of truth as form */}
        {showLivePreviewAside && (
        <aside
          className={cn(
            'min-w-0 space-y-4 self-start',
            workspaceEmbed
              ? 'w-full lg:w-[min(420px,34vw)] lg:max-w-[420px] lg:shrink-0 lg:overflow-visible'
              : 'xl:sticky xl:top-24 xl:self-start',
            workspaceMobileTabMode && workspaceMobilePanel === 'form' && 'hidden'
          )}
        >
          <h2
            className={cn(
              'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400',
              workspaceMobileTabMode && 'sr-only'
            )}
          >
            {paymentScheduleOnly ? 'Live preview' : 'Invoice preview'}
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:shadow-none">
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{business.name}</p>
              {(business.address_line1 || business.address_line2 || business.city || business.state || business.postal_code || business.country) && (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {[business.address_line1, business.address_line2].filter(Boolean).join(', ')}
                  {[business.address_line1, business.address_line2].filter(Boolean).length > 0 && <br />}
                  {[business.city, business.state].filter(Boolean).join(', ')}
                  {(business.city || business.state) && business.postal_code && ` ${business.postal_code}`}
                  {business.country && (business.city || business.state || business.postal_code) ? `, ${business.country}` : business.country}
                </p>
              )}
              {business.tax_id && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tax ID: {business.tax_id}</p>
              )}
            </div>

            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Bill to</p>
              {customerName.trim() ? (
                <>
                  {useDeliveryAddress ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {/* Billing block (order: name -> billing address -> city/state -> email -> phone -> contact) */}
                      <div className="p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Billing address</p>
                        <p className="mt-1 font-medium text-slate-900 dark:text-white">{customerName}</p>
                        {customerCompany.trim() && (
                          <p className="text-sm text-slate-600 dark:text-slate-400">{customerCompany}</p>
                        )}

                        {(billingAddress || billingCity || billingState || billingPostalCode || billingCountry) ? (
                          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                            {billingAddress}
                            {(billingCity || billingStateName || billingPostalCode || billingCountryName) && (
                              <>
                                {billingAddress && <br />}
                                {[billingCity, billingStateName || billingState, billingPostalCode].filter(Boolean).join(', ')}
                                {billingCountryName &&
                                  (billingCity || billingState || billingPostalCode ? (
                                    <>
                                      <br />
                                      {billingCountryName}
                                    </>
                                  ) : (
                                    billingCountryName
                                  ))}
                              </>
                            )}
                            {!billingAddress &&
                              !(billingCity || billingState || billingPostalCode || billingCountry) &&
                              '—'}
                          </p>
                        ) : null}

                        {customerEmail.trim() && (
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{customerEmail}</p>
                        )}
                        {billingPhone.trim() && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Phone: {billingPhone}</p>
                        )}
                        {contactPerson.trim() && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contact: {contactPerson}</p>
                        )}
                      </div>

                      {/* Delivery block (order: name -> delivery address -> city/state -> email -> phone -> contact) */}
                      <div className="p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Delivery address</p>
                        {deliveryCompany.trim() ? (
                          <p className="mt-1 font-medium text-slate-900 dark:text-white">{deliveryCompany}</p>
                        ) : null}

                        {(
                          deliveryAddress ||
                          deliveryCity ||
                          deliveryState ||
                          deliveryPostalCode ||
                          deliveryCountry ||
                          deliveryContactPerson
                        ) ? (
                          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                            {deliveryAddress}
                            {(deliveryCity || deliveryStateName || deliveryPostalCode || deliveryCountryName) && (
                              <>
                                {deliveryAddress && <br />}
                                {[deliveryCity, deliveryStateName || deliveryState, deliveryPostalCode].filter(Boolean).join(', ')}
                                {deliveryCountryName &&
                                  (deliveryCity || deliveryState || deliveryPostalCode ? (
                                    <>
                                      <br />
                                      {deliveryCountryName}
                                    </>
                                  ) : (
                                    deliveryCountryName
                                  ))}
                              </>
                            )}
                            {!deliveryAddress &&
                              !(deliveryCity || deliveryState || deliveryPostalCode || deliveryCountry) &&
                              '—'}
                          </p>
                        ) : null}

                        {deliveryEmail.trim() && (
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{deliveryEmail}</p>
                        )}
                        {deliveryPhone && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Phone: {deliveryPhone}</p>
                        )}
                        {deliveryContactPerson && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contact: {deliveryContactPerson}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Single billing-only layout (order: name -> billing address -> city/state -> email -> phone -> contact) */
                    <>
                      <p className="mt-1 font-medium text-slate-900 dark:text-white">{customerName}</p>
                      {customerCompany.trim() && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">{customerCompany}</p>
                      )}

                      {(billingAddress || billingCity || billingState || billingPostalCode || billingCountry) && (
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                          {billingAddress}
                          {(billingCity || billingStateName || billingPostalCode || billingCountryName) && (
                            <>
                              {billingAddress && <br />}
                              {[billingCity, billingStateName || billingState, billingPostalCode].filter(Boolean).join(', ')}
                              {billingCountryName &&
                                (billingCity || billingState || billingPostalCode ? (
                                  <>
                                    <br />
                                    {billingCountryName}
                                  </>
                                ) : (
                                  billingCountryName
                                ))}
                            </>
                          )}
                          {!billingAddress &&
                            !(billingCity || billingState || billingPostalCode || billingCountry) &&
                            '—'}
                        </p>
                      )}

                      {customerEmail.trim() && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{customerEmail}</p>
                      )}
                      {billingPhone.trim() && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Phone: {billingPhone}</p>
                      )}
                      {contactPerson.trim() && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contact: {contactPerson}</p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm italic text-slate-400 dark:text-slate-500">Client name</p>
              )}
            </div>

            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Invoice #</span>
                <span className="text-right font-medium text-slate-700 dark:text-slate-300">
                  {invoiceId
                    ? (editInvoiceNumber?.trim() ||
                        String((initialData?.invoice as { invoice_number?: string | null } | undefined)?.invoice_number ?? '').trim() ||
                        '—')
                    : 'Auto-generated when saved'}
                </span>
              </div>
              {referencePo.trim() && (
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Reference / PO</span>
                  <span className="text-slate-700 dark:text-slate-300">{referencePo}</span>
                </div>
              )}
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Issue date</span>
                <span className="text-slate-700 dark:text-slate-300">{issueDate ? formatDisplayDate(issueDate) : '—'}</span>
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Due date</span>
                <span className="text-slate-700 dark:text-slate-300">{dueDate ? formatDisplayDate(dueDate) : '—'}</span>
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Status</span>
                <span className="text-slate-700 dark:text-slate-300">{status}</span>
              </div>
            </div>

            <div className="border-b border-slate-200 dark:border-slate-800">
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed text-xs">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-14" />
                    <col className="w-20" />
                    <col className="w-24" />
                    <col className="w-14" />
                    <col className="w-24" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tax %</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {lineItems.map((item, index) => {
                      const lineTotal = item.quantity * item.unit_price;
                      const lineTax = lineTotal * (item.tax_percent / 100);
                      const lineTotalWithTax = lineTotal + lineTax;
                      return (
                        <tr key={index}>
                          <td className="px-4 py-3 text-slate-900 dark:text-white">
                            {item.name.trim() || '—'}
                            {item.description.trim() && (
                              <span className="mt-0.5 block text-slate-500 dark:text-slate-400">{item.description}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                            {formatInvoiceUnitLabelForDisplay(item.unit_label)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoneyCodeFirst(item.unit_price, invoiceCurrency)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{item.tax_percent ? `${item.tax_percent}%` : '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 dark:text-white">{formatMoneyCodeFirst(lineTotalWithTax, invoiceCurrency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {timeSummaryPreview && timeSummaryPreview.rows.length > 0 ? (
                <div className="border-t border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/25">
                  <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Time Summary</p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    Work hours from line items above. Invoice subtotal and total follow in the next section.
                  </p>
                  <div className="mt-2 space-y-1.5 text-xs">
                    {timeSummaryPreview.rows.map((row, idx) => (
                      <div
                        key={`${row.assignee}-${idx}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 gap-y-0.5 text-slate-700 dark:text-slate-300"
                      >
                        <span className="min-w-0 truncate font-medium text-slate-900 dark:text-white">{row.assignee}</span>
                        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-400">{row.detail}</span>
                        <span className="shrink-0 text-right tabular-nums font-medium text-slate-900 dark:text-white">{row.amount}</span>
                      </div>
                    ))}
                    <div className="border-t border-slate-200 pt-2 dark:border-slate-700" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <span>{timeSummaryPreview.footer.label}</span>
                      <span className="tabular-nums">{timeSummaryPreview.footer.hours}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice totals</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoneyCodeFirst(subtotal, invoiceCurrency)}</span>
                </div>
                {effectiveDiscount > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>
                      {discountPercent > 0 ? `Discount (${discountPercent}%)` : 'Discount'}
                    </span>
                    <span className="tabular-nums">−{formatMoneyCodeFirst(effectiveDiscount, invoiceCurrency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>
                    {taxPercent > 0 ? `Tax (${taxPercent}%)` : 'Tax'}
                  </span>
                  <span className="tabular-nums">{formatMoneyCodeFirst(totalTax, invoiceCurrency)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold dark:border-slate-700">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoneyCodeFirst(total, invoiceCurrency)}</span>
                </div>
              </div>
            </div>

            {usePaymentSchedule && invoice.paymentSchedule.length > 0 && (
              <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Payment schedule</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full table-fixed text-xs">
                    <colgroup>
                      <col />
                      <col className="w-28" />
                      <col className="w-28" />
                      <col className="w-20" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="py-2 pr-3 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Description
                        </th>
                        <th className="py-2 pr-3 text-right font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Amount
                        </th>
                        <th className="py-2 pr-3 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Due Date
                        </th>
                        <th className="py-2 text-left font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {invoice.paymentSchedule.map((r, idx) => {
                        const st = ((r.status ?? 'pending') as 'pending' | 'paid') ?? 'pending';
                        const isOverdue =
                          st !== 'paid' &&
                          Boolean(r.due_date) &&
                          new Date(String(r.due_date)) <
                            new Date(new Date().toISOString().slice(0, 10));
                        const statusText = getScheduleStatusText(r, isOverdue);
                        return (
                          <tr key={String(r.id ?? `idx-${idx}`)}>
                            <td className="py-2 pr-3 text-slate-900 dark:text-white">
                              {r.description || '—'}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-900 dark:text-white">
                              {formatMoneyCodeFirst(Number(r.amount || 0), invoiceCurrency)}
                            </td>
                            <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
                              {r.due_date ? formatDisplayDate(String(r.due_date)) : '—'}
                            </td>
                            <td className="py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{statusText}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(notes.trim() || (!usePaymentSchedule && terms.trim())) && (
              <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Notes & terms</p>
                {notes.trim() && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{notes}</p>
                )}
                {!usePaymentSchedule && terms.trim() && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{terms}</p>
                )}
              </div>
            )}

            <InvoicePaymentMethods
              settings={business.payment_settings ?? null}
              stripeChargesEnabled={business.stripe_charges_enabled}
            />
          </div>
        </aside>
        )}
      </div>

      {typeof document !== 'undefined' &&
        scheduleActivationConfirmOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[480] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-activation-confirm-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/50 dark:bg-black/60"
              onClick={() => setScheduleActivationConfirmOpen(false)}
              aria-label="Cancel"
            />
            <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <h3
                id="schedule-activation-confirm-title"
                className="text-base font-semibold text-slate-900 dark:text-white"
              >
                Activate Payment Schedule
              </h3>
              <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                Once this payment schedule is activated, it cannot be removed or changed.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => setScheduleActivationConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-zenzex-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zenzex-700"
                  onClick={() => {
                    bypassScheduleActivationConfirmRef.current = true;
                    setScheduleActivationConfirmOpen(false);
                    invoiceFormRef.current?.requestSubmit();
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {businessId ? (
        <CustomerFormModal
          open={createCustomerModalOpen}
          onClose={() => setCreateCustomerModalOpen(false)}
          onSaved={handleCustomerCreated}
          businessId={businessId}
          companyBaseCurrency={business?.currency}
        />
      ) : null}

      <CustomerRequiredModal
        open={customerRequiredModalOpen}
        onClose={() => setCustomerRequiredModalOpen(false)}
        returnTo={manualInvoiceReturnTo}
        variant="invoice"
      />

      {invoiceId ? (
        <PaymentModal
          open={schedulePaymentModal !== null}
          onClose={() => setSchedulePaymentModal(null)}
          invoiceId={invoiceId}
          mode="installment"
          amount={schedulePaymentModal ? Number(schedulePaymentModal.row.amount ?? 0) : 0}
          remainingBalance={liveBalanceDue}
          scheduleItemId={schedulePaymentModal?.row.id != null ? String(schedulePaymentModal.row.id) : null}
          issueDate={issueDate || null}
          overlayZClass="z-[450]"
          onSuccess={handleSchedulePaymentModalSuccess}
          onError={(msg) => showErrorToast(msg)}
        />
      ) : null}
      <UpgradePlanModal
        open={upgradeModal != null}
        trigger={upgradeModal ?? 'automation'}
        onClose={() => setUpgradeModal(null)}
        onUpgrade={() => {
          setUpgradeModal(null);
          window.location.href = '/settings';
        }}
      />
    </div>
  );
}
