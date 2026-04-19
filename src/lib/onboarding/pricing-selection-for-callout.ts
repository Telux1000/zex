/**
 * Whether the user has committed a pricing/plan choice (same gate as post-pricing onboarding).
 * Invited members with an existing workspace are treated as satisfied without the pricing timestamp.
 */
export function hasSelectedPlanForSetupCallout(input: {
  onboardingPricingCompletedAt: string | null | undefined;
  hasBusinessWorkspace: boolean;
}): boolean {
  const { onboardingPricingCompletedAt, hasBusinessWorkspace } = input;
  return Boolean(onboardingPricingCompletedAt?.trim()) || hasBusinessWorkspace;
}
