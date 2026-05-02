'use client';

import { useCallback, useEffect, useState } from 'react';
import { LANDING_WAITLIST_EMAIL_INPUT_ID } from '@/lib/landing/landing-waitlist-ids';
import { cn } from '@/lib/utils/cn';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isTextFieldTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  if (t.closest('[data-sticky-landing-cta]')) return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type?.toLowerCase() ?? 'text';
    return !['button', 'checkbox', 'hidden', 'image', 'radio', 'reset', 'submit'].includes(type);
  }
  if (t.isContentEditable) return true;
  return false;
}

/**
 * Mobile-only bottom bar for Join waitlist (scroll to #waitlist). Mount only when the public waitlist is enabled.
 * Sign-up–open mode uses the hero primary CTA only — no second fixed bar (avoids duplicate CTAs / layout shift).
 */
export function LandingMobileStickyWaitlist() {
  const [waitlistOffScreen, setWaitlistOffScreen] = useState(true);
  const [fieldFocus, setFieldFocus] = useState(false);
  const [viewportKeyboard, setViewportKeyboard] = useState(false);

  useEffect(() => {
    const el = document.getElementById('waitlist');
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setWaitlistOffScreen(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '0px 0px -6% 0px' },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let outTimer: number | undefined;
    const onIn = (e: FocusEvent) => {
      if (isTextFieldTarget(e.target)) setFieldFocus(true);
    };
    const onOut = () => {
      if (outTimer !== undefined) window.clearTimeout(outTimer);
      outTimer = window.setTimeout(() => {
        const a = document.activeElement;
        setFieldFocus(isTextFieldTarget(a));
      }, 60);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      if (outTimer !== undefined) window.clearTimeout(outTimer);
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const THRESHOLD = 88;
    const sync = () => {
      const delta = window.innerHeight - vv.height;
      setViewportKeyboard(delta > THRESHOLD);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  const barVisible = waitlistOffScreen && !fieldFocus && !viewportKeyboard;

  const onWaitlistClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const section = document.getElementById('waitlist');
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    section?.scrollIntoView({ behavior, block: 'start' });
    const delay = behavior === 'smooth' ? 480 : 80;
    window.setTimeout(() => {
      const input = document.getElementById(LANDING_WAITLIST_EMAIL_INPUT_ID) as HTMLInputElement | null;
      input?.focus({ preventScroll: true });
      section?.setAttribute('data-waitlist-highlight', 'true');
      window.setTimeout(() => section?.removeAttribute('data-waitlist-highlight'), 1600);
    }, delay);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '#waitlist');
    }
  }, []);

  const ctaClass = cn(
    'app-btn-primary-lg flex min-h-[48px] w-full items-center justify-center shadow-lg shadow-slate-900/15',
    'ring-1 ring-slate-900/5 dark:shadow-black/40 dark:ring-white/10',
  );

  return (
    <div
      data-sticky-landing-cta
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-50 sm:hidden',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2',
        !barVisible && 'max-sm:hidden',
      )}
      aria-hidden={!barVisible}
    >
      {barVisible ? (
        <div className="pointer-events-auto mx-auto max-w-lg px-3">
          <a
            href="#waitlist"
            onClick={onWaitlistClick}
            className={ctaClass}
            aria-label="Join waitlist — scroll to sign-up form"
          >
            Join waitlist
          </a>
        </div>
      ) : null}
    </div>
  );
}
