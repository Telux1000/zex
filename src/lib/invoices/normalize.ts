import { roundMoney2 } from '@/lib/currency/amounts-in-base';
import { resolveInvoiceBalanceDue } from '@/lib/invoices/compute-invoice-balance-due';
import { deriveInvoiceStatus } from '@/lib/invoices/status';

type AnyRow = Record<string, unknown>;

export type NormalizedInvoiceRecord = {
  id: string;
  invoice_number: string;
  customer_name: string;
  currency: string;
  base_currency_code: string;
  exchange_rate_to_base: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  subtotal_in_base: number;
  tax_amount_in_base: number;
  total_in_base: number;
  amount_paid: number;
  balance_due: number;
  /** Cumulative refunds in invoice currency (same column as list API). */
  total_refunded: number;
  status: string;
  issue_date: string | null;
  paid_at: string | null;
  due_date: string;
  created_at: string | null;
  updated_at: string | null;
  use_payment_schedule: boolean;
  customer_id: string | null;
  customer_email: string | null;
  reference_po: string | null;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function pick<T = unknown>(row: AnyRow, keys: string[]): T | undefined {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k] as T;
  }
  return undefined;
}

export function normalizeInvoiceRecord(
  row: AnyRow,
  baseCurrency: string
): NormalizedInvoiceRecord | null {
  const id = str(pick(row, ['id', 'invoiceId']), '').trim();
  if (!id) return null;

  const invoiceNumber = str(
    pick(row, ['invoice_number', 'invoiceNumber', 'number']),
    '—'
  );
  const customerName = str(
    pick(row, ['customer_name', 'customerName', 'customer', 'clientName']),
    'Unknown customer'
  );

  const base = str(
    pick(row, ['base_currency_code', 'baseCurrencyCode']),
    baseCurrency || 'USD'
  )
    .trim()
    .toUpperCase();
  const currency = str(
    pick(row, ['currency', 'currency_code', 'currencyCode']),
    base
  )
    .trim()
    .toUpperCase();

  const subtotal = num(pick(row, ['subtotal']));
  const taxAmount = num(pick(row, ['tax_amount', 'taxAmount']));
  const totalRaw = pick(row, ['total', 'total_amount', 'totalAmount']);
  const total =
    totalRaw != null ? num(totalRaw) : Math.max(0, subtotal + taxAmount);

  let rate = num(
    pick(row, ['exchange_rate_to_base', 'exchangeRateToBase']),
    NaN
  );
  if (!Number.isFinite(rate) || rate <= 0) {
    rate = currency === base ? 1 : NaN;
  }

  const totalInBaseRaw = pick(row, ['total_in_base', 'totalAmountInBase']);
  const subtotalInBaseRaw = pick(row, ['subtotal_in_base', 'subtotalInBase']);
  const taxInBaseRaw = pick(row, ['tax_amount_in_base', 'taxAmountInBase']);

  const totalInBase =
    totalInBaseRaw != null
      ? num(totalInBaseRaw)
      : Number.isFinite(rate)
        ? num(total * rate)
        : total;
  const subtotalInBase =
    subtotalInBaseRaw != null
      ? num(subtotalInBaseRaw)
      : Number.isFinite(rate)
        ? num(subtotal * rate)
        : subtotal;
  const taxInBase =
    taxInBaseRaw != null
      ? num(taxInBaseRaw)
      : Number.isFinite(rate)
        ? num(taxAmount * rate)
        : taxAmount;

  const amountPaid = num(pick(row, ['amount_paid', 'amountPaid']), 0);
  const status = str(pick(row, ['status']), 'draft').toLowerCase();
  const normalizedStatus =
    status === 'voided' ? 'cancelled' : status === 'viewed' ? 'sent' : status;

  const totalRefunded = num(pick(row, ['total_refunded', 'totalRefunded']), 0);
  const balanceDue = resolveInvoiceBalanceDue({
    status: normalizedStatus,
    total,
    amount_paid: amountPaid,
    total_refunded: totalRefunded,
  });

  return {
    id,
    invoice_number: invoiceNumber,
    customer_name: customerName,
    currency: currency || base || 'USD',
    base_currency_code: base || 'USD',
    exchange_rate_to_base:
      Number.isFinite(rate) && rate > 0
        ? rate
        : currency === base
          ? 1
          : 0,
    subtotal,
    tax_amount: taxAmount,
    total,
    subtotal_in_base: subtotalInBase,
    tax_amount_in_base: taxInBase,
    total_in_base: totalInBase,
    amount_paid: amountPaid,
    balance_due: Math.max(0, balanceDue),
    total_refunded: totalRefunded,
    status: normalizedStatus || 'draft',
    issue_date:
      str(pick(row, ['issue_date', 'issueDate', 'issuedAt']), '') || null,
    paid_at: str(pick(row, ['paid_at', 'paidAt']), '') || null,
    due_date: str(pick(row, ['due_date', 'dueDate', 'dueAt']), ''),
    created_at: str(pick(row, ['created_at', 'createdAt']), '') || null,
    updated_at: str(pick(row, ['updated_at', 'updatedAt']), '') || null,
    use_payment_schedule: Boolean(
      pick(row, ['use_payment_schedule', 'usePaymentSchedule'])
    ),
    customer_id: str(pick(row, ['customer_id', 'customerId']), '') || null,
    customer_email:
      str(pick(row, ['customer_email', 'customerEmail']), '') || null,
    reference_po: str(pick(row, ['reference_po', 'referencePo']), '') || null,
  };
}

