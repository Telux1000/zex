'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

const DEFAULT_DELAY_MS = 400;
/** Stacked above most page UI; save overlay should be on top of scrollable form content. */
const OVERLAY_Z_CLASS = 'z-[200]';

type SavingOverlayProps = {
  /** When true, the save request is in flight. */
  active: boolean;
  /** Primary line shown in the status card after the visual delay, and in the a11y live region for the full save. */
  message: string;
  /** Milliseconds to wait before showing the dimmed overlay + center card (avoids flicker on fast saves). */
  delayMs?: number;
  className?: string;
};

/**
 * Long saves: after `delayMs`, a soft dim + status card (spinner + message) fixed to the
 * **viewport** (portaled to `document.body`), so it stays centered without scrolling on
 * long pages. Always announces `message` in a live region for the full `active` duration
 * (including before the visual layer). Sighted users only see the dim + card after the delay.
 */
export function SavingOverlay({ active, message, delayMs = DEFAULT_DELAY_MS, className }: SavingOverlayProps) {
  const [showVisual, setShowVisual] = useState(false);

  useEffect(() => {
    if (!active) {
      setShowVisual(false);
      return;
    }
    const t = window.setTimeout(() => setShowVisual(true), delayMs);
    return () => window.clearTimeout(t);
  }, [active, delayMs]);

  if (!active) return null;

  const node = (
    <div
      className={cn('pointer-events-none fixed inset-0', OVERLAY_Z_CLASS, 'min-h-0', className)}
    >
      {/* Spoken for the whole save, including 0–delay window before the card appears. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic>
        {message}
      </p>
      {showVisual ? (
        <div className="pointer-events-auto absolute inset-0" role="presentation">
          <div className="absolute inset-0 isolate">
            <div
              className="absolute inset-0 z-0 bg-white/55 backdrop-blur-[2px] dark:bg-slate-950/50 dark:backdrop-blur-[2px]"
              aria-hidden
            />
            <div
              className="absolute inset-0 z-10 flex min-h-0 items-center justify-center p-3 sm:p-4 [padding-top:max(0.75rem,env(safe-area-inset-top,0px))] [padding-right:max(0.75rem,env(safe-area-inset-right,0px))] [padding-bottom:max(0.75rem,env(safe-area-inset-bottom,0px))] [padding-left:max(0.75rem,env(safe-area-inset-left,0px))]"
              aria-hidden
            >
              <div className="flex w-full min-w-0 max-w-sm flex-col items-center gap-3.5 rounded-2xl border border-slate-200/95 bg-white px-6 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.08)] ring-1 ring-slate-900/[0.06] dark:border-slate-600/80 dark:bg-slate-800 dark:shadow-[0_12px_40px_rgb(0,0,0,0.45)] dark:ring-white/10">
                <span
                  className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-500 dark:border-t-indigo-400"
                  aria-hidden
                />
                <p className="text-center text-sm font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100">
                  {message}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(node, document.body);
}
