/**
 * Frankfurter (ECB) — no API key. Returns units of `to` per 1 unit of `from`.
 */
export async function fetchExchangeMultiplier(
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  const from = (fromCurrency || 'USD').trim().toUpperCase();
  const to = (toCurrency || 'USD').trim().toUpperCase();
  if (from === to) return 1;

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error(`Exchange rate unavailable (${from} → ${to})`);
  }
  const json = (await res.json()) as { rates?: Record<string, number> };
  const rate = json.rates?.[to];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No rate returned for ${from} → ${to}`);
  }
  return rate;
}
