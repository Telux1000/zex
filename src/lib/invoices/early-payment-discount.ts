import type { PaymentSettings } from '@/lib/database.types';

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type EarlyPaymentDiscountResult = {
  enabled: boolean;
  percent: number;
  days: number;
  expires_on: string | null; // YYYY-MM-DD (local-agnostic)
  eligible: boolean;
  original_due: number;
  discount_amount: number;
  payable_now: number;
};

export function computeEarlyPaymentDiscount(params: {
  settings: PaymentSettings | null | undefined;
  issue_date: string | null | undefined; // YYYY-MM-DD
  now: Date;
  balance_due: number;
}): EarlyPaymentDiscountResult {
  const originalDue = Number(params.balance_due ?? 0) || 0;
  const settings = params.settings ?? null;
  const pctRaw = Number((settings as any)?.early_payment_discount_percent ?? 0) || 0;
  const daysRaw = Number((settings as any)?.early_payment_discount_days ?? 0) || 0;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const days = Math.max(0, Math.floor(daysRaw));

  const enabled = pct > 0 && days > 0 && originalDue > 0;
  if (!enabled || !params.issue_date) {
    return {
      enabled: false,
      percent: pct,
      days,
      expires_on: null,
      eligible: false,
      original_due: originalDue,
      discount_amount: 0,
      payable_now: originalDue,
    };
  }

  // Expiry is issue_date + N days (inclusive end-of-day). We compare YYYY-MM-DD strings.
  const issue = new Date(`${params.issue_date}T00:00:00.000Z`);
  const expiry = new Date(issue);
  expiry.setUTCDate(expiry.getUTCDate() + days);
  const expiresOn = toISODate(expiry);
  const today = toISODate(params.now);
  const eligible = today <= expiresOn;

  if (!eligible) {
    return {
      enabled: true,
      percent: pct,
      days,
      expires_on: expiresOn,
      eligible: false,
      original_due: originalDue,
      discount_amount: 0,
      payable_now: originalDue,
    };
  }

  const payable = Math.round(originalDue * (1 - pct / 100) * 100) / 100;
  const payableNow = Math.max(0, payable);
  const discountAmount = Math.round((originalDue - payableNow) * 100) / 100;

  return {
    enabled: true,
    percent: pct,
    days,
    expires_on: expiresOn,
    eligible: true,
    original_due: originalDue,
    discount_amount: Math.max(0, discountAmount),
    payable_now: payableNow,
  };
}

