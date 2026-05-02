'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const linkClass =
  'flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white';

const primaryCtaClass =
  'app-btn-primary-lg inline-flex min-h-[48px] w-full items-center justify-center text-center font-semibold';

type Props = {
  /** When true, primary drawer CTA is Join waitlist; when false, Sign up. */
  waitlistEnabled: boolean;
};

/**
 * Mobile-only hamburger: section anchors, primary CTA (waitlist or signup), Log in.
 */
export function LandingMarketingMobileNav({ waitlistEnabled }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const id = window.requestAnimationFrame(() => {
      firstLinkRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = '';
      window.cancelAnimationFrame(id);
    };
  }, [open]);

  return (
    <div className="relative sm:hidden">
      <button
        ref={menuButtonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        {open ? <X className="h-5 w-5 shrink-0" aria-hidden /> : <Menu className="h-5 w-5 shrink-0" aria-hidden />}
      </button>

      {open ? (
        <>
          <div
            role="presentation"
            aria-hidden
            className="fixed inset-0 top-14 z-30 cursor-default bg-slate-900/45 dark:bg-black/55"
            onClick={close}
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation and account"
            className="fixed left-0 right-0 top-14 z-40 max-h-[min(75dvh,calc(100dvh-3.5rem))] overflow-y-auto overscroll-contain border-b border-[var(--sidebar-border)] bg-[var(--sidebar)] px-4 py-3 shadow-lg backdrop-blur-md"
          >
            <nav aria-label="Page sections" className="flex flex-col gap-0.5">
              <a ref={firstLinkRef} href="#features" className={linkClass} onClick={close}>
                Features
              </a>
              <a href="#pricing" className={linkClass} onClick={close}>
                Pricing
              </a>
              <a href="#how-it-works" className={linkClass} onClick={close}>
                How it works
              </a>

              <div
                className="my-3 h-px shrink-0 bg-[var(--sidebar-border)]"
                role="separator"
                aria-orientation="horizontal"
              />

              {waitlistEnabled ? (
                <a href="#waitlist" className={primaryCtaClass} onClick={close}>
                  Join waitlist
                </a>
              ) : (
                <Link href="/signup" className={primaryCtaClass} onClick={close}>
                  Sign up
                </Link>
              )}

              <Link
                href="/login"
                className={cn(
                  linkClass,
                  'mt-3 justify-center font-semibold text-indigo-700 dark:text-indigo-300',
                )}
                onClick={close}
              >
                Log in
              </Link>
            </nav>
          </div>
        </>
      ) : null}
    </div>
  );
}
