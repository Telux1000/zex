import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { countries as locationCountries } from '@/lib/location';

export type CallingCountryRow = {
  iso2: CountryCode;
  name: string;
  dial: string;
};

const nameByIso = new Map(locationCountries.map((c) => [c.code, c.name]));

function buildRows(): CallingCountryRow[] {
  const rows: CallingCountryRow[] = [];
  for (const c of getCountries()) {
    try {
      const dial = getCountryCallingCode(c);
      rows.push({
        iso2: c,
        name: nameByIso.get(String(c)) ?? String(c),
        dial: `+${dial}`,
      });
    } catch {
      /* ignore */
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export const CALLING_COUNTRIES: CallingCountryRow[] = buildRows();
