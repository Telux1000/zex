import Stripe from 'stripe';

export type StripeOnboardingStatus =
  | 'not_connected'
  | 'onboarding_required'
  | 'pending'
  | 'pending_verification'
  | 'action_required'
  | 'connected';

export type StripeOnboardingEvaluation = {
  status: StripeOnboardingStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};

function hasItems(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

/**
 * Best-practice Stripe Connect status evaluation.
 *
 * Important: Do NOT treat charges_enabled/payouts_enabled=false as "restricted" by itself,
 * especially in test mode where capabilities may lag. Only mark action_required when
 * Stripe indicates user action is needed (currently_due/past_due/disabled_reason).
 */
export function evaluateStripeConnectAccount(account: Stripe.Account): StripeOnboardingEvaluation {
  const charges_enabled = Boolean(account.charges_enabled);
  const payouts_enabled = Boolean(account.payouts_enabled);
  const details_submitted = Boolean(account.details_submitted);

  const req = account.requirements ?? null;
  const currently_due = req?.currently_due ?? [];
  const past_due = req?.past_due ?? [];
  const pending_verification = req?.pending_verification ?? [];
  const disabled_reason = req?.disabled_reason ?? null;

  // Connected: ready to accept payments and payout
  if (charges_enabled && payouts_enabled) {
    return { status: 'connected', charges_enabled, payouts_enabled, details_submitted };
  }

  // Action required: missing required info or past-due requirements
  if (hasItems(currently_due) || hasItems(past_due)) {
    return { status: 'action_required', charges_enabled, payouts_enabled, details_submitted };
  }

  // Some disabled reasons are informative rather than "action required"
  // Example: requirements.pending_verification -> treat as pending_verification.
  if (disabled_reason && disabled_reason !== 'requirements.pending_verification') {
    return { status: 'action_required', charges_enabled, payouts_enabled, details_submitted };
  }

  if (hasItems(pending_verification) || disabled_reason === 'requirements.pending_verification') {
    return { status: 'pending_verification', charges_enabled, payouts_enabled, details_submitted };
  }

  // Onboarding required: account exists but details not submitted, and nothing is currently due/past due
  if (!details_submitted) {
    return { status: 'onboarding_required', charges_enabled, payouts_enabled, details_submitted };
  }

  // Pending: details submitted, capabilities still not enabled, no due items requiring user action
  return { status: 'pending', charges_enabled, payouts_enabled, details_submitted };
}

