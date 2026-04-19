import { getStates } from './getStates';

/**
 * Whether this country code has known subdivisions (states/provinces/regions).
 */
export function hasStates(countryCode: string): boolean {
  return getStates(countryCode).length > 0;
}

