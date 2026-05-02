import { ChevronDown } from 'lucide-react';
import {
  LANDING_FEATURE_ITEMS,
  LANDING_FEATURE_ITEMS_MOBILE_MORE,
  LANDING_FEATURE_ITEMS_MOBILE_PRIMARY,
  type LandingFeatureDef,
} from '@/lib/landing/landing-features';
import { cn } from '@/lib/utils/cn';

function FeatureCardBody({ title, body, Icon }: LandingFeatureDef) {
  return (
    <>
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</p>
    </>
  );
}

function FeatureLi({ item, className }: { item: LandingFeatureDef; className?: string }) {
  return (
    <li className={cn('app-card-surface app-card-surface-hover flex flex-col p-5 sm:p-6', className)}>
      <FeatureCardBody {...item} />
    </li>
  );
}

/**
 * Desktop (`sm+`): original four-column grid. Mobile: three conversion cards + “View all features” details.
 */
export function LandingFeatureList() {
  return (
    <>
      <div className="sm:hidden">
        <ul className="mt-6 grid list-none gap-3 p-0">
          {LANDING_FEATURE_ITEMS_MOBILE_PRIMARY.map((item) => (
            <FeatureLi key={item.title} item={item} />
          ))}
        </ul>
        <details className="group mt-3 rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)]">
          <summary
            className={cn(
              'flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-colors',
              'hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/40 dark:text-white dark:hover:bg-slate-800/50',
              '[&::-webkit-details-marker]:hidden',
            )}
          >
            <span>View all features</span>
            <ChevronDown
              className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400"
              aria-hidden
            />
          </summary>
          <div className="flex flex-col gap-3 border-t border-[var(--sidebar-border)] p-4">
            {LANDING_FEATURE_ITEMS_MOBILE_MORE.map((item) => (
              <div key={item.title} className="app-card-surface flex flex-col rounded-xl p-5">
                <FeatureCardBody {...item} />
              </div>
            ))}
          </div>
        </details>
      </div>

      <ul className="mt-6 hidden list-none grid-cols-2 gap-4 p-0 sm:mt-8 sm:grid sm:gap-6 lg:mt-12 lg:grid-cols-4">
        {LANDING_FEATURE_ITEMS.map((item) => (
          <FeatureLi key={item.title} item={item} />
        ))}
      </ul>
    </>
  );
}
