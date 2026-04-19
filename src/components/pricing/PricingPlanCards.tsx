import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  formatPricingCardMainPrice,
  PLAN_PRICE_YEARLY_DISCOUNT_PERCENT,
  pricingCardShowsYearlySavingsLine,
  type BillingPlan,
  type PlanBillingInterval,
  type PricingPlan,
} from '@/lib/billing/plans';
import { cn } from '@/lib/utils/cn';

export { pricingCardSecondaryCtaClassName } from '@/components/pricing/pricing-card-cta-styles';

export function PricingPlanCards({
  plans,
  billingInterval,
  renderDualCta,
  /** When set (e.g. Billing & Payment), highlights the active plan like the dashboard billing page. */
  currentPlanId,
}: {
  plans: PricingPlan[];
  billingInterval: PlanBillingInterval;
  renderDualCta: (plan: PricingPlan) => { primary: ReactNode; secondary?: ReactNode | null };
  currentPlanId?: BillingPlan | null;
}) {
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4 xl:gap-4">
      {plans.map((plan) => {
        const mainPrice = formatPricingCardMainPrice(plan, billingInterval);
        const current = currentPlanId != null && plan.id === currentPlanId;
        return (
          <div
            key={plan.id}
            className={cn(
              'relative flex h-full flex-col overflow-visible',
              plan.popular
                ? 'rounded-xl border-2 border-indigo-500/45 bg-[var(--card)] p-7 shadow-xl shadow-indigo-950/[0.09] ring-1 ring-indigo-500/15 sm:p-8 dark:border-indigo-400/35 dark:bg-[var(--card)] dark:shadow-black/50 dark:ring-indigo-400/10'
                : 'app-card-surface p-7 sm:p-8',
              current &&
                'ring-2 ring-indigo-500/60 ring-offset-2 ring-offset-[var(--card)] dark:ring-indigo-400/50 dark:ring-offset-slate-900'
            )}
          >
            {(plan.popular || current) && (
              <div className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
                {plan.popular ? (
                  <span className="whitespace-nowrap rounded-full bg-indigo-600 px-3.5 py-1 text-xs font-semibold tracking-wide text-white shadow-sm dark:bg-indigo-500">
                    ⭐ Most popular
                  </span>
                ) : null}
                {current ? (
                  <span className="whitespace-nowrap rounded-full bg-emerald-600 px-3.5 py-1 text-xs font-semibold tracking-wide text-white shadow-sm dark:bg-emerald-500">
                    Your plan
                  </span>
                ) : null}
              </div>
            )}
            <h3
              className={
                plan.popular || current
                  ? 'pt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-white'
                  : 'text-lg font-semibold tracking-tight text-slate-900 dark:text-white'
              }
            >
              {plan.name}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {plan.marketingDescription}
            </p>
            <div className="mt-6 flex flex-col gap-1">
              <p className="flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {mainPrice}
                </span>
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/mo</span>
              </p>
              {pricingCardShowsYearlySavingsLine(plan, billingInterval) ? (
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Billed annually · save {PLAN_PRICE_YEARLY_DISCOUNT_PERCENT}%
                </span>
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
                    // Keep CTA labels (e.g. “Start Free”) on one line in narrow desktop columns
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
