import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import { normalizeCountryCode } from '@/lib/location';

function asCountryCode(iso2: string | null | undefined): CountryCode {
  return (normalizeCountryCode(String(iso2 ?? '')) || 'ZA') as CountryCode;
}

/** Shared copy for UI + server-side profile validation. */
export const PHONE_MSG = {
  afterCountryCode: 'Enter your phone number after the country code.',
  invalid: 'Enter a valid phone number.',
} as const;

let cachedExactDialCodes: Set<string> | null = null;

function exactInternationalDialCodes(): Set<string> {
  if (cachedExactDialCodes) return cachedExactDialCodes;
  const s = new Set<string>();
  for (const c of getCountries()) {
    try {
      s.add(`+${getCountryCallingCode(c)}`);
    } catch {
      /* ignore unsupported */
    }
  }
  cachedExactDialCodes = s;
  return s;
}

/**
 * True when `raw` is exactly one international calling prefix (e.g. "+27", "+1", "+44"),
 * with no subscriber digits.
 */
export function isPhoneCountryCallingCodeOnly(raw: string | null | undefined): boolean {
  const compact = String(raw ?? '').trim().replace(/\s/g, '');
  if (!compact || compact === '+') return false;
  return exactInternationalDialCodes().has(compact);
}

/**
 * When {@link isPhoneCountryCallingCodeOnly} is true, pick a region for the dial code
 * (prefers `fallbackIso2` when it matches that prefix, e.g. +1 → US).
 */
export function resolveCountryForDialOnlyInput(
  dialCompact: string,
  fallbackIso2: string | null | undefined
): CountryCode {
  const fb = asCountryCode(fallbackIso2);
  if (!isPhoneCountryCallingCodeOnly(dialCompact)) return fb;
  const matches = getCountries().filter((c) => {
    try {
      return `+${getCountryCallingCode(c)}` === dialCompact;
    } catch {
      return false;
    }
  }) as CountryCode[];
  return matches.includes(fb) ? fb : matches[0] ?? fb;
}

/**
 * Returns E.164 when valid, otherwise null (empty input → null).
 */
export function normalizePhoneToE164OrNull(
  raw: string | null | undefined,
  defaultCountryIso2: string | null | undefined
): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (isPhoneCountryCallingCodeOnly(t)) return null;
  const dc = asCountryCode(defaultCountryIso2);
  let p = parsePhoneNumberFromString(t);
  if (p?.isValid()) return p.format('E.164');
  p = parsePhoneNumberFromString(t, dc);
  if (p?.isValid()) return p.format('E.164');
  return null;
}

/** Same as {@link normalizePhoneToE164OrNull} but returns empty string when null (save payloads). */
export function normalizePhoneToE164OrEmpty(
  raw: string | null | undefined,
  defaultCountryIso2: string | null | undefined
): string {
  return normalizePhoneToE164OrNull(raw, defaultCountryIso2) ?? '';
}

export function isValidPhoneForCountry(
  raw: string | null | undefined,
  defaultCountryIso2: string | null | undefined
): boolean {
  const t = String(raw ?? '').trim();
  if (!t) return false;
  if (isPhoneCountryCallingCodeOnly(t)) return false;
  const dc = asCountryCode(defaultCountryIso2);
  let p = parsePhoneNumberFromString(t);
  if (p?.isValid()) return true;
  p = parsePhoneNumberFromString(t, dc);
  return Boolean(p?.isValid());
}

/**
 * Human-friendly display (international spacing). Falls back to trimmed raw if not parseable.
 */
export function formatPhoneForUi(
  raw: string | null | undefined,
  hintCountryIso2?: string | null
): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const dc = asCountryCode(hintCountryIso2);
  let p = parsePhoneNumberFromString(t);
  if (p) return p.formatInternational();
  p = parsePhoneNumberFromString(t, dc);
  if (p) return p.formatInternational();
  return t;
}

/**
 * Prefer E.164 when libphonenumber accepts the value; otherwise preserve legacy digit-only normalization.
 */
export function coercePhoneForStorage(
  raw: string | null | undefined,
  hintCountryIso2: string | null | undefined
): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (isPhoneCountryCallingCodeOnly(t)) return null;
  const e164 = normalizePhoneToE164OrNull(t, hintCountryIso2);
  if (e164) return e164;
  const hasPlus = t.startsWith('+');
  const digits = t.replace(/\D/g, '');
  if (!digits) return null;
  return `${hasPlus ? '+' : ''}${digits}`;
}
