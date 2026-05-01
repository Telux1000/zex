'use client';

import { Lock, X } from 'lucide-react';
import { getUpgradeModalContent, type UpgradeTrigger } from '@/lib/billing/upgrade-modal';
import { useWaitlistUi } from '@/components/waitlist/waitlist-context';

type Props = {
  open: boolean;
  trigger: UpgradeTrigger;
  onClose: () => void;
  onUpgrade: () => void;
};

export function UpgradePlanModal({ open, trigger, onClose, onUpgrade }: Props) {
  const { openWaitlist } = useWaitlistUi();
  if (!open) return null;
  const content = getUpgradeModalContent(trigger);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close upgrade modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl shadow-slate-900/20 dark:shadow-black/40 sm:p-7">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
          <Lock className="h-5 w-5" aria-hidden />
        </div>

        <h3 className="mt-4 pr-8 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {content.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{content.description}</p>

        <ul className="mt-5 space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {content.benefits.slice(0, 4).map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {content.planName} — {content.priceText}
          </p>
        </div>

        <button type="button" onClick={onUpgrade} className="app-btn-primary mt-5 inline-flex w-full items-center justify-center">
          Upgrade to {content.planName}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-500">Cancel anytime</p>

        <div className="mt-5 border-t border-[var(--card-border)] pt-4">
          <p className="text-center text-xs text-slate-600 dark:text-slate-400">
            Coming soon — join waitlist for early access
          </p>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-[var(--sidebar-border)] py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
            onClick={() => {
              onClose();
              openWaitlist({ triggerReason: 'feature_locked', source: 'feature_locked' });
            }}
          >
            Join waitlist
          </button>
        </div>
      </div>
    </div>
  );
}

