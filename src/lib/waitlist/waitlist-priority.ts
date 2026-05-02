import { INDUSTRY_OTHER_KEY, isKnownIndustryKey } from '@/lib/business/industry-options';

const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'msn.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'ymail.com',
]);

/** ISO2 regions treated as higher priority for rollout (heuristic). */
const PRIORITY_COUNTRY_CODES = new Set(['NG', 'ZA', 'GH', 'KE', 'US', 'GB', 'CA', 'AU']);

export type WaitlistPriorityInput = {
  email: string;
  referral_count: number;
  source: string;
  trigger_reason: string | null;
  country: string | null;
  /** Industry option key (preferred). */
  industry?: string | null;
  /** Legacy column; used for scoring only when it matches a known industry key. */
  business_type?: string | null;
};

function resolveIndustryKeyForScore(row: WaitlistPriorityInput): string | null {
  const a = (row.industry ?? '').trim();
  if (a && isKnownIndustryKey(a)) return a;
  const b = (row.business_type ?? '').trim();
  if (b && isKnownIndustryKey(b)) return b;
  return null;
}

export function computeWaitlistPriorityScore(row: WaitlistPriorityInput): number {
  let score = 0;
  const at = row.email.indexOf('@');
  const domain = at >= 0 ? row.email.slice(at + 1).trim().toLowerCase() : '';
  if (domain && !CONSUMER_EMAIL_DOMAINS.has(domain)) {
    score += 5;
  }
  if (row.referral_count >= 3) {
    score += 3;
  }
  if (row.source === 'payment_error') {
    score += 2;
  }
  const cc = (row.country ?? '').trim().toUpperCase();
  if (cc.length === 2 && PRIORITY_COUNTRY_CODES.has(cc)) {
    score += 2;
  }
  const tr = (row.trigger_reason ?? '').toLowerCase();
  if (tr === 'currency_not_supported' || tr === 'provider_failed' || tr === 'no_payment_provider') {
    score += 1;
  }
  const ik = resolveIndustryKeyForScore(row);
  if (ik && ik !== INDUSTRY_OTHER_KEY) {
    score += 1;
  }
  return score;
}
