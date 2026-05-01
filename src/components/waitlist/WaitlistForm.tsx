'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';

export type WaitlistFormSource =
  | 'landing'
  | 'pricing'
  | 'payment_error'
  | 'region_block'
  | 'feature_locked'
  | string;

type Props = {
  source: WaitlistFormSource;
  className?: string;
  /** Tighter layout for modals and inline error strips. */
  variant?: 'default' | 'compact';
};

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export function WaitlistForm({ source, className, variant = 'default' }: Props) {
  const [email, setEmail] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [country, setCountry] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref?.trim()) setReferredBy(ref.trim());
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (state === 'loading') return;
      setState('loading');
      setCopyDone(false);
      try {
        const res = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            source,
            trigger_reason: 'general',
            country: country.trim() || undefined,
            business_type: businessType.trim() || undefined,
            referred_by: referredBy.trim() || undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          share_url?: string;
        };
        if (!res.ok || !data.ok) {
          setState('error');
          return;
        }
        setShareUrl(typeof data.share_url === 'string' ? data.share_url : null);
        setState('success');
      } catch {
        setState('error');
      }
    },
    [email, businessType, country, referredBy, source, state]
  );

  const compact = variant === 'compact';

  if (state === 'success') {
    return (
      <div
        className={cn(
          'rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-4 text-left dark:border-emerald-900/40 dark:bg-emerald-950/25',
          className
        )}
        role="status"
      >
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">You&apos;re on the list 🎉</p>
        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200/90">
          We&apos;ll notify you as soon as Zenzex is available for you.
        </p>
        <p className="mt-4 text-xs font-medium text-emerald-900/80 dark:text-emerald-200/80">
          Invite 3 people to get early access
        </p>
        {shareUrl ? (
          <button
            type="button"
            className="app-btn-primary mt-3 inline-flex w-full min-h-[44px] items-center justify-center text-sm font-semibold"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl).then(() => {
                setCopyDone(true);
                window.setTimeout(() => setCopyDone(false), 2200);
              });
            }}
          >
            {copyDone ? 'Copied' : 'Copy invite link'}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn(compact ? '' : 'rounded-2xl border border-[var(--sidebar-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6', className)}>
      {!compact ? (
        <h3 className="text-base font-semibold text-slate-900 dark:text-white sm:text-lg">Join the waitlist</h3>
      ) : null}
      {!compact ? (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Be first to know when we open the next wave of access.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className={cn(!compact && 'mt-4', compact && 'mt-0')}>
        <label className={cn('block', !compact && 'sm:max-w-md')}>
          <span className="sr-only">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
          />
        </label>

        {compact ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400">
              Optional details
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                name="business_type"
                value={businessType}
                onChange={(ev) => setBusinessType(ev.target.value)}
                placeholder="Business type"
                className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:text-white"
              />
              <input
                type="text"
                name="country"
                value={country}
                onChange={(ev) => setCountry(ev.target.value)}
                placeholder="Country"
                className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:text-white"
              />
            </div>
          </details>
        ) : (
          <div className="mt-3 grid gap-3 sm:max-w-xl sm:grid-cols-2">
            <input
              type="text"
              name="business_type"
              value={businessType}
              onChange={(ev) => setBusinessType(ev.target.value)}
              placeholder="Business type (optional)"
              className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:text-white"
            />
            <input
              type="text"
              name="country"
              value={country}
              onChange={(ev) => setCountry(ev.target.value)}
              placeholder="Country (optional)"
              className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:text-white"
            />
          </div>
        )}

        {state === 'error' ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            Something went wrong. Try again.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={state === 'loading'}
          className={cn(
            'app-btn-primary mt-4 inline-flex w-full min-h-[44px] items-center justify-center sm:w-auto sm:min-w-[11rem]',
            compact && 'mt-3 min-h-[40px] py-2 text-sm'
          )}
        >
          {state === 'loading' ? 'Joining…' : 'Join waitlist'}
        </button>
      </form>
    </div>
  );
}
