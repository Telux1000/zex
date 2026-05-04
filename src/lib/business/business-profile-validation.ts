import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { INDUSTRY_OTHER_KEY } from '@/lib/business/industry-options';
import { normalizeCountryCode } from '@/lib/location';
import { isPhoneCountryCallingCodeOnly, PHONE_MSG } from '@/lib/phone/e164';

export const BUSINESS_PROFILE_FIELD_KEYS = [
  'name',
  'email',
  'phone',
  'industry_key',
  'industry_other_text',
  'address_line1',
  'city',
  'state',
  'country',
] as const;

export type BusinessProfileFieldKey = (typeof BUSINESS_PROFILE_FIELD_KEYS)[number];

/** DOM ids for scroll/focus (must match BusinessProfileForm). */
export const BUSINESS_PROFILE_FIELD_IDS: Record<BusinessProfileFieldKey, string> = {
  name: 'business-profile-field-name',
  email: 'business-profile-field-email',
  phone: 'business-profile-field-phone',
  industry_key: 'business-profile-field-industry',
  industry_other_text: 'business-profile-field-industry-other',
  address_line1: 'business-profile-field-address-line1',
  city: 'business-profile-field-city',
  state: 'business-profile-field-state',
  country: 'business-profile-field-country',
};

/** Visual order in the form (logo block is not validated here). */
export const BUSINESS_PROFILE_FIELD_ORDER: BusinessProfileFieldKey[] = [
  'name',
  'email',
  'phone',
  'industry_key',
  'industry_other_text',
  'address_line1',
  'city',
  'state',
  'country',
];

export type BusinessProfileValidationInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  industry_key?: string | null;
  industry_other_text?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string | null;
};

export type BusinessProfileValidationResult = {
  valid: boolean;
  fieldErrors: Partial<Record<BusinessProfileFieldKey, string>>;
  firstInvalidField: BusinessProfileFieldKey | null;
  /** No business row to validate (distinct from “row exists but empty fields”). */
  noBusinessRow: boolean;
};

export type ValidateBusinessProfileOptions = {
  /**
   * ISO alpha-2 used to parse numbers without a leading + (legacy / national-only).
   * Defaults from `input.country`, then ZA.
   */
  phoneDefaultCountryIso2?: string | null;
};

function isValidBusinessPhone(phone: string, defaultCountryIso2: string): boolean {
  const t = phone.trim();
  if (!t) return false;
  const dc = (normalizeCountryCode(defaultCountryIso2) || 'ZA') as CountryCode;
  let p = parsePhoneNumberFromString(t);
  if (p?.isValid()) return true;
  p = parsePhoneNumberFromString(t, dc);
  return Boolean(p?.isValid());
}

const MESSAGES: Record<BusinessProfileFieldKey, string> = {
  name: 'Your name or business name is required.',
  email: 'Business email is required.',
  phone: 'Business phone is required.',
  industry_key: 'Please select an industry.',
  industry_other_text: 'Tell us your industry.',
  address_line1: 'Business address is required.',
  city: 'City is required.',
  state: 'Select or enter a state or region for this country.',
  country: 'Country is required.',
};

function hasValue(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * When `industryKey` is the shared “other” option, custom text is required (Business Profile + waitlist).
 * @returns Error message or null if valid.
 */
export function validateIndustryKeyRequiresOtherText(
  industryKey: string | null | undefined,
  otherText: string | null | undefined
): string | null {
  const key = String(industryKey ?? '').trim();
  if (key === INDUSTRY_OTHER_KEY && !hasValue(otherText)) {
    return MESSAGES.industry_other_text;
  }
  return null;
}

/**
 * Required for onboarding / core setup: name on invoices, business contact.
 * Country, street address, city, and state/region are optional (add later in Settings → Business Profile).
 */
export function validateBusinessProfileInput(
  input: BusinessProfileValidationInput | null | undefined,
  options?: ValidateBusinessProfileOptions
): BusinessProfileValidationResult {
  const fieldErrors: Partial<Record<BusinessProfileFieldKey, string>> = {};

  if (input == null) {
    return {
      valid: false,
      fieldErrors: {},
      firstInvalidField: null,
      noBusinessRow: true,
    };
  }

  if (!hasValue(input.name)) fieldErrors.name = MESSAGES.name;
  if (!hasValue(input.email)) fieldErrors.email = MESSAGES.email;
  if (!hasValue(input.phone)) fieldErrors.phone = MESSAGES.phone;
  else {
    const rawPhone = String(input.phone);
    if (isPhoneCountryCallingCodeOnly(rawPhone)) {
      fieldErrors.phone = PHONE_MSG.afterCountryCode;
    } else {
      const dc =
        normalizeCountryCode(options?.phoneDefaultCountryIso2 ?? input.country ?? '') || 'ZA';
      if (!isValidBusinessPhone(rawPhone, dc)) {
        fieldErrors.phone = PHONE_MSG.invalid;
      }
    }
  }
  const industryOtherErr = validateIndustryKeyRequiresOtherText(input.industry_key, input.industry_other_text);
  if (industryOtherErr) {
    fieldErrors.industry_other_text = industryOtherErr;
  }

  const firstInvalidField =
    BUSINESS_PROFILE_FIELD_ORDER.find((k) => fieldErrors[k] != null) ?? null;

  return {
    valid: firstInvalidField === null,
    fieldErrors,
    firstInvalidField,
    noBusinessRow: false,
  };
}

export function businessRowToValidationInput(row: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  industry_key?: string | null;
  industry_other_text?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
} | null | undefined): BusinessProfileValidationInput | null {
  if (row == null) return null;
  return {
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    industry_key: row.industry_key ?? null,
    industry_other_text: row.industry_other_text ?? null,
    address_line1: row.address_line1 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    country: row.country ?? null,
  };
}

export function summarizeBusinessProfileValidation(
  r: BusinessProfileValidationResult,
  mode: 'single-or-count' | 'highlighted' = 'single-or-count'
): string {
  if (r.valid) return '';
  if (r.noBusinessRow) return 'Add your business details before finishing setup.';
  const keys = Object.keys(r.fieldErrors) as BusinessProfileFieldKey[];
  if (keys.length === 0) return 'Please complete the highlighted fields.';
  if (keys.length === 1) return r.fieldErrors[keys[0]!]!;
  if (mode === 'highlighted') return 'Please complete the highlighted fields.';
  return `Please complete ${keys.length} required fields.`;
}
