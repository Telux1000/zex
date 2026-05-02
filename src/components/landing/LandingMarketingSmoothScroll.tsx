'use client';

import { useEffect } from 'react';

/** Enables `scroll-behavior: smooth` and `scroll-padding-top` for in-page anchors on the landing page. */
export function LandingMarketingSmoothScroll() {
  useEffect(() => {
    document.documentElement.classList.add('zenzex-smooth-scroll');
    return () => {
      document.documentElement.classList.remove('zenzex-smooth-scroll');
    };
  }, []);
  return null;
}
