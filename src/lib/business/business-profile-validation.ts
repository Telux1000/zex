export const BUSINESS_PROFILE_FIELD_KEYS = [
  'name',
  'email',
  'phone',
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
  'address_line1',
  'city',
  'state',
  'country',
];

export type BusinessProfileValidationInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
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

const MESSAGES: Record<BusinessProfileFieldKey, string> = {
  name: 'Legal or business name is required.',
  email: 'Business email is required.',
  phone: 'Business phone is required.',
  address_line1: 'Business address is required.',
  city: 'City is required.',
  state: 'Select or enter a state or region for this country.',
  country: 'Country is required.',
};

function hasValue(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Required for onboarding / core setup: legal name, business contact.
 * Country, street address, city, and state/region are optional (add later in Settings → Business Profile).
 */
export function validateBusinessProfileInput(
  input: BusinessProfileValidationInput | null | undefined
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
