/**
 * True while core setup is incomplete (profile, business, currency).
 * Drives the single dashboard top callout and hiding duplicate setup cards on the home page.
 */
export function shouldShowDashboardSetupCallout(input: { coreSetupComplete: boolean }): boolean {
  return !input.coreSetupComplete;
}

/** @deprecated Use shouldShowDashboardSetupCallout({ coreSetupComplete }). */
export function shouldShowCoreSetupBanner(input: {
  hasBusiness: boolean;
  coreSetupComplete: boolean;
}): boolean {
  return shouldShowDashboardSetupCallout({ coreSetupComplete: input.coreSetupComplete });
}

/** @deprecated Use shouldShowDashboardSetupCallout({ coreSetupComplete: isOnboardingComplete }). */
export function shouldShowUnifiedInvoiceSetupBanner(input: {
  hasBusiness: boolean;
  canCreateInvoice: boolean;
  isOnboardingComplete: boolean;
}): boolean {
  return shouldShowDashboardSetupCallout({ coreSetupComplete: input.isOnboardingComplete });
}
