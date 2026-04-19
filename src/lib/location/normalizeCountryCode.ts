import { countries } from './countries';

/**
 * Common spellings not identical to ISO English short names (e.g. ISO uses "United States of America").
 * Keys are lowercased for lookup.
 */
const COUNTRY_NAME_ALIASES: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'u.s.a.': 'US',
  'u.s.': 'US',
  uk: 'GB',
  'united kingdom': 'GB',
  uae: 'AE',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'south korea': 'KR',
  'north korea': 'KP',
};

/**
 * Normalize either an ISO alpha-2 country code (e.g. "US") or a country name (e.g. "United States")
 * into an ISO alpha-2 country code.
 */
export function normalizeCountryCode(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const upper = raw.toUpperCase();
  /** "UK" is not ISO 3166-1 alpha-2; use GB (also fixes flag emoji: UK → wrong pair). */
  if (upper === 'UK') return 'GB';
  const byCode = countries.find((c) => c.code === upper);
  if (byCode) return byCode.code;

  const alias = COUNTRY_NAME_ALIASES[raw.toLowerCase()];
  if (alias) return alias;

  const byName = countries.find((c) => c.name.toLowerCase() === raw.toLowerCase());
  return byName?.code ?? '';
}

