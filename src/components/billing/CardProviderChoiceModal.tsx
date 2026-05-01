'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { CardCheckoutProvider } from '@/lib/billing/provider-choice';

type Props = {
  open: boolean;
  loading: boolean;
  selectedProvider: CardCheckoutProvider;
  recommendedProvider: CardCheckoutProvider;
  errorMessage: string | null;
  /** When checkout failed with a waitlist-eligible reason, show a second CTA. */
  showJoinWaitlist?: boolean;
  onJoinWaitlist?: () => void;
  onClose: () => void;
  onSelect: (provider: CardCheckoutProvider) => void;
  onContinue: () => void;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function CardProviderChoiceModal({
  open,
  loading,
  selectedProvider,
  recommendedProvider,
  errorMessage,
  showJoinWaitlist = false,
  onJoinWaitlist,
  onClose,
  onSelect,
  onContinue,
}: Props) {
  const cardProviders: CardCheckoutProvider[] = useMemo(() => ['flutterwave', 'paystack'], []);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => continueButtonRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (node) => !node.hasAttribute('disabled')
      );
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (!active || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (!active || active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, onClose, open]);

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[130] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close payment provider selector"
        onClick={() => {
          if (!loading) onClose();
        }}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-provider-modal-title"
        aria-describedby="card-provider-modal-subtitle"
        className="relative w-full max-w-xl rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-2xl sm:p-6"
      >
        <h3 id="card-provider-modal-title" className="text-lg font-semibold text-slate-900 dark:text-white">
          Choose how to pay
        </h3>
        <p id="card-provider-modal-subtitle" className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Select a secure checkout option.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Card payment provider">
          {cardProviders.map((provider) => {
            const selected = selectedProvider === provider;
            const recommended = recommendedProvider === provider;
            const providerName = provider === 'flutterwave' ? 'Flutterwave' : 'Paystack';
            const summary = provider === 'flutterwave' ? 'Pay in USD with card' : 'Pay in ZAR with card';
            const helper =
              provider === 'flutterwave'
                ? 'Best for international card payments'
                : 'Best for South African card payments';
            return (
              <button
                key={provider}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={loading}
                onClick={() => onSelect(provider)}
                className={cn(
                  'min-h-11 w-full rounded-xl border p-3 text-left',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                  selected
                    ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-400 dark:bg-indigo-900/20'
                    : 'border-[var(--card-border)] hover:bg-slate-50 dark:hover:bg-slate-800/50',
                  loading && 'cursor-not-allowed opacity-70'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{providerName}</p>
                  <div className="flex items-center gap-2">
                    {recommended ? (
                      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Recommended
                      </span>
                    ) : null}
                    {selected ? <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-300" /> : null}
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{summary}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
              </button>
            );
          })}
        </div>

        {errorMessage ? (
          <div className="mt-3 space-y-2">
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {errorMessage}
            </p>
            {showJoinWaitlist && onJoinWaitlist ? (
              <button
                type="button"
                disabled={loading}
                onClick={onJoinWaitlist}
                className="w-full rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-900/50"
              >
                Join waitlist
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="min-h-11 rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800/50"
          >
            Cancel
          </button>
          <button
            ref={continueButtonRef}
            type="button"
            disabled={loading}
            onClick={onContinue}
            className="app-btn-primary min-h-11 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Preparing checkout…' : 'Continue to secure checkout'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
