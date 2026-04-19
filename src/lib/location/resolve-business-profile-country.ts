import { detectLikelyCountryCode } from './detectLikelyCountryCode';
import { normalizeCountryCode } from './normalizeCountryCode';

/** Minimal row shape for onboarding “is this US just the DB default?” heuristic. */
export type BusinessCountryPrefillSnapshot = {
  country: string | null | undefined;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
};

/**
 * `businesses.country` historically defaulted to 'US' on insert. Treat that as “unset” for
 * onboarding prefill until the row has contact/address data, so geo/locale can run.
 */
export function shouldTreatBusinessCountryAsSchemaDefaultUsForOnboarding(
  business: BusinessCountryPrefillSnapshot
): boolean {
  const code = normalizeCountryCode(business.country ?? '');
  if (code !== 'US') return false;
  const hasFootprint =
    Boolean(String(business.email ?? '').trim()) ||
    Boolean(String(business.phone ?? '').trim()) ||
    Boolean(String(business.address_line1 ?? '').trim());
  return !hasFootprint;
}

/**
 * Effective saved country for **onboarding** Business Profile only. Empty means “run detection chain”.
 */
export function resolveSavedCountryForOnboarding(business: BusinessCountryPrefillSnapshot): string {
  if (shouldTreatBusinessCountryAsSchemaDefaultUsForOnboarding(business)) return '';
  return resolveSavedBusinessCountryCode(business.country);
}

/**
 * Normalized ISO code from a stored business row, or empty string.
 */
export function resolveSavedBusinessCountryCode(raw: string | null | undefined): string {
  return normalizeCountryCode(raw ?? '');
}

/**
 * After confirming there is no saved country (settings flow): combined server hint (IP then Accept-Language)
 * → browser locale → fallback.
 */
export function resolveBusinessProfileCountryWithoutSavedRow(
  serverSuggestedCode: string | null | undefined,
  fallbackCode: string
): string {
  const hint = normalizeCountryCode(serverSuggestedCode ?? '');
  if (hint) return hint;
  const locale = typeof window !== 'undefined' ? detectLikelyCountryCode() : '';
  if (locale) return locale;
  return fallbackCode;
}

/** How unsaved onboarding country was chosen (for debug). */
export type OnboardingUnsavedCountryResolution = {
  finalCode: string;
  /** Normalized IP/geo header country (VPN/proxy/DC allowed). */
  detectedFromRequest: string;
  /** Browser `navigator` locale region when detection empty. */
  localeFallback: string;
  usedStaticFallback: boolean;
};

/**
 * First-time Business Profile setup when the row has no real saved country:
 * server-detected country (edge IP headers) → browser locale → `staticFallback` (e.g. US).
 */
export function resolveOnboardingUnsavedCountryPrefill(
  geoCountryCode: string | null | undefined,
  staticFallback: string = 'US'
): OnboardingUnsavedCountryResolution {
  const detectedFromRequest = normalizeCountryCode(geoCountryCode ?? '');
  if (detectedFromRequest) {
    return {
      finalCode: detectedFromRequest,
      detectedFromRequest,
      localeFallback: '',
      usedStaticFallback: false,
    };
  }
  const localeFallback =
    typeof window !== 'undefined' ? detectLikelyCountryCode() : '';
  if (localeFallback) {
    return {
      finalCode: localeFallback,
      detectedFromRequest: '',
      localeFallback,
      usedStaticFallback: false,
    };
  }
  const fb = normalizeCountryCode(staticFallback) || 'US';
  return {
    finalCode: fb,
    detectedFromRequest: '',
    localeFallback: '',
    usedStaticFallback: true,
  };
}
