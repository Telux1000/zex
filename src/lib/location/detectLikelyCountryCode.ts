import { countries } from './countries';

const codes = new Set(countries.map((c) => c.code));

/**
 * Best-effort ISO 3166-1 alpha-2 from the browser locale (e.g. en-US → US, es-MX → MX).
 * Uses `navigator.languages` first so a tag like `es` followed by `es-MX` still resolves.
 */
export function detectLikelyCountryCode(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return '';
  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  const seen = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    try {
      const region = new Intl.Locale(tag).region;
      if (region && codes.has(region)) return region;
    } catch {
      /* skip */
    }
  }
  return '';
}
