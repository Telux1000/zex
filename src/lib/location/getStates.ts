import type { StateOption } from './states';
import { states } from './states';

function normalizeCountryCode(countryCode: string): string {
  return (countryCode ?? '').trim().toUpperCase();
}

/**
 * Returns a subdivision list if available; otherwise returns an empty array.
 */
export function getStates(countryCode: string): StateOption[] {
  const code = normalizeCountryCode(countryCode);
  if (!code) return [];
  return states[code] ?? [];
}

