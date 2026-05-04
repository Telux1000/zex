import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { normalizeCountryCode } from '@/lib/location';

const FALLBACK_ISO2 = 'ZA';

/**
 * ISO alpha-2 inferred from an E.164 or international string, when libphonenumber can derive it.
 */
export function tryParseCountryIso2FromPhone(value: string | null | undefined): string | null {
  const t = String(value ?? '').trim();
  if (!t) return null;
  const p = parsePhoneNumberFromString(t);
  const c = p?.country;
  return c ? String(c) : null;
}

/**
 * Default calling country: saved number → business country → locale hint → South Africa.
 */
export function resolvePhoneDefaultCountryIso2(params: {
  savedE164?: string | null;
  businessCountryIso2?: string | null;
  localeHintIso2?: string | null;
}): string {
  const fromPhone = tryParseCountryIso2FromPhone(params.savedE164);
  if (fromPhone) return normalizeCountryCode(fromPhone) || fromPhone;
  const b = normalizeCountryCode(params.businessCountryIso2 ?? '');
  if (b) return b;
  const l = normalizeCountryCode(params.localeHintIso2 ?? '');
  if (l) return l;
  return FALLBACK_ISO2;
}

/** Best-effort region from `navigator.language` (e.g. en-ZA → ZA). */
export function browserLocaleCountryHint(): string | null {
  if (typeof navigator === 'undefined') return null;
  const lang = String(navigator.language || '');
  const m = lang.match(/[-_]([A-Za-z]{2})\s*$/);
  if (!m?.[1]) return null;
  return normalizeCountryCode(m[1]) || null;
}
