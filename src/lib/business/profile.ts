import type { Business } from '@/lib/database.types';
import {
  validateBusinessProfileInput,
  type BusinessProfileValidationInput,
} from '@/lib/business/business-profile-validation';

export type {
  BusinessProfileFieldKey,
  BusinessProfileValidationInput,
  BusinessProfileValidationResult,
  ValidateBusinessProfileOptions,
} from '@/lib/business/business-profile-validation';

export {
  validateBusinessProfileInput,
  summarizeBusinessProfileValidation,
  businessRowToValidationInput,
  BUSINESS_PROFILE_FIELD_IDS,
  BUSINESS_PROFILE_FIELD_ORDER,
} from '@/lib/business/business-profile-validation';

export type BusinessLike = Pick<
  Business,
  'name' | 'address_line1' | 'city' | 'state' | 'country' | 'email' | 'phone'
>;

/**
 * Whether the business row satisfies the same rules as {@link validateBusinessProfileInput}.
 */
export function isBusinessProfileComplete(business: BusinessLike | null | undefined): boolean {
  if (business == null) return false;
  const input: BusinessProfileValidationInput = {
    name: business.name,
    email: business.email,
    phone: business.phone,
    address_line1: business.address_line1,
    city: business.city,
    state: business.state,
    country: business.country,
  };
  return validateBusinessProfileInput(input, {
    phoneDefaultCountryIso2: business.country,
  }).valid;
}

/** True when business address line 1 is empty — invoice flows may show a non-blocking “add address” prompt. */
export function isBusinessSenderAddressMissingForInvoices(
  business: Pick<Business, 'address_line1'> | null | undefined
): boolean {
  return !String(business?.address_line1 ?? '').trim();
}
