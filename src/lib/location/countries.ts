import { iso31661, iso31661Reserved } from 'iso-3166';

export type CountryOption = {
  code: string;
  name: string;
};

function buildCountries(): CountryOption[] {
  const entries = [...iso31661, ...iso31661Reserved].filter((c) => c.alpha2 && c.name);
  const countries = entries.map((c) => ({
    code: String(c.alpha2).toUpperCase(),
    name: String(c.name ?? c.alpha2),
  }));

  // De-duplicate by ISO alpha-2 code.
  const byCode = new Map<string, CountryOption>();
  for (const c of countries) byCode.set(c.code, c);

  return Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Complete ISO 3166-1 country list (alpha-2 codes).
 * Exported as a stable, sorted array for searchable dropdowns.
 */
export const countries: CountryOption[] = buildCountries();

