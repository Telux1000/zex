/**
 * Dev-only traces for Business Profile country prefill (requirement: visibility into sources).
 */
export type CountryPrefillDebugPayload = {
  variant: 'onboarding' | 'settings';
  /** Effective saved country, or "(none)" when unsaved setup uses detection chain. */
  savedCountry: string;
  /** Server edge IP/geo detection (may be VPN/proxy/datacenter). */
  detectedCountry: string | null;
  /** Accept-Language region on the request (informational; not a prefill tier). */
  requestAcceptLanguageRegion?: string | null;
  /** Browser locale region used only when detection is empty. */
  localeFallback: string | null;
  /** True when neither detection nor browser locale produced a code. */
  usedStaticFallback?: boolean;
  /** ISO code applied to the field (or description when saved wins). */
  finalSelected: string;
  note?: string;
};

export function logCountryPrefillDebug(payload: CountryPrefillDebugPayload): void {
  if (process.env.NODE_ENV === 'production') return;
  console.debug('[zenzex:country-prefill]', payload);
}
