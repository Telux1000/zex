import { INDUSTRY_OTHER_KEY, isKnownIndustryKey } from '@/lib/business/industry-options';
import { normalizeCountryCode } from '@/lib/location';

function normalizeOptionalString(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export type ParsedWaitlistIndustry = {
  industry: string | null;
  /** Free text when `industry` is `other` (same semantics as business `industry_other_text`). */
  industry_custom: string | null;
  /** Legacy clients sending free-text business_type when it is not a known industry key. */
  legacyBusinessTypeFreeText: string | null;
};

/**
 * Prefers `industry` (must be a known key when present).
 * Accepts legacy `business_type`: known keys map to industry; otherwise stored only as legacyBusinessTypeFreeText.
 */
export function parseWaitlistIndustryFromRequest(body: Record<string, unknown>): ParsedWaitlistIndustry {
  const ind = normalizeOptionalString(body.industry, 96);
  const legacyBt = normalizeOptionalString(body.business_type, 120);
  let industry: string | null = null;
  let legacyBusinessTypeFreeText: string | null = null;

  if (ind) {
    if (!isKnownIndustryKey(ind)) {
      return { industry: null, industry_custom: null, legacyBusinessTypeFreeText: null };
    }
    industry = ind;
  } else if (legacyBt) {
    if (isKnownIndustryKey(legacyBt)) {
      industry = legacyBt;
    } else {
      legacyBusinessTypeFreeText = legacyBt;
    }
  }

  let industry_custom: string | null = null;
  if (industry === INDUSTRY_OTHER_KEY) {
    industry_custom = normalizeOptionalString(body.industry_custom, 240);
  }

  return { industry, industry_custom, legacyBusinessTypeFreeText };
}

export function industryFromRequestInvalid(body: Record<string, unknown>): boolean {
  const ind = normalizeOptionalString(body.industry, 96);
  return Boolean(ind && !isKnownIndustryKey(ind));
}

/** ISO 3166-1 alpha-2 when valid; otherwise null (lenient for optional field). */
export function parseWaitlistCountryIsoFromRequest(body: Record<string, unknown>): string | null {
  const c = normalizeOptionalString(body.country, 120);
  if (!c) return null;
  const iso = normalizeCountryCode(c);
  return iso || null;
}
