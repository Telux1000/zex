import { iso31662 } from 'iso-3166';

export type StateOption = {
  code: string;
  name: string;
};

function subdivisionCodeSuffix(code: string): string {
  // ISO 3166-2 format: <CC>-<SUB>
  const parts = String(code).split('-');
  if (parts.length < 2) return String(code);
  return parts.slice(1).join('-');
}

function buildStates(): Record<string, StateOption[]> {
  const byCountry: Record<string, StateOption[]> = {};

  for (const entry of iso31662) {
    const parent = String(entry.parent ?? '').toUpperCase();
    // Only attach subdivisions to actual country alpha-2 parents.
    if (!/^[A-Z]{2}$/.test(parent)) continue;

    const stateCode = subdivisionCodeSuffix(entry.code);
    const name = String(entry.name ?? '').trim();
    if (!stateCode || !name) continue;

    if (!byCountry[parent]) byCountry[parent] = [];
    byCountry[parent].push({ code: stateCode, name });
  }

  for (const countryCode of Object.keys(byCountry)) {
    const unique = new Map<string, StateOption>();
    for (const s of byCountry[countryCode] ?? []) unique.set(s.code, s);
    byCountry[countryCode] = Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  return byCountry;
}

/**
 * Subdivisions map keyed by country alpha-2.
 * State/province `code` uses the ISO 3166-2 suffix (e.g. US-CA -> CA).
 */
export const states: Record<string, StateOption[]> = buildStates();

