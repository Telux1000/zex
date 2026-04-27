'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

const DEFAULT_DELAY_MS = 400;
const OVERLAY_Z = 'z-[210]';

export type CustomerApplyOverlayMode = 'select' | 'create' | null;

type CustomerApplyOverlayProps = {
  /** When true, customer is being applied to the invoice (autofill, FX wait, etc.). */
  active: boolean;
  mode: CustomerApplyOverlayMode;
  /** Delay before the dim + card (avoids flicker on very fast applies). */
  delayMs?: number;
  className?: string;
};

/**
 * Viewport-fixed status while customer details are applied. Announces in a live region
 * for the full `active` window; the visual layer appears after `delayMs`.
 */
export function CustomerApplyOverlay({
  active,
  mode,
  delayMs = DEFAULT_DELAY_MS,
  className,
}: CustomerApplyOverlayProps) {
  const [showVisual, setShowVisual] = useState(false);

  const { primary, secondary, a11y } = useMemo(() => {
    if (mode === 'create') {
      return {
        primary: 'Applying customer details…',
        secondary: 'Creating customer…',
        a11y: 'Applying customer details. Creating customer.',
      } as const;
    }
    return {
      primary: 'Applying customer details…',
      secondary: 'Loading customer and contact fields…',
      a11y: 'Applying customer details. Loading customer and contact fields.',
    } as const;
  }, [mode]);

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
    <div className={cn('pointer-events-none fixed inset-0', OVERLAY_Z, 'min-h-0', className)}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic>
        {a11y}
      </p>
      {showVisual ? (
        <div className="pointer-events-auto fixed inset-0" role="presentation" aria-hidden>
          <div className="absolute inset-0 isolate">
            <div
              className="absolute inset-0 z-0 bg-white/50 backdrop-blur-[2px] dark:bg-slate-950/45 dark:backdrop-blur-[2px]"
              aria-hidden
            />
            <div className="absolute inset-0 z-10 flex min-h-0 items-center justify-center p-3 sm:p-4 [padding-top:max(0.75rem,env(safe-area-inset-top,0px))] [padding-right:max(0.75rem,env(safe-area-inset-right,0px))] [padding-bottom:max(0.75rem,env(safe-area-inset-bottom,0px))] [padding-left:max(0.75rem,env(safe-area-inset-left,0px))]">
              <div className="flex w-full min-w-0 max-w-sm flex-col items-center gap-2.5 rounded-2xl border border-slate-200/95 bg-white px-6 py-4 text-center shadow-[0_8px_30px_rgb(0,0,0,0.08)] ring-1 ring-slate-900/[0.06] dark:border-slate-600/80 dark:bg-slate-800 dark:shadow-[0_12px_40px_rgb(0,0,0,0.45)] dark:ring-white/10">
                <span
                  className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-500 dark:border-t-indigo-400"
                  aria-hidden
                />
                <p className="text-sm font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100">
                  {primary}
                </p>
                <p className="text-xs leading-snug text-slate-600 dark:text-slate-300">{secondary}</p>
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
