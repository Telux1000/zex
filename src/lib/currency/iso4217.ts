/**
 * Validate a 3-letter ISO 4217 currency code using Intl (engine-supported currencies).
 */
export function isValidIso4217CurrencyCode(code: string): boolean {
  const c = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return false;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: c, currencyDisplay: 'code' }).format(0);
    return true;
  } catch {
    return false;
  }
}
