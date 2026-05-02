'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { LANDING_WAITLIST_EMAIL_INPUT_ID } from '@/lib/landing/landing-waitlist-ids';
import { cn } from '@/lib/utils/cn';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type Props = {
  children: ReactNode;
  /** Overrides default “Join the waitlist” heading. */
  heading?: string;
  /** Optional supporting line below the heading. */
  description?: string;
};

/**
 * Wraps the landing waitlist block: deep-link scroll (#waitlist), header offset, focus email, short highlight.
 */
export function LandingWaitlistSection({ children, heading, description }: Props) {
  const sectionRef = useRef<HTMLElement>(null);

  const focusEmail = useCallback(() => {
    const el = document.getElementById(LANDING_WAITLIST_EMAIL_INPUT_ID) as HTMLInputElement | null;
    el?.focus({ preventScroll: true });
  }, []);

  const pulseHighlight = useCallback(() => {
    const el = sectionRef.current;
    if (!el) return;
    el.setAttribute('data-waitlist-highlight', 'true');
    window.setTimeout(() => {
      el.removeAttribute('data-waitlist-highlight');
    }, 1600);
  }, []);

  const scrollIntoWaitlist = useCallback(
    (behavior: ScrollBehavior) => {
      const el = sectionRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior, block: 'start' });
      const delay = behavior === 'smooth' && !prefersReducedMotion() ? 480 : 100;
      window.setTimeout(() => {
        focusEmail();
        pulseHighlight();
      }, delay);
    },
    [focusEmail, pulseHighlight]
  );

  const handleHash = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#waitlist') return;
    scrollIntoWaitlist(prefersReducedMotion() ? 'auto' : 'smooth');
  }, [scrollIntoWaitlist]);

  useEffect(() => {
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => {
      window.removeEventListener('hashchange', handleHash);
    };
  }, [handleHash]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href !== '#waitlist') return;
      window.setTimeout(() => {
        if (window.location.hash === '#waitlist') {
          focusEmail();
          pulseHighlight();
        }
      }, prefersReducedMotion() ? 0 : 420);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [focusEmail, pulseHighlight]);

  const headingText = heading ?? 'Join the waitlist';

  return (
    <section
      ref={sectionRef}
      id="waitlist"
      aria-labelledby="landing-waitlist-heading"
      aria-describedby={description ? 'landing-waitlist-description' : undefined}
      tabIndex={-1}
      className={cn(
        'scroll-mt-24 rounded-2xl px-1 py-1 outline-none transition-[background-color,box-shadow] duration-700 sm:scroll-mt-28',
        'focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
        'data-[waitlist-highlight=true]:bg-indigo-50/70 data-[waitlist-highlight=true]:shadow-[0_0_0_1px_rgba(99,102,241,0.2)]',
        'dark:data-[waitlist-highlight=true]:bg-indigo-950/45 dark:data-[waitlist-highlight=true]:shadow-[0_0_0_1px_rgba(129,140,248,0.25)]'
      )}
    >
      <h2
        id="landing-waitlist-heading"
        className={cn(
          'text-center text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg',
          description ? 'mb-2 sm:mb-3' : 'mb-3 sm:mb-4',
        )}
      >
        {headingText}
      </h2>
      {description ? (
        <p
          id="landing-waitlist-description"
          className="mb-4 text-pretty text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400"
        >
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}
