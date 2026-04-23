import type { SupabaseClient } from '@supabase/supabase-js';
import { planIsFree, type BillingPlan } from '@/lib/billing/plans';
import type { PrimaryBusinessRow } from '@/lib/supabase/server-auth';

export type PlanSelectionStatus =
  | 'NOT_SELECTED'
  | 'FREE_SELECTED'
  | 'TRIAL_SELECTED'
  | 'PAID_PENDING_CHECKOUT'
  | 'PAID_ACTIVE';

export type OnboardingStatus = 'NOT_STARTED' | 'READY' | 'IN_PROGRESS' | 'COMPLETED';

export type OnboardingEntryNextAction =
  | 'SHOW_PLAN_SELECTION'
  | 'OPEN_CHECKOUT'
  | 'COMPLETE_PAYMENT'
  | 'GO_TO_ONBOARDING'
  | 'RESUME_ONBOARDING'
  | 'GO_TO_DASHBOARD';

type OnboardingEntryProfile = {
  billing_plan?: unknown;
  billing_interval?: unknown;
  subscription_status?: unknown;
  onboarding_pricing_completed_at?: string | null;
  onboarding_completed_at?: string | null;
  trial_ends_at?: string | null;
  plan_selection_status?: unknown;
  selected_plan_at?: string | null;
  pending_checkout_provider?: unknown;
  pending_checkout_plan?: unknown;
};

export type OnboardingEntryState = {
  selected_plan: BillingPlan | null;
  selected_plan_at: string | null;
  selection_status: PlanSelectionStatus;
  subscription_status: string | null;
  trial_status: 'active' | 'expired' | 'none';
  trial_ends_at: string | null;
  onboarding_status: OnboardingStatus;
  onboarding_ready: boolean;
  should_show_plan_selection: boolean;
  pending_checkout_provider: 'paddle' | null;
  pending_checkout_plan: BillingPlan | null;
  billing_interval: 'monthly' | 'yearly';
  next_action: OnboardingEntryNextAction;
};

export function normalizePlanSelectionStatus(raw: unknown): PlanSelectionStatus {
  switch (raw) {
    case 'FREE_SELECTED':
    case 'TRIAL_SELECTED':
    case 'PAID_PENDING_CHECKOUT':
    case 'PAID_ACTIVE':
      return raw;
    default:
      return 'NOT_SELECTED';
  }
}

function normalizeBillingPlan(raw: unknown): BillingPlan | null {
  if (raw === 'starter' || raw === 'growth' || raw === 'professional' || raw === 'enterprise') return raw;
  return null;
}

function normalizeBillingInterval(raw: unknown): 'monthly' | 'yearly' {
  return raw === 'monthly' ? 'monthly' : 'yearly';
}

function normalizePendingProvider(raw: unknown): 'paddle' | null {
  return raw === 'paddle' ? 'paddle' : null;
}

function computeTrialStatus(subscriptionStatus: string | null, trialEndsAt: string | null): 'active' | 'expired' | 'none' {
  if (String(subscriptionStatus ?? '').toLowerCase() !== 'trialing') return 'none';
  if (!trialEndsAt) return 'active';
  const endMs = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(endMs)) return 'active';
  return endMs > Date.now() ? 'active' : 'expired';
}

function computeOnboardingStatus(input: {
  onboardingCompletedAt: string | null;
  hasBusiness: boolean;
  onboardingReady: boolean;
}): OnboardingStatus {
  if (input.onboardingCompletedAt) return 'COMPLETED';
  if (!input.onboardingReady) return 'NOT_STARTED';
  if (!input.hasBusiness) return 'READY';
  return 'IN_PROGRESS';
}

export function deriveOnboardingEntryState(params: {
  profile: OnboardingEntryProfile | null;
  primaryBusiness: PrimaryBusinessRow | null;
}): OnboardingEntryState {
  const profile = params.profile ?? {};
  const selectedPlan = normalizeBillingPlan(profile.billing_plan);
  const pendingCheckoutPlan = normalizeBillingPlan(profile.pending_checkout_plan);
  const selectionStatus = normalizePlanSelectionStatus(profile.plan_selection_status);
  const subscriptionStatus =
    typeof profile.subscription_status === 'string' && profile.subscription_status.trim()
      ? profile.subscription_status.trim().toLowerCase()
      : null;
  const trialEndsAt = profile.trial_ends_at ?? null;
  const trialStatus = computeTrialStatus(subscriptionStatus, trialEndsAt);
  const hasBusiness = Boolean(params.primaryBusiness?.id);

  const paidReady = selectionStatus === 'PAID_ACTIVE' && subscriptionStatus === 'active';
  const trialReady = selectionStatus === 'TRIAL_SELECTED' && trialStatus === 'active';
  const freeReady = selectionStatus === 'FREE_SELECTED' && selectedPlan != null && planIsFree(selectedPlan);
  const onboardingReadyFromStatus = freeReady || trialReady || paidReady;
  const onboardingReadyFromLegacy = Boolean(profile.onboarding_pricing_completed_at);
  const onboardingReady = onboardingReadyFromStatus || onboardingReadyFromLegacy || hasBusiness;

  const onboardingStatus = computeOnboardingStatus({
    onboardingCompletedAt: profile.onboarding_completed_at ?? null,
    hasBusiness,
    onboardingReady,
  });

  const shouldShowPlanSelection = onboardingStatus !== 'COMPLETED' && !hasBusiness && !onboardingReady;

  let nextAction: OnboardingEntryNextAction = 'SHOW_PLAN_SELECTION';
  if (onboardingStatus === 'COMPLETED') {
    nextAction = 'GO_TO_DASHBOARD';
  } else if (shouldShowPlanSelection) {
    nextAction = selectionStatus === 'PAID_PENDING_CHECKOUT' ? 'COMPLETE_PAYMENT' : 'SHOW_PLAN_SELECTION';
  } else if (!hasBusiness && onboardingReady) {
    nextAction = 'GO_TO_ONBOARDING';
  } else if (hasBusiness && onboardingStatus === 'IN_PROGRESS') {
    nextAction = 'RESUME_ONBOARDING';
  } else if (hasBusiness && onboardingStatus === 'READY') {
    nextAction = 'GO_TO_ONBOARDING';
  }

  return {
    selected_plan: selectedPlan,
    selected_plan_at: profile.selected_plan_at ?? null,
    selection_status: selectionStatus,
    subscription_status: subscriptionStatus,
    trial_status: trialStatus,
    trial_ends_at: trialEndsAt,
    onboarding_status: onboardingStatus,
    onboarding_ready: onboardingReady,
    should_show_plan_selection: shouldShowPlanSelection,
    pending_checkout_provider: normalizePendingProvider(profile.pending_checkout_provider),
    pending_checkout_plan: pendingCheckoutPlan,
    billing_interval: normalizeBillingInterval(profile.billing_interval),
    next_action: nextAction,
  };
}

export async function fetchOnboardingEntryState(
  supabase: SupabaseClient,
  userId: string,
  primaryBusiness: PrimaryBusinessRow | null
): Promise<OnboardingEntryState> {
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'billing_plan, billing_interval, subscription_status, onboarding_pricing_completed_at, onboarding_completed_at, trial_ends_at, plan_selection_status, selected_plan_at, pending_checkout_provider, pending_checkout_plan'
    )
    .eq('id', userId)
    .maybeSingle();

  return deriveOnboardingEntryState({
    profile: (profile as OnboardingEntryProfile | null) ?? null,
    primaryBusiness,
  });
}
