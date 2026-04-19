import type { FinanceSettings } from '@/lib/database.types';
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from '@/lib/currency/supported';

export type { FinanceSettings };

export function normalizeAllowedCurrencies(
  raw: unknown,
  baseCurrency: string
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'allowed_currencies must be an array' };
  const upper = new Set<string>();
  for (const item of raw) {
    const code = String(item ?? '')
      .trim()
      .toUpperCase();
    if (!code) continue;
    if (code.length !== 3) return { ok: false, error: `Invalid currency code: ${code}` };
    if (!isSupportedCurrency(code)) return { ok: false, error: `Unsupported currency: ${code}` };
    upper.add(code);
  }
  const list = Array.from(upper).sort();
  if (list.length > 0 && !list.includes(baseCurrency.toUpperCase())) {
    return {
      ok: false,
      error: `Allowed currencies must include your base currency (${baseCurrency.toUpperCase()}).`,
    };
  }
  return { ok: true, value: list };
}

export function mergeFinanceSettings(
  existing: unknown,
  patch: Partial<FinanceSettings>
): FinanceSettings {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? ({ ...(existing as Record<string, unknown>) } as FinanceSettings)
      : ({} as FinanceSettings);
  if (patch.allowed_currencies !== undefined) {
    base.allowed_currencies = patch.allowed_currencies;
  }
  return base;
}

export const SUPPORTED_CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

/** Non-empty list = restrict invoice currencies to these codes (plus validation elsewhere); null = no list / not configured. */
export function getFinanceAllowedCurrencies(business: {
  finance_settings?: FinanceSettings | null;
}): string[] | null {
  const list = business.finance_settings?.allowed_currencies;
  if (!list || list.length === 0) return null;
  return list;
}
