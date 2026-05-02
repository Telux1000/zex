import { ChevronDown } from 'lucide-react';
import { LANDING_TESTIMONIALS } from '@/lib/landing/landing-testimonials';
import { cn } from '@/lib/utils/cn';

function TestimonialCard({
  name,
  role,
  avatarUrl,
  quote,
}: (typeof LANDING_TESTIMONIALS)[number]) {
  return (
    <blockquote className="flex h-full flex-col rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)] p-5 text-left shadow-sm">
      <div className="flex items-center gap-3">
        <img
          src={avatarUrl}
          alt={`Avatar of ${name}`}
          className="h-10 w-10 shrink-0 rounded-full border border-[var(--sidebar-border)]"
          loading="lazy"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{role}</p>
        </div>
      </div>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        &ldquo;{quote}&rdquo;
      </p>
      <p className="mt-3 text-xs tracking-wide text-amber-500 dark:text-amber-400" aria-label="5 out of 5 stars">
        ★★★★★
      </p>
    </blockquote>
  );
}

/** Narrow viewports: one quote + details for the rest; md+ unchanged grid. */
export function LandingHeroTestimonials() {
  const [first, ...rest] = LANDING_TESTIMONIALS;

  return (
    <div className="mt-8 sm:mt-10">
      <h3 className="text-center text-base font-semibold text-slate-900 dark:text-white sm:text-lg">
        Loved by freelancers and businesses
      </h3>

      <div className="mt-5 md:hidden">
        <TestimonialCard {...first} />
        <details className="group mt-4 rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)]">
          <summary
            className={cn(
              'flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-colors',
              'hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/40 dark:text-white dark:hover:bg-slate-800/50',
              '[&::-webkit-details-marker]:hidden',
            )}
          >
            <span>Read more testimonials</span>
            <ChevronDown
              className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400"
              aria-hidden
            />
          </summary>
          <div className="border-t border-[var(--sidebar-border)] p-4">
            <div className="flex flex-col gap-4">
              {rest.map((t) => (
                <TestimonialCard key={t.id} {...t} />
              ))}
            </div>
          </div>
        </details>
      </div>

      <div className="mt-5 hidden gap-4 sm:mt-6 sm:gap-5 md:grid md:grid-cols-3">
        {LANDING_TESTIMONIALS.map((t) => (
          <TestimonialCard key={t.id} {...t} />
        ))}
      </div>
    </div>
  );
}
