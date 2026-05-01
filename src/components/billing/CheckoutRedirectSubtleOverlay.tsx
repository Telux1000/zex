'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const DEFAULT_OVERLAY_DELAY_MS = 400;

/**
 * After `delayMs` of active checkout, show a centered hint while waiting for redirect.
 * If redirect completes before the delay, the overlay never mounts (fast path).
 */
export function useCheckoutRedirectOverlay(
  active: boolean,
  delayMs: number = DEFAULT_OVERLAY_DELAY_MS
): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [active, delayMs]);
  return show;
}

function SubtleSpinner() {
  return (
    <span
      className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-indigo-500/80 border-t-transparent motion-reduce:animate-none dark:border-indigo-400/80 dark:border-t-transparent"
      aria-hidden
    />
  );
}

/** Centered, non-blocking scrim + status card. Does not intercept pointer events. */
export function CheckoutRedirectSubtleOverlay({ open }: { open: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !open) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/30 p-4 dark:bg-black/35"
      aria-hidden
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none flex max-w-sm flex-col items-center gap-3 rounded-xl border border-slate-200/90 bg-white/95 px-6 py-5 text-center shadow-xl backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/95"
      >
        <SubtleSpinner />
        <p className="text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
          Preparing secure checkout…
        </p>
      </div>
    </div>,
    document.body
  );
}
