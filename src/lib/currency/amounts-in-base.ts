export function roundMoney2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** `rate` converts 1 unit of invoice currency → base currency */
export function amountsInBase(
  subtotal: number,
  taxAmount: number,
  total: number,
  rate: number
): {
  subtotal_in_base: number;
  tax_amount_in_base: number;
  total_in_base: number;
} {
  const r = Number(rate) > 0 ? Number(rate) : 1;
  return {
    subtotal_in_base: roundMoney2(subtotal * r),
    tax_amount_in_base: roundMoney2(taxAmount * r),
    total_in_base: roundMoney2(total * r),
  };
}

export function balanceDueInBase(balanceDue: number, rate: number): number {
  const r = Number(rate) > 0 ? Number(rate) : 1;
  return roundMoney2(balanceDue * r);
}
