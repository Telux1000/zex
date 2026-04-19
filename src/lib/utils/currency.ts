import { getCurrencyMeta } from '@/lib/currency/supported';

/**
 * Format a money amount for display (e.g. $1,234.56 for USD).
 * Uses Intl so USD shows as $ and amounts include grouping separators.
 */
export function formatCurrencyAmount(amount: number, currencyCode: string): string {
  const code = (currencyCode || 'USD').trim().toUpperCase();
  const dec = getCurrencyMeta(code)?.decimals ?? 2;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(amount);
  } catch {
    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    });
    if (code === 'USD') return `$${formatted}`;
    return `${code} ${formatted}`;
  }
}

/** e.g. USD 1,200.00 — avoids ambiguous symbols */
export function formatMoneyCodeFirst(amount: number, currencyCode: string): string {
  const code = (currencyCode || 'USD').trim().toUpperCase();
  const dec = getCurrencyMeta(code)?.decimals ?? 2;
  const n = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return `${code} ${n}`;
}

/** Compact axis / chart labels in base currency */
export function formatMoneyAxisLabel(amount: number, currencyCode: string): string {
  const code = (currencyCode || 'USD').trim().toUpperCase();
  const a = Number(amount) || 0;
  const abs = Math.abs(a);
  if (abs >= 1_000_000) return `${code} ${(a / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${code} ${Math.round(a / 1000)}k`;
  return formatMoneyCodeFirst(a, code);
}
