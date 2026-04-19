import { countries } from './countries';

const KNOWN = new Set(countries.map((c) => c.code));

/**
 * Returns a known ISO alpha-2 code, or null.
 */
export function normalizeToKnownCountryCode(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim().toUpperCase();
  if (t.length !== 2) return null;
  if (t === 'XX' || t === 'T1') return null;
  return KNOWN.has(t) ? t : null;
}

/**
 * First locale in Accept-Language with a valid region, e.g. `en-GB,en;q=0.9` → GB.
 */
export function countryCodeFromAcceptLanguage(acceptLanguage: string | null | undefined): string | null {
  if (!acceptLanguage) return null;
  const first = acceptLanguage.split(',')[0]?.trim();
  if (!first) return null;
  const tag = first.split(';')[0]?.trim().replace(/_/g, '-') ?? '';
  if (!tag) return null;
  try {
    const region = new Intl.Locale(tag).region;
    return region ? normalizeToKnownCountryCode(region) : null;
  } catch {
    return null;
  }
}

/**
 * Trusted physical location (edge IP country). Does **not** use Accept-Language.
 * Use this for onboarding Business Profile prefill so `en-GB` is not treated as being in the UK.
 */
export function getGeoCountryCodeFromRequestHeaders(headersList: Headers): string | null {
  const fromHeader =
    headersList.get('x-vercel-ip-country') ||
    headersList.get('cf-ipcountry') ||
    headersList.get('x-appengine-country') ||
    headersList.get('cloudfront-viewer-country') ||
    '';

  return normalizeToKnownCountryCode(fromHeader);
}

/**
 * Region from the first Accept-Language tag (e.g. `en-GB` → GB). **Not** physical location.
 */
export function getRequestLocaleCountryCodeFromHeaders(headersList: Headers): string | null {
  return countryCodeFromAcceptLanguage(headersList.get('accept-language'));
}

/**
 * IP/geo first, then Accept-Language. Suitable for **settings** weak hints only — not onboarding prefill.
 */
export function getSuggestedCountryCodeFromRequestHeaders(headersList: Headers): string | null {
  const fromIp = getGeoCountryCodeFromRequestHeaders(headersList);
  if (fromIp) return fromIp;
  return getRequestLocaleCountryCodeFromHeaders(headersList);
}
