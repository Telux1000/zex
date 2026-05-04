import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  formatPricingCardMainPriceParts,
  formatUsdFromCents,
  formatYearlySavingsComparedToMonthlyBilling,
  PLAN_PRICE_YEARLY_DISCOUNT_PERCENT,
  pricingCardShowsYearlySavingsLine,
  type BillingPlan,
  type PlanBillingInterval,
  type PricingPlan,
} from '@/lib/billing/plans';
import { cn } from '@/lib/utils/cn';

export { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';

export type PricingCardsSubscriptionUi = {
  /** Starter card shows “Your plan” when the effective tier is free (post-trial or never paid). */
  starterShowsYourPlan: boolean;
  /** Paid tier currently in an active trial window. */
  trialActivePlanId: BillingPlan | null;
  /** Short countdown (e.g. “7 days left”) shown under the plan name for the active trial card. */
  trialRemainingShort: string | null;
};

export function PricingPlanCards({
  plans,
  billingInterval,
  renderDualCta,
  /** When set (e.g. Billing & Payment), highlights the active plan like the dashboard billing page. */
  currentPlanId,
  /** Optional local selection (e.g. onboarding/upgrade chooser prior to checkout). */
  selectedPlanId,
  /** Optional card click handler for local plan selection. */
  onPlanClick,
  subscriptionCardUi,
}: {
  plans: PricingPlan[];
  billingInterval: PlanBillingInterval;
  renderDualCta: (plan: PricingPlan) => { primary: ReactNode; secondary?: ReactNode | null };
  currentPlanId?: BillingPlan | null;
  selectedPlanId?: BillingPlan | null;
  onPlanClick?: (plan: BillingPlan) => void;
  subscriptionCardUi?: PricingCardsSubscriptionUi | null;
}) {
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-4 [overflow:visible] sm:grid-cols-2 sm:gap-6 xl:grid-cols-4 xl:gap-4">
      {plans.map((plan) => {
        const { amount: mainPrice, suffix: priceSuffix } = formatPricingCardMainPriceParts(plan, billingInterval);
        const yearlySavings = formatYearlySavingsComparedToMonthlyBilling(plan);
        const trialHere = subscriptionCardUi?.trialActivePlanId === plan.id;
        const starterAsCurrent =
          Boolean(subscriptionCardUi?.starterShowsYourPlan) && plan.id === 'starter';
        const currentByPlanId = currentPlanId != null && plan.id === currentPlanId && !trialHere;
        const current = starterAsCurrent || currentByPlanId;
        const selected = selectedPlanId != null && plan.id === selectedPlanId;
        return (
          <div
            key={plan.id}
            role={onPlanClick ? 'button' : undefined}
            tabIndex={onPlanClick ? 0 : undefined}
            aria-pressed={onPlanClick ? selected : undefined}
            onClick={onPlanClick ? () => onPlanClick(plan.id) : undefined}
            onKeyDown={
              onPlanClick
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onPlanClick(plan.id);
                    }
                  }
                : undefined
            }
            className={cn(
              'relative flex h-full flex-col overflow-visible',
              onPlanClick && 'cursor-pointer',
              plan.popular || trialHere
                ? 'z-20 rounded-xl border-2 border-indigo-500/50 bg-[var(--card)] p-5 shadow-2xl shadow-indigo-950/15 ring-1 ring-indigo-500/20 [transform:translateZ(0)] sm:scale-[1.02] sm:p-8 dark:border-indigo-400/40 dark:shadow-indigo-950/30 dark:ring-indigo-400/15'
                : 'app-card-surface p-5 sm:p-8',
              selected &&
                'border-indigo-300/90 bg-indigo-50/30 dark:border-indigo-400/60 dark:bg-indigo-900/10',
              selected &&
                'ring-2 ring-indigo-500/80 ring-offset-2 ring-offset-[var(--card)] dark:ring-indigo-400/70 dark:ring-offset-slate-900',
              current &&
                'ring-2 ring-indigo-500/60 ring-offset-2 ring-offset-[var(--card)] dark:ring-indigo-400/50 dark:ring-offset-slate-900'
            )}
          >
            {(plan.popular || trialHere || current) && (
              <div className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
                {plan.popular ? (
                  <span className="whitespace-nowrap rounded-full bg-indigo-600 px-3.5 py-1 text-xs font-semibold tracking-wide text-white shadow-sm dark:bg-indigo-500">
                    Most popular
                  </span>
                ) : null}
                {trialHere ? (
                  <span className="whitespace-nowrap rounded-full bg-blue-600 px-3.5 py-1 text-xs font-semibold tracking-wide text-white shadow-sm dark:bg-blue-500">
                    Trial active
                  </span>
                ) : null}
                {current &&
                !(subscriptionCardUi?.starterShowsYourPlan === true && plan.id === 'starter') ? (
                  <span className="whitespace-nowrap rounded-full bg-emerald-600 px-3.5 py-1 text-xs font-semibold tracking-wide text-white shadow-sm dark:bg-emerald-500">
                    Your plan
                  </span>
                ) : null}
              </div>
            )}
            {selected && !current ? (
              <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-400/40 dark:bg-slate-900/80 dark:text-indigo-300">
                <Check className="h-3 w-3" aria-hidden />
                Selected
              </div>
            ) : null}
            <h3
              className={
                plan.popular || current || trialHere
                  ? 'pt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-white'
                  : 'text-lg font-semibold tracking-tight text-slate-900 dark:text-white'
              }
            >
              {plan.name}
            </h3>
            {trialHere && subscriptionCardUi?.trialRemainingShort ? (
              <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                {subscriptionCardUi.trialRemainingShort}
              </p>
            ) : null}
            <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {plan.marketingDescription}
            </p>
            <div className="mt-5 flex flex-col gap-1 sm:mt-6">
              <p className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                  {mainPrice}
                </span>
                {priceSuffix ? (
                  <span className="text-2xl font-bold text-slate-800 dark:text-slate-200 sm:text-3xl">
                    {priceSuffix}
                  </span>
                ) : null}
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/mo</span>
              </p>
              {billingInterval === 'yearly' && !plan.isFree && plan.billedAnnuallyTotalCents != null && (
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500">
                  {formatUsdFromCents(plan.billedAnnuallyTotalCents)}
                  {priceSuffix}/year total
                </p>
              )}
              {pricingCardShowsYearlySavingsLine(plan, billingInterval) ? (
                <div className="space-y-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  {yearlySavings ? <p>{yearlySavings}</p> : null}
                  <p>Billed annually · save {PLAN_PRICE_YEARLY_DISCOUNT_PERCENT}%</p>
                </div>
              ) : null}
            </div>
            <ul className="mt-8 flex flex-1 flex-col gap-3 text-sm leading-snug text-slate-600 dark:text-slate-400">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400"
                    aria-hidden
                  />
                  {feature}
                </li>
              ))}
            </ul>
            {(() => {
              const { primary, secondary } = renderDualCta(plan);
              return (
                <div
                  className={cn(
                    'mt-8 flex w-full flex-col gap-2.5',
                    // Keep CTA labels (e.g. “Start free”) on one line in narrow desktop columns
                    '[&_button]:inline-flex [&_button]:whitespace-nowrap [&_a]:inline-flex [&_a]:whitespace-nowrap'
                  )}
                >
                  <div className="w-full">{primary}</div>
                  {secondary != null ? (
                    <div className="w-full">{secondary}</div>
                  ) : (
                    // Reserve the same vertical space as the trial row on paid cards so primary CTAs line up across columns on desktop
                    <div className="min-h-[2.5rem] w-full shrink-0" aria-hidden />
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
