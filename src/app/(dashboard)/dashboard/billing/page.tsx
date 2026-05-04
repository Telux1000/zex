import { notFound, redirect } from 'next/navigation';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { getPrimaryBusinessForUser, getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { hasPermission } from '@/lib/rbac/permissions';
import {
  formatPlanMonthlyPrice,
  formatTrialDaysRemaining,
  formatTrialDaysRemainingShort,
  normalizeBillingPlan,
  normalizePlanBillingInterval,
  PRICING_TRIAL_DAYS,
  pricingPlans,
  pricingPromoBannerHeadline,
} from '@/lib/billing/plans';
import type { BillingPlan } from '@/lib/billing/plans';
import { fetchAdminPlatformSettings, pricingPlansWithPlatformOverrides } from '@/lib/admin/admin-platform-settings';
import {
  computeEffectiveSubscription,
  fetchOwnerSubscriptionRow,
  reconcileOwnerBillingEntitlements,
  subscriptionLapsedMessage,
  subscriptionRequiresBillingAction,
  trialDaysRemaining,
  trialUrgencyBannerDays,
  type SubscriptionLifecycleStatus,
} from '@/lib/billing/subscription-access';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { BillingCheckoutButton } from '@/components/billing/BillingCheckoutButton';
import { BillingPlansUpgradeSection } from '@/components/billing/BillingPlansUpgradeSection';
import { RegionWaitlistBanner } from '@/components/waitlist/RegionWaitlistBanner';
import { cn } from '@/lib/utils/cn';

type BillingBadgeStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'trial_expired';

function titleCasePlan(plan: BillingPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function toShortDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

function badgeForEffective(effective: SubscriptionLifecycleStatus): BillingBadgeStatus {
  if (effective === 'trial_expired') return 'trial_expired';
  if (effective === 'trialing') return 'trialing';
  if (effective === 'past_due') return 'past_due';
  if (effective === 'cancelled') return 'cancelled';
  return 'active';
}

function StatusBadge({ status }: { status: BillingBadgeStatus }) {
  const styles: Record<BillingBadgeStatus, string> = {
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    trialing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    past_due: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    trial_expired: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  };
  const labels: Record<BillingBadgeStatus, string> = {
    active: 'Active',
    trialing: 'Trialing',
    past_due: 'Past due',
    cancelled: 'Cancelled',
    trial_expired: 'Trial ended',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}

export default async function BillingPaymentsPage({
  searchParams,
}: {
  searchParams?: { checkout?: string };
}) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) redirect('/login');

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) notFound();

  const role = await getEffectiveBusinessRole(supabase, business.id, user.id);
  if (!role || !hasPermission(role, 'manage_payments')) notFound();

  const ownerId = business.ownerId;
  if (!ownerId) notFound();

  const admin = getSupabaseServiceAdmin();
  const platformBilling = admin ? await fetchAdminPlatformSettings(admin) : null;
  const trialDaysConfigured = platformBilling?.trial_days ?? PRICING_TRIAL_DAYS;
  const pricingPlansEffective = platformBilling ? pricingPlansWithPlatformOverrides(platformBilling) : pricingPlans;
  const trialMessagingHeadline = pricingPromoBannerHeadline(trialDaysConfigured);

  const profileClient = admin ?? supabase;
  await reconcileOwnerBillingEntitlements(ownerId);

  const { data: subscriberProfile } = await profileClient
    .from('profiles')
    .select(
      'billing_plan, billing_interval, trial_started_at, trial_ends_at, subscription_status, created_at, trial_used, plan_selection_status'
    )
    .eq('id', ownerId)
    .maybeSingle();

  const plan = normalizeBillingPlan((subscriberProfile as { billing_plan?: unknown } | null)?.billing_plan);

  const subRow = await fetchOwnerSubscriptionRow(supabase, ownerId);
  const { effective, trialEndsAtIso } = computeEffectiveSubscription(subRow ?? {});

  const trialStartedAt =
    (subscriberProfile as { trial_started_at?: string | null } | null)?.trial_started_at ?? null;
  const trialEndsRaw =
    (subscriberProfile as { trial_ends_at?: string | null } | null)?.trial_ends_at ?? null;
  const profileBillingIntervalRaw =
    (subscriberProfile as { billing_interval?: string | null } | null)?.billing_interval ?? null;
  const profileBillingInterval = normalizePlanBillingInterval(profileBillingIntervalRaw) ?? 'yearly';
  const profileCreatedAt =
    (subscriberProfile as { created_at?: string | null } | null)?.created_at ?? null;

  const derivedTrialEnd =
    trialEndsRaw ??
    (effective === 'trialing' && trialStartedAt
      ? (() => {
          const d = new Date(trialStartedAt);
          d.setUTCDate(d.getUTCDate() + trialDaysConfigured);
          return d.toISOString();
        })()
      : null) ??
    (effective === 'trialing' && trialEndsAtIso ? trialEndsAtIso : null);

  const renewalDate = derivedTrialEnd ?? profileCreatedAt;
  const trialDaysLine = effective === 'trialing' ? formatTrialDaysRemaining(derivedTrialEnd) : null;
  const daysLeft = trialDaysRemaining(derivedTrialEnd);
  const trialUrgency = trialUrgencyBannerDays(daysLeft);
  const showPastDueAlert = effective === 'past_due';
  const showTrialExpiredAlert = effective === 'trial_expired';
  const canSwitchPlan = user.id === ownerId;
  const requiresPayment = subscriptionRequiresBillingAction(effective);
  const trialUsed = Boolean((subscriberProfile as { trial_used?: boolean | null } | null)?.trial_used);
  const paidActiveProfile =
    String((subscriberProfile as { subscription_status?: string | null } | null)?.subscription_status ?? '')
      .toLowerCase() === 'active' &&
    String(
      (subscriberProfile as { plan_selection_status?: string | null } | null)?.plan_selection_status ?? ''
    ) === 'PAID_ACTIVE';
  const trialEligibleForButtons =
    !trialUsed && !paidActiveProfile && effective !== 'trialing' && effective !== 'trial_expired';
  const trialRemainingShort =
    effective === 'trialing' ? formatTrialDaysRemainingShort(derivedTrialEnd) : null;
  const subscriptionCardUi = {
    starterShowsYourPlan: plan === 'starter' && effective !== 'trialing',
    trialActivePlanId: effective === 'trialing' ? plan : null,
    trialRemainingShort,
  };
  const checkoutNotice = searchParams?.checkout;

  const planCard = pricingPlansEffective.find((p) => p.id === plan) ?? pricingPlansEffective[0];
  const geoWaitlistActive = canSwitchPlan && (requiresPayment || effective === 'trialing');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Billing & Payments</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage subscription, payment methods, and billing history in one place.
        </p>
      </div>

      {geoWaitlistActive ? <RegionWaitlistBanner active /> : null}

      {showPastDueAlert && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Payment failed. Update your payment method to keep your account active.
            </p>
          </div>
        </div>
      )}

      {showTrialExpiredAlert && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{subscriptionLapsedMessage('trial_expired')}</p>
          </div>
        </div>
      )}

      {checkoutNotice === 'success' && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
        >
          Payment received. Your subscription is active — full access is restored.
        </div>
      )}
      {checkoutNotice === 'cancelled' && (
        <div
          role="status"
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200"
        >
          Checkout was cancelled. You can try again whenever you are ready.
        </div>
      )}

      {effective === 'trialing' && trialUrgency != null && (
        <div
          role="status"
          className="rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-100"
        >
          {trialUrgency === 1
            ? '1 day left in your trial.'
            : `${trialUrgency} days left in your trial.`}{' '}
          Your trial end date does not change when you switch plans.
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Current plan</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                {titleCasePlan(planCard.id)}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {planCard.marketingDescription}
              </p>
              {effective === 'trialing' && (
                <p className="mt-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                  {trialDaysLine ?? `Your ${trialDaysConfigured}-day free trial is active`}
                </p>
              )}
            </div>
            <StatusBadge status={badgeForEffective(effective)} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {effective === 'trialing' ? 'Trial ends' : 'Renewal date'}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                {toShortDate(renewalDate)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Monthly price
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                {formatPlanMonthlyPrice(planCard.id)}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-slate-500" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Payment methods</h3>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {canSwitchPlan
              ? requiresPayment
                ? planCard.isFree
                  ? 'Your trial has ended on the free plan. Pick a paid tier below — checkout opens when you choose Growth, Professional, or Enterprise.'
                  : 'Pay securely to restore access. Renewals follow the payment method you use at checkout.'
                : planCard.isFree
                  ? 'Add a payment method when you move to a paid plan.'
                  : 'Manage your card or bank details in the email receipts from your last successful payment, or use Pay securely below if you need to pay again.'
              : 'The workspace owner manages subscription billing.'}
          </p>
          {canSwitchPlan ? (
            <div className="mt-4">
              {requiresPayment && !planCard.isFree ? (
                <BillingCheckoutButton
                  plan={plan}
                  billingInterval={profileBillingInterval}
                  customerEmail={user.email}
                  billingProviderMode={platformBilling?.billing_provider_mode}
                >
                  Pay securely
                </BillingCheckoutButton>
              ) : requiresPayment && planCard.isFree ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No payment on Starter. Use the Upgrade section below to start checkout for a paid plan.
                </p>
              ) : planCard.isFree ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No payment method is needed on Starter. Choose a paid plan below to add one at checkout.
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  For active subscriptions, use your payment provider’s emails or customer portal to update your payment method.
                </p>
              )}
            </div>
          ) : null}
        </article>
      </section>

      <BillingPlansUpgradeSection
        plans={pricingPlansEffective}
        currentPlan={plan}
        canSwitchPlan={canSwitchPlan}
        requiresPayment={requiresPayment}
        trialMessagingHeadline={trialMessagingHeadline}
        trialDays={trialDaysConfigured}
        customerEmail={user.email}
        billingProviderMode={
          platformBilling?.billing_provider_mode ?? 'flutterwave_primary_paystack_fallback'
        }
        subscriptionCardUi={subscriptionCardUi}
        showPaidPlanTrialButtons={trialEligibleForButtons}
      />

      <section className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Billing history</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Recent invoices and receipts for this workspace.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-2 py-2">Invoice</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--card-border)]">
                <td className="px-2 py-3 text-slate-900 dark:text-slate-100">No records yet</td>
                <td className="px-2 py-3 text-slate-500 dark:text-slate-400">-</td>
                <td className="px-2 py-3 text-slate-500 dark:text-slate-400">-</td>
                <td className="px-2 py-3 text-slate-500 dark:text-slate-400">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
