import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';

/** Normalize optional assignee for persistence (trim, max length, empty → null). */
export function normalizeInvoiceAssignee(input: unknown): string | null {
  const t = String(input ?? '').trim();
  if (!t) return null;
  return t.length > 200 ? t.slice(0, 200) : t;
}

export type InvoiceTimeSummaryLineInput = {
  quantity: number;
  unit_price: number;
  amount: number;
  unit_label?: string | null;
  tax_percent?: number | null;
  assignee?: string | null;
};

function isHourUnit(unit: string | null | undefined): boolean {
  return normalizeInvoiceUnitLabel(unit ?? '') === 'hour';
}

function assigneeGroupKey(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  return t ? t : '__unassigned__';
}

function assigneeDisplayLabel(key: string): string {
  return key === '__unassigned__' ? 'Unassigned' : key;
}

function formatHoursQty(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  const rounded = Math.round(x * 1000) / 1000;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return String(rounded);
}

function lineAmountWithTax(item: InvoiceTimeSummaryLineInput): number {
  const line = Number(item.quantity) * Number(item.unit_price);
  const taxPct = Number(item.tax_percent ?? 0);
  return line + line * (taxPct / 100);
}

export type InvoiceTimeSummaryDoc = {
  rows: Array<{
    assignee: string;
    detail: string;
    /** Line amounts for this assignee’s hour lines (same basis as line-item Amount column). */
    amount: string;
  }>;
  /** Hours-only rollup — avoids a second “money total” vs invoice Total. */
  footer: {
    label: string;
    hours: string;
  };
};

/**
 * Read-only Time Summary derived from invoice line items (hour units + optional assignee).
 * Invoice Subtotal/Total are unchanged; row amounts are illustrative of hour-line charges only.
 */
export function buildInvoiceTimeSummaryDoc(
  items: InvoiceTimeSummaryLineInput[],
  options: { show: boolean; currencyCode: string; formatMoney: (amount: number, code: string) => string }
): InvoiceTimeSummaryDoc | null {
  if (!options.show || !Array.isArray(items) || items.length === 0) return null;

  const hourLines = items.filter((it) => isHourUnit(it.unit_label));
  if (hourLines.length === 0) return null;

  const keyOrder: string[] = [];
  const byKey = new Map<
    string,
    { hours: number; amount: number; rates: Set<number> }
  >();

  for (const it of hourLines) {
    const key = assigneeGroupKey(it.assignee);
    if (!byKey.has(key)) {
      byKey.set(key, { hours: 0, amount: 0, rates: new Set() });
      keyOrder.push(key);
    }
    const g = byKey.get(key)!;
    g.hours += Number(it.quantity) || 0;
    g.amount += lineAmountWithTax(it);
    g.rates.add(Number(it.unit_price) || 0);
  }

  const { currencyCode, formatMoney } = options;
  const rows = keyOrder.map((key) => {
    const g = byKey.get(key)!;
    const hrs = formatHoursQty(g.hours);
    const rateArr = Array.from(g.rates).filter((r) => Number.isFinite(r));
    const detail =
      rateArr.length === 1
        ? `${hrs} hrs × ${formatMoney(rateArr[0], currencyCode)}`
        : `${hrs} hrs · mixed rates`;
    return {
      assignee: assigneeDisplayLabel(key),
      detail,
      amount: formatMoney(g.amount, currencyCode),
    };
  });

  let totalHours = 0;
  for (const key of keyOrder) {
    const g = byKey.get(key)!;
    totalHours += g.hours;
  }

  return {
    rows,
    footer: {
      label: 'Total time (hour lines)',
      hours: `${formatHoursQty(totalHours)} hrs`,
    },
  };
}