export function getInvoiceDisplayAmount(invoice: NormalizedInvoiceRecord): number {
  return num(invoice.total, 0);
}

export function getInvoiceBaseAmount(invoice: NormalizedInvoiceRecord): number {
  if (Number.isFinite(invoice.total_in_base) && invoice.total_in_base > 0) {
    return num(invoice.total_in_base, 0);
  }
  const rate = num(invoice.exchange_rate_to_base, 0);
  if (rate > 0) return num(invoice.total, 0) * rate;
  return num(invoice.total, 0);
}

export function getInvoicePaidAmount(
  invoice: Pick<NormalizedInvoiceRecord, 'amount_paid'>
): number {
  return Math.max(0, num(invoice.amount_paid, 0));
}

/** Fields needed to convert cumulative `amount_paid` into base (partials use paid/total × total_in_base when available). */
export type InvoiceAmountPaidInBaseInput = Pick<
  NormalizedInvoiceRecord,
  | 'amount_paid'
  | 'total'
  | 'total_in_base'
  | 'exchange_rate_to_base'
  | 'currency'
  | 'base_currency_code'
>;

/** `amount_paid` converted to business base (same rules as total_in_base / exchange_rate). */
export function getInvoiceAmountPaidInBase(invoice: InvoiceAmountPaidInBaseInput): number {
  const paid = getInvoicePaidAmount(invoice);
  if (paid <= 0) return 0;
  const total = num(invoice.total, 0);
  const totalInBase = num(invoice.total_in_base, 0);
  if (Number.isFinite(totalInBase) && totalInBase > 0 && total > 0.0001) {
    return (paid / total) * totalInBase;
  }
  const rate = num(invoice.exchange_rate_to_base, 0);
  const cur = String(invoice.currency || '').toUpperCase();
  const base = String(invoice.base_currency_code || '').toUpperCase();
  if (cur && base && cur === base) return paid;
  if (rate > 0) return paid * rate;
  return paid;
}

export function getInvoiceRemainingBalance(
  invoice: Pick<NormalizedInvoiceRecord, 'total' | 'amount_paid' | 'balance_due'>
): number {
  const total = num(invoice.total, 0);
  const paid = getInvoicePaidAmount(invoice);
  const balanceRaw = invoice.balance_due;
  const balance =
    balanceRaw != null && Number.isFinite(Number(balanceRaw))
      ? Math.max(0, Number(balanceRaw))
      : Math.max(0, total - paid);
  const cap = Math.max(0, total);
  return Math.min(Math.max(0, balance), cap);
}

/**
 * Open balance in business base using stored invoice FX (`total_in_base` / `exchange_rate_to_base`),
 * not live rates. Same proportional rule as dashboard overdue scoring.
 */
