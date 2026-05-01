const ZERO_DECIMAL = new Set(
  'BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF UGX VND VUV XAF XOF XPF'.split(' ')
);

/** Paystack API amounts are in subunits (e.g. kobo); return major display units. */
export function paystackSubunitsToMajor(subunits: number, currency: string): number {
  if (ZERO_DECIMAL.has(currency.toUpperCase())) return subunits;
  return subunits / 100;
}
