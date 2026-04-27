import { formatCountryDisplayName } from '@/lib/addresses/country-display';

export type AddressParts = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

/**
 * Renders a compact, professional address for documents:
 * - Street line(s) first
 * - One line: city, region/state, postal code, country (country shortened via formatCountryDisplayName)
 */
export function formatAddressBlockLines(parts: AddressParts): string[] {
  const lines: string[] = [];
  const l1 = parts.line1?.trim();
  const l2 = parts.line2?.trim();
  if (l1) lines.push(l1);
  if (l2) lines.push(l2);
  const city = parts.city?.trim();
  const state = parts.state?.trim();
  const pc = parts.postal_code?.trim();
  const countryRaw = parts.country?.trim();
  const country = countryRaw ? formatCountryDisplayName(countryRaw) : '';
  const tail: string[] = [];
  if (city) tail.push(city);
  if (state) tail.push(state);
  if (pc) tail.push(pc);
  if (country) tail.push(country);
  if (tail.length) lines.push(tail.join(', '));
  return lines;
}

/** @alias formatAddressBlockLines */
export const formatAddressBlock = formatAddressBlockLines;