export function getInvoiceBalanceDueInBase(
  invoice: Pick<
    NormalizedInvoiceRecord,
    | 'total'
    | 'amount_paid'
    | 'balance_due'
    | 'total_in_base'
    | 'exchange_rate_to_base'
    | 'currency'
    | 'base_currency_code'
  >
): number {
  const bal = getInvoiceRemainingBalance(invoice);
  if (bal <= 0.0001) return 0;
  const total = num(invoice.total, 0);
  const totalInBase = num(invoice.total_in_base, 0);
  if (Number.isFinite(totalInBase) && totalInBase > 0 && total > 0.0001) {
    return roundMoney2((bal / total) * totalInBase);
  }
  const rate = num(invoice.exchange_rate_to_base, 0);
  if (rate > 0) return roundMoney2(bal * rate);
  const cur = String(invoice.currency || '').toUpperCase();
  const base = String(invoice.base_currency_code || '').toUpperCase();
  if (cur && base && cur === base) return roundMoney2(bal);
  return roundMoney2(bal);
}

export function isInvoiceOpenForReporting(
  input: Pick<
    NormalizedInvoiceRecord,
    'status' | 'total' | 'amount_paid' | 'balance_due' | 'total_refunded'
  >
): boolean {
  const st = String(
    deriveInvoiceStatus({
      status: input.status,
      total: input.total,
      amount_paid: input.amount_paid,
      balance_due: input.balance_due,
      total_refunded: input.total_refunded ?? 0,
    })
  ).toLowerCase();
  if (['voided', 'cancelled', 'paid', 'refunded'].includes(st)) return false;
  const bal = resolveInvoiceBalanceDue({
    status: input.status,
    total: input.total,
    amount_paid: input.amount_paid,
    total_refunded: input.total_refunded ?? 0,
  });
  return bal > 0.0001;
}

export function isInvoiceOpen(invoice: NormalizedInvoiceRecord): boolean {
  return isInvoiceOpenForReporting(invoice);
}

export function isInvoiceCancelledOrVoid(
  invoice: Pick<NormalizedInvoiceRecord, 'status'>
): boolean {
  const st = String(invoice.status || '').toLowerCase();
  return st === 'voided' || st === 'cancelled';
}

export type InvoiceOverdueContext = {
  /** Pending schedule row exists with due_date before today */
  hasOverduePendingInstallment?: boolean;
};

export function isPaymentPlanInstallmentOverdue(
  invoice: Pick<NormalizedInvoiceRecord, 'use_payment_schedule'>,
  invoiceId: string,
  overdueInstallmentInvoiceIds: Set<string>
): boolean {
  return (
    !!invoice.use_payment_schedule && overdueInstallmentInvoiceIds.has(invoiceId)
  );
}

export function isInvoiceOverdue(
  invoice: Pick<
    NormalizedInvoiceRecord,
    | 'status'
    | 'due_date'
    | 'balance_due'
    | 'total'
    | 'amount_paid'
    | 'use_payment_schedule'
    | 'total_refunded'
  >,
  ctx?: InvoiceOverdueContext,
  /** When set, compares `due_date` to this YYYY-MM-DD (workspace calendar day). Defaults to UTC “today”. */
  civilTodayYmd?: string
): boolean {
  const derived = deriveInvoiceStatus({
    status: invoice.status,
    total: invoice.total,
    amount_paid: invoice.amount_paid,
    balance_due: invoice.balance_due,
    total_refunded: invoice.total_refunded ?? 0,
  });
  const st = String(derived).toLowerCase();
  if (['paid', 'cancelled', 'voided', 'refunded'].includes(st)) return false;
  if (
    resolveInvoiceBalanceDue({
      status: invoice.status,
      total: invoice.total,
      amount_paid: invoice.amount_paid,
      total_refunded: invoice.total_refunded ?? 0,
    }) <= 0.0001
  )
    return false;
  const today = civilTodayYmd ?? new Date().toISOString().slice(0, 10);
  if (ctx?.hasOverduePendingInstallment) return true;
  if (invoice.due_date && invoice.due_date < today) return true;
  return false;
}

