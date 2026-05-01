'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { WaitlistSource } from '@/lib/billing/checkout-waitlist-meta';

function modalIntro(triggerReason: string, source: string): { title: string; body: string } {
  const tr = (triggerReason || '').toLowerCase();
  const src = (source || '').toLowerCase();
  if (src === 'region_block' || tr === 'region_unavailable') {
    return {
      title: 'Join the waitlist',
      body: "Zenzex isn't fully available in your region yet. Join the waitlist and we'll notify you when we expand coverage and payment options.",
    };
  }
  if (src === 'feature_locked' || tr === 'feature_locked') {
    return {
      title: 'Join the waitlist',
      body: "This capability is coming soon. Join the waitlist to get early access when it's ready for your workspace.",
    };
  }
  return {
    title: 'Join the waitlist',
    body: "We're expanding Zenzex to support your region and payment options. Join the waitlist to get early access.",
  };
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

type Props = {
  onClose: () => void;
  triggerReason: string;
  source: WaitlistSource;
};

export function WaitlistModal({ onClose, triggerReason, source }: Props) {
  const [email, setEmail] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [country, setCountry] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref?.trim()) setReferredBy(ref.trim());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state !== 'loading') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, state]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
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
            trigger_reason: triggerReason,
            country: country.trim() || undefined,
            business_type: businessType.trim() || undefined,
            referred_by: referredBy.trim() || undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
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
    [email, businessType, country, referredBy, source, triggerReason, state]
  );

  const intro = modalIntro(triggerReason, source);

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        onClick={() => {
          if (state !== 'loading') onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="waitlist-modal-title"
        className={cn(
          'relative max-h-[min(90vh,640px)] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl',
          'dark:shadow-black/40'
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (state !== 'loading') onClose();
          }}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Close waitlist"
        >
          <X className="h-4 w-4" />
        </button>

        {state === 'success' ? (
          <div className="pr-8">
            <h2 id="waitlist-modal-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              You&apos;re on the list 🎉
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              We&apos;ll notify you as soon as Zenzex is available for you.
            </p>
            <p className="mt-4 text-xs font-medium text-slate-700 dark:text-slate-300">
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
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full rounded-lg border border-[var(--sidebar-border)] py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 id="waitlist-modal-title" className="pr-8 text-lg font-semibold text-slate-900 dark:text-white">
              {intro.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{intro.body}</p>

            <form onSubmit={onSubmit} className="mt-5 space-y-3">
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={businessType}
                  onChange={(ev) => setBusinessType(ev.target.value)}
                  placeholder="Business type (optional)"
                  className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:text-white"
                />
                <input
                  type="text"
                  value={country}
                  onChange={(ev) => setCountry(ev.target.value)}
                  placeholder="Country (optional)"
                  className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:text-white"
                />
              </div>
              {state === 'error' ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  Something went wrong. Try again.
                </p>
              ) : null}
              <button
                type="submit"
                disabled={state === 'loading'}
                className="app-btn-primary mt-1 inline-flex w-full min-h-[44px] items-center justify-center text-sm font-semibold disabled:opacity-60"
              >
                {state === 'loading' ? 'Joining…' : 'Join waitlist'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
