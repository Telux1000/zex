import { isSupportedCurrency } from '@/lib/currency/supported';

/** ISO 3166-1 alpha-2 → common ISO 4217 base currency (best-effort). */
const REGION_TO_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  JP: 'JPY',
  CN: 'CNY',
  IN: 'INR',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  SG: 'SGD',
  HK: 'HKD',
  AE: 'AED',
  SA: 'SAR',
  TR: 'TRY',
  BR: 'BRL',
  MX: 'MXN',
  KR: 'KRW',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  IL: 'ILS',
  RU: 'RUB',
  ZA: 'ZAR',
  NG: 'NGN',
  KE: 'KES',
  GH: 'GHS',
  AT: 'EUR',
  BE: 'EUR',
  CY: 'EUR',
  EE: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  GR: 'EUR',
  IE: 'EUR',
  IT: 'EUR',
  LV: 'EUR',
  LT: 'EUR',
  LU: 'EUR',
  MT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  SK: 'EUR',
  SI: 'EUR',
  ES: 'EUR',
};

/**
 * Guess a supported base currency from the browser (no network).
 * Safe to call from client components only.
 */
export function guessBaseCurrencyFromBrowser(): string {
  if (typeof window === 'undefined') return 'USD';
  try {
    const locale = new Intl.Locale(navigator.language).maximize();
    const region = locale.region?.toUpperCase();
    if (region && REGION_TO_CURRENCY[region]) {
      const code = REGION_TO_CURRENCY[region];
      if (isSupportedCurrency(code)) return code;
    }
  } catch {
    /* ignore */
  }
  return 'USD';
}
