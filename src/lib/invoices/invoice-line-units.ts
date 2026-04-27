import { formatMoneyCodeFirst } from '@/lib/utils/currency';
import { normalizeLineItemName } from '@/lib/saved-line-items/names';

export { normalizeLineItemName };

/**
 * Shared invoice line billing units (goods + services).
 * Stored in `invoice_items.unit_label` as a short lowercase slug; displayed with formatting helpers.
 */

export const INVOICE_STANDARD_UNIT_VALUES = [
  'item',
  'hour',
  'day',
  'week',
  'month',
  'session',
  'project',
] as const;

export type InvoiceStandardUnit = (typeof INVOICE_STANDARD_UNIT_VALUES)[number];

const STANDARD_DISPLAY: Record<InvoiceStandardUnit, string> = {
  item: 'Item',
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
  session: 'Session',
  project: 'Project',
};

/** Preset options for manual entry UI (value = stored slug). */
export const INVOICE_UNIT_SELECT_OPTIONS: { value: string; label: string }[] = [
  ...INVOICE_STANDARD_UNIT_VALUES.map((v) => ({ value: v, label: STANDARD_DISPLAY[v] })),
];

/**
 * Select `value` for the "Custom…" row in manual entry (not stored in DB).
 * Stored `unit_label` for custom billing stays a normalized slug, e.g. `milestone`.
 */
export const INVOICE_UNIT_CUSTOM_SELECT_VALUE = '__custom__';

const CUSTOM_MAX = 40;

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize user or AI input to a stored label: lowercase, trimmed, short.
 * Empty → "item".
 */
export function normalizeInvoiceUnitLabel(input: string | null | undefined): string {
  const raw = collapseWhitespace(String(input ?? ''));
  if (!raw) return 'item';
  const lower = raw.toLowerCase();
  if (lower.length > CUSTOM_MAX) return lower.slice(0, CUSTOM_MAX);
  return lower;
}

/** Whether the stored value is a known standard unit. */
export function isStandardInvoiceUnit(value: string): value is InvoiceStandardUnit {
  return (INVOICE_STANDARD_UNIT_VALUES as readonly string[]).includes(value);
}

/**
 * Custom unit text in manual/voice forms: trim, lowercase, max length.
 * Empty string is allowed while the user is in Custom mode or clears the field (not persisted as-is).
 */
export function normalizeCustomUnitLabelInput(input: string): string {
  const raw = collapseWhitespace(String(input ?? ''));
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.length > CUSTOM_MAX) return lower.slice(0, CUSTOM_MAX);
  return lower;
}

/**
 * Human-readable unit for PDF/UI (standard → fixed label; custom → title case).
 */
export function formatInvoiceUnitLabelForDisplay(stored: string | null | undefined): string {
  const v = normalizeInvoiceUnitLabel(stored);
  if (isStandardInvoiceUnit(v)) return STANDARD_DISPLAY[v];
  if (!v || v === 'item') return STANDARD_DISPLAY.item;
  return v
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatQuantityNumberForDisplay(q: number): string {
  if (!Number.isFinite(q)) return '0';
  if (Math.abs(q - Math.round(q)) < 1e-7) return String(Math.round(q));
  const t = (Math.round(q * 100) / 100).toString();
  return t;
}

/**
 * Suffix for rate (per unit), e.g. "USD 10.00/hr" — not including leading space.
 * Custom slugs use the stored slug to stay readable in tight tables.
 */
export function getInvoicePerRateSuffix(stored: string | null | undefined): string {
  const v = normalizeInvoiceUnitLabel(stored);
  if (v === 'item') return '/item';
  if (v === 'hour') return '/hr';
  if (v === 'day') return '/day';
  if (v === 'week') return '/wk';
  if (v === 'month') return '/mo';
  if (v === 'session') return '/session';
  if (v === 'project') return '/project';
  return `/${v}`;
}

/**
 * Quantity plus billing unit for invoice previews (no separate "Unit" column).
 */
export function formatQuantityWithUnit(quantity: number, unit: string | null | undefined): string {
  if (!Number.isFinite(quantity)) return '0';
  const s = formatQuantityNumberForDisplay(quantity);
  const n = Math.abs(quantity) < 1e-7 ? 0 : quantity;
  const v = normalizeInvoiceUnitLabel(unit);
  const isOne = Math.abs(n - 1) < 1e-7;
  if (v === 'hour') {
    return isOne ? `${s} hr` : `${s} hrs`;
  }
  if (v === 'day') {
    return isOne ? `${s} day` : `${s} days`;
  }
  if (v === 'item') {
    return isOne ? `${s} item` : `${s} items`;
  }
  if (v === 'week') {
    return isOne ? `${s} week` : `${s} weeks`;
  }
  if (v === 'month') {
    return isOne ? `${s} month` : `${s} months`;
  }
  if (v === 'session') {
    return isOne ? `${s} session` : `${s} sessions`;
  }
  if (v === 'project') {
    return isOne ? `${s} project` : `${s} projects`;
  }
  const w = formatInvoiceUnitLabelForDisplay(v).toLowerCase();
  if (Math.abs(n - 1) < 1e-7) return `${s} ${w}`;
  return `${s} ${w}${w.endsWith('s') ? '' : 's'}`;
}

export type FormatRateWithUnitOptions = {
  /** When false, return money only (e.g. synthetic PDF rows with no per-unit rate). */
  withPerUnitSuffix?: boolean;
};

/**
 * Formatted money plus optional /unit suffix for invoice previews and PDFs.
 * Uses the same “code first” style as the app: `formatMoneyCodeFirst` + /hr, /day, /item, etc.
 */
export function formatRateWithUnit(
  rate: number,
  currency: string,
  unit: string | null | undefined,
  options?: FormatRateWithUnitOptions
): string {
  const withSuffix = options?.withPerUnitSuffix !== false;
  const money = formatMoneyCodeFirst(rate, currency);
  if (!withSuffix) return money;
  return `${money}${getInvoicePerRateSuffix(unit)}`;
}

/**
 * Normalize a single raw AI/API item object: unit_label + rate aliases.
 * Used by the invoice parser pipeline so chat, text, and voice share one path.
 */
export function normalizeRawInvoiceLineItemFromAi(item: Record<string, unknown>): Record<string, unknown> {
  const next = { ...item };
  const rate =
    next.unit_price ??
    next.price ??
    next.rate ??
    (typeof next.unitPrice === 'number' ? next.unitPrice : undefined);
  if (rate !== undefined) next.unit_price = rate;
  delete next.price;
  delete next.rate;
  delete next.unitPrice;

  const ul =
    next.unit_label ??
    next.unit ??
    next.billing_unit ??
    (typeof next.unitLabel === 'string' ? next.unitLabel : undefined);
  if (ul !== undefined) next.unit_label = normalizeInvoiceUnitLabel(String(ul));
  delete next.unit;
  delete next.billing_unit;
  delete next.unitLabel;

  const assigneeRaw =
    next.assignee ??
    next.consultant ??
    next.team_member ??
    (typeof next.assignee_name === 'string' ? next.assignee_name : undefined);
  if (assigneeRaw !== undefined) {
    const t = String(assigneeRaw).trim().slice(0, 200);
    next.assignee = t || undefined;
  }
  delete next.consultant;
  delete next.team_member;
  delete next.assignee_name;

  return next;
}

export function normalizeAiInvoiceItemsArray(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((row) =>
    row && typeof row === 'object' && !Array.isArray(row)
      ? normalizeRawInvoiceLineItemFromAi(row as Record<string, unknown>)
      : row
  );
}
