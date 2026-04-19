type UnknownRow = Record<string, unknown>;

export type NormalizedPaymentRecord = {
  id: string;
  invoice_id: string | null;
  payment_date: string;
  amount: number;
  amount_in_base: number | null;
  currency: string;
  base_currency_code: string;
  exchange_rate_to_base: number | null;
  status: string;
};

function pick(row: UnknownRow, keys: string[]): unknown {
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
    const v = row[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function str(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toIsoDate(input: unknown): string {
  const raw = str(input, '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function normalizePaymentEventInstant(row: UnknownRow): string {
  const paidAt = toIsoDate(pick(row, ['payment_date', 'paymentDate', 'received_at', 'receivedAt', 'paid_at', 'paidAt']));
  const createdAt = toIsoDate(pick(row, ['created_at', 'createdAt', 'date']));
  if (!paidAt) return createdAt;
  if (!createdAt) return paidAt;
  const paidMs = new Date(paidAt).getTime();
  const createdMs = new Date(createdAt).getTime();
  const nowMs = Date.now();
  // Guard against synthetic future paid_at values; treat recorded event time as canonical then.
  if (paidMs > nowMs + 5 * 60 * 1000 && createdMs <= nowMs + 5 * 60 * 1000) {
    return createdAt;
  }
  return paidAt;
}

export function normalizePaymentRecord(
  row: UnknownRow,
  baseCurrencyCode: string
): NormalizedPaymentRecord | null {
  const base = (baseCurrencyCode || 'USD').toUpperCase();
  // Prefer explicit receipt / paid time when present so “collected” matches money-received semantics.
  const paymentDate = normalizePaymentEventInstant(row);
  const amount = num(
    pick(row, ['amount', 'amount_paid', 'amountPaid', 'paidAmount']),
    0
  );
  const amountInBaseRaw = pick(row, ['amount_in_base', 'amountInBase']);
  const amountInBase = amountInBaseRaw == null ? null : num(amountInBaseRaw, NaN);
  const currency = str(
    pick(row, ['currency', 'currency_code', 'currencyCode', 'payment_currency', 'paymentCurrency']),
    base
  )
    .trim()
    .toUpperCase();
  const rateRaw = pick(row, [
    'exchange_rate_to_base',
    'exchangeRateToBase',
    'exchange_rate',
    'exchangeRate',
  ]);
  const rate = rateRaw == null ? null : num(rateRaw, NaN);
  const status = str(pick(row, ['status']), 'succeeded').trim().toLowerCase();

  if (!paymentDate || (!Number.isFinite(amount) && !Number.isFinite(amountInBase ?? NaN))) {
    return null;
  }

  return {
    id: str(pick(row, ['id']), ''),
    invoice_id: str(pick(row, ['invoice_id', 'invoiceId']), '').trim() || null,
    payment_date: paymentDate,
    amount,
    amount_in_base: Number.isFinite(amountInBase ?? NaN) ? Number(amountInBase) : null,
    currency: currency || base,
    base_currency_code: base,
    exchange_rate_to_base: Number.isFinite(rate ?? NaN) ? Number(rate) : null,
    status,
  };
}

/**
 * Base-currency amount for a **payment ledger row**. Prefer `amount_in_base` — it is set when the
 * payment is recorded (same moment as `exchange_rate_to_base`), not recomputed from live FX.
 */
export function getPaymentBaseAmount(
  payment: NormalizedPaymentRecord,
  baseCurrencyCode: string
): number {
  const aib = payment.amount_in_base;
  // DB default / failed migration can leave amount_in_base = 0 while amount > 0; never trust 0 as authoritative.
  if (aib != null && Number.isFinite(aib) && Math.abs(aib) > 0.0000001) return Number(aib);
  const base = (baseCurrencyCode || 'USD').toUpperCase();
  const cur = (payment.currency || base).toUpperCase();
  const amt = Number(payment.amount || 0);
  const rate = Number(payment.exchange_rate_to_base ?? 0);
  if (cur === base) return amt;
  if (rate > 0) return amt * rate;
  return amt;
}

const EXCLUDED_PAYMENT_STATUSES = new Set([
  'failed',
  'cancelled',
  'canceled',
  'voided',
]);

/**
 * Payments with collection time >= rangeStart.
 * If `rangeEnd` is set, also require t <= rangeEnd (inclusive).
 * Pass `rangeEnd: null` for Collected KPIs so rows are not clipped vs a moving clock after fetch.
 */
export function getPaymentsInFinancialRange(
  payments: UnknownRow[],
  rangeStart: Date,
  rangeEnd: Date | null,
  baseCurrencyCode: string
): NormalizedPaymentRecord[] {
  const start = rangeStart.getTime();
  const endMs = rangeEnd != null ? rangeEnd.getTime() : null;
  return payments
    .map((p) => normalizePaymentRecord(p, baseCurrencyCode))
    .filter((p): p is NormalizedPaymentRecord => Boolean(p))
    .filter((p) => {
      const t = new Date(p.payment_date).getTime();
      if (!Number.isFinite(t)) return false;
      if (t < start) return false;
      if (endMs != null && t > endMs) return false;
      return !EXCLUDED_PAYMENT_STATUSES.has(String(p.status || '').toLowerCase());
    });
}

export function getPaymentsThisMonth(
  payments: UnknownRow[],
  monthStart: Date,
  baseCurrencyCode: string
): NormalizedPaymentRecord[] {
  return getPaymentsInFinancialRange(payments, monthStart, new Date(), baseCurrencyCode);
}

export function getCollectedInFinancialRange(
  payments: UnknownRow[],
  baseCurrencyCode: string,
  rangeStart: Date,
  rangeEnd: Date | null
): number {
  return getPaymentsInFinancialRange(payments, rangeStart, rangeEnd, baseCurrencyCode).reduce(
    (sum, p) => sum + getPaymentBaseAmount(p, baseCurrencyCode),
    0
  );
}

/**
 * Ledger rows already bounded by SQL (e.g. created_at window). Uses the same base-amount rules as
 * the dashboard: never treat amount_in_base === 0 as authoritative when amount > 0.
 */
export function sumLedgerPaymentsBaseAmount(
  rows: UnknownRow[],
  baseCurrencyCode: string
): { total: number; count: number } {
  const base = (baseCurrencyCode || 'USD').toUpperCase();
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const n = normalizePaymentRecord(row, base);
    if (!n) continue;
    if (EXCLUDED_PAYMENT_STATUSES.has(String(n.status || '').toLowerCase())) continue;
    total += getPaymentBaseAmount(n, base);
    count += 1;
  }
  return { total, count };
}

export type DashboardInvoiceCollectedInput = {
  id: string;
  amount_paid: number;
  total: number;
  total_in_base: number;
  base_currency_code?: string;
  paid_at: string | null;
  updated_at: string | null;
  status: string;
  currency: string;
  exchange_rate_to_base: number;
};

export type DashboardCollectedSupplementPoint = {
  /** ISO instant for chart bucketing (latest in-range touch among paid_at / updated_at). */
  atIso: string;
  amountBase: number;
};

export type DashboardCollectedBreakdown = {
  ledger: number;
  /** Reserved; always empty — collections are payment-ledger only. */
  supplements: DashboardCollectedSupplementPoint[];
};

/** Latest `paid_at` / `updated_at` instant inside [startMs, endMs] (dashboard + assistant supplements). */
export function latestInRangeTouchMs(
  paidAt: string | null,
  updatedAt: string | null,
  startMs: number,
  endMs: number | null
): number | null {
  let best: number | null = null;
  for (const raw of [paidAt, updatedAt]) {
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isFinite(t) || t < startMs) continue;
    if (endMs != null && t > endMs) continue;
    if (best == null || t > best) best = t;
  }
  return best;
}

/**
 * Collected cash in range: **payment ledger rows only** (each row is one receipt; partials are
 * separate rows). Invoice-level `amount_paid` is not used — it is cumulative and can mis-allocate
 * partials across periods; legacy rows without a `payments` row contribute $0 until backfilled.
 */
export function getDashboardCollectedBreakdown(
  paymentRows: UnknownRow[],
  _invoices: DashboardInvoiceCollectedInput[],
  baseCurrencyCode: string,
  rangeStart: Date,
  rangeEnd: Date | null
): DashboardCollectedBreakdown {
  const inRangeRows = getPaymentsInFinancialRange(
    paymentRows,
    rangeStart,
    rangeEnd,
    baseCurrencyCode
  );
  const ledger = inRangeRows.reduce((s, p) => s + getPaymentBaseAmount(p, baseCurrencyCode), 0);
  return { ledger, supplements: [] };
}

export function getDashboardCollectedAmount(
  paymentRows: UnknownRow[],
  invoices: DashboardInvoiceCollectedInput[],
  baseCurrencyCode: string,
  rangeStart: Date,
  rangeEnd: Date | null
): number {
  const { ledger, supplements } = getDashboardCollectedBreakdown(
    paymentRows,
    invoices,
    baseCurrencyCode,
    rangeStart,
    rangeEnd
  );
  return ledger + supplements.reduce((s, x) => s + x.amountBase, 0);
}

export function getCollectedThisMonth(
  payments: UnknownRow[],
  baseCurrencyCode: string,
  monthStart: Date
): number {
  return getCollectedInFinancialRange(payments, baseCurrencyCode, monthStart, new Date());
}
