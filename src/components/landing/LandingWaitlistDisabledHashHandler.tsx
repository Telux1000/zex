'use client';

import { useEffect } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** When the public waitlist is off, strip `#waitlist` and scroll to top so the URL is not a dead anchor. */
export function LandingWaitlistDisabledHashHandler() {
  useEffect(() => {
    if (window.location.hash !== '#waitlist') return;
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', pathname + (search || ''));
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);
  return null;
}
