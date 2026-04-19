export type SupportedCurrency = { code: string; name: string; decimals: number };

/** Practical invoicing set; extend as needed */
export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: 'USD', name: 'US Dollar', decimals: 2 },
  { code: 'EUR', name: 'Euro', decimals: 2 },
  { code: 'GBP', name: 'British Pound', decimals: 2 },
  { code: 'NGN', name: 'Nigerian Naira', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar', decimals: 2 },
  { code: 'ZAR', name: 'South African Rand', decimals: 2 },
  { code: 'KES', name: 'Kenyan Shilling', decimals: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi', decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen', decimals: 0 },
  { code: 'CNY', name: 'Chinese Yuan', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', decimals: 2 },
  { code: 'CHF', name: 'Swiss Franc', decimals: 2 },
  { code: 'SEK', name: 'Swedish Krona', decimals: 2 },
  { code: 'NOK', name: 'Norwegian Krone', decimals: 2 },
  { code: 'DKK', name: 'Danish Krone', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', decimals: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', decimals: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal', decimals: 2 },
  { code: 'TRY', name: 'Turkish Lira', decimals: 2 },
  { code: 'BRL', name: 'Brazilian Real', decimals: 2 },
  { code: 'MXN', name: 'Mexican Peso', decimals: 2 },
  { code: 'KRW', name: 'South Korean Won', decimals: 0 },
  { code: 'PLN', name: 'Polish Zloty', decimals: 2 },
  { code: 'CZK', name: 'Czech Koruna', decimals: 2 },
  { code: 'HUF', name: 'Hungarian Forint', decimals: 2 },
  { code: 'ILS', name: 'Israeli New Shekel', decimals: 2 },
  { code: 'RUB', name: 'Russian Ruble', decimals: 2 },
];

const byCode = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code.toUpperCase(), c]));

export function isSupportedCurrency(code: string): boolean {
  return byCode.has((code || '').trim().toUpperCase());
}

export function getCurrencyMeta(code: string): SupportedCurrency | undefined {
  return byCode.get((code || 'USD').trim().toUpperCase());
}

export function labelForCurrencyCode(code: string): string {
  const c = getCurrencyMeta(code);
  return c ? `${c.name} (${c.code})` : code.toUpperCase();
}
