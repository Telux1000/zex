function n(v: unknown, fallback: number): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export function computeNumericForCsv(v: unknown, fallback: number): string {
  return n(v, fallback).toFixed(2);
}

export function computeNumericDiscountForCsv(v: unknown | null | undefined): string {
  if (v == null || v === '') return '0.00';
  return n(v, 0).toFixed(2);
}

export function formatCsvStatus(s: string | null | undefined): string {
  const t = (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return t || '—';
}

type FormatDateOpts = { isoTimestamp?: boolean };

/** YYYY-MM-DD for date columns; full ISO in UTC for timestamps when `isoTimestamp`. */
export function formatCsvDate(
  raw: string | null | undefined,
  opts?: FormatDateOpts
): string {
  if (raw == null || String(raw).trim() === '') return '';
  const s = String(raw);
  if (opts?.isoTimestamp) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) {
      return new Date(t).toISOString();
    }
    return s;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return s;
}
