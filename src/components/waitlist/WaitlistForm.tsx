'use client';

import { useCallback, useEffect, useState } from 'react';
import { validateIndustryKeyRequiresOtherText } from '@/lib/business/business-profile-validation';
import { INDUSTRY_OTHER_KEY } from '@/lib/business/industry-options';
import { CountrySelect } from '@/components/location/CountrySelect';
import { looksLikeWaitlistReferralCode, normalizeWaitlistSource } from '@/lib/waitlist/waitlist-source';
import { WaitlistIndustryFields } from '@/components/waitlist/WaitlistIndustryFields';
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
  /** Sets `id` on the email input (e.g. landing deep-link focus). */
  emailInputId?: string;
  /** Parent supplies the main heading (e.g. landing #waitlist section). */
  hideMarketingTitle?: boolean;
  /** One line under the submit button (e.g. trust microcopy). */
  microcopy?: string;
  /** Show a visible “Email (required)” label instead of screen-reader-only. */
  explicitEmailLabel?: boolean;
};

type SubmitState = 'idle' | 'loading' | 'success';

const selectFieldClass =
  'mt-1 block w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white';

const selectFieldClassCompact =
  'mt-1 block w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:text-white';

const otherInputClass =
  'mt-1 block w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white';

const otherInputClassCompact =
  'mt-1 block w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:text-white';

function isIndustryOtherFieldMessage(msg: string | null): boolean {
  if (!msg) return false;
  return msg.startsWith('Tell us your industry');
}

export function WaitlistForm({
  source,
  className,
  variant = 'default',
  emailInputId,
  hideMarketingTitle = false,
  microcopy,
  explicitEmailLabel = false,
}: Props) {
  const [email, setEmail] = useState('');
  const [industryKey, setIndustryKey] = useState('');
  const [industryCustom, setIndustryCustom] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [effectiveSource, setEffectiveSource] = useState<string>(source);
  const [state, setState] = useState<SubmitState>('idle');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setEffectiveSource(source);
  }, [source]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (!ref) return;
    if (looksLikeWaitlistReferralCode(ref)) {
      setReferredBy(ref.toUpperCase());
    } else {
      setEffectiveSource(normalizeWaitlistSource(ref));
    }
  }, []);

  const handleIndustryKeyChange = useCallback((key: string) => {
    setIndustryKey(key);
    if (key !== INDUSTRY_OTHER_KEY) setIndustryCustom('');
    setLastError(null);
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (state === 'loading') return;
      setLastError(null);

      const otherErr = validateIndustryKeyRequiresOtherText(industryKey.trim() || null, industryCustom);
      if (otherErr) {
        setLastError(otherErr);
        return;
      }

      setState('loading');
      setCopyDone(false);
      try {
        const trimmedKey = industryKey.trim();
        const body: Record<string, unknown> = {
          email,
          source: effectiveSource,
          trigger_reason: 'general',
          referred_by: referredBy.trim() || undefined,
        };
        if (countryCode.trim()) body.country = countryCode.trim().toUpperCase();
        if (trimmedKey) {
          body.industry = trimmedKey;
          if (trimmedKey === INDUSTRY_OTHER_KEY) {
            body.industry_custom = industryCustom.trim();
          }
        }

        const res = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          share_url?: string;
        };
        if (!res.ok || !data.ok) {
          setState('idle');
          const msg = typeof data.error === 'string' ? data.error : 'Something went wrong. Try again.';
          setLastError(msg);
          return;
        }
        setShareUrl(typeof data.share_url === 'string' ? data.share_url : null);
        setState('success');
      } catch {
        setState('idle');
        setLastError('Something went wrong. Try again.');
      }
    },
    [email, industryKey, industryCustom, countryCode, referredBy, effectiveSource, state]
  );

  const compact = variant === 'compact';
  const selClass = compact ? selectFieldClassCompact : selectFieldClass;
  const otherClass = compact ? otherInputClassCompact : otherInputClass;
  const otherFieldError =
    industryKey === INDUSTRY_OTHER_KEY && lastError && isIndustryOtherFieldMessage(lastError) ? lastError : null;
  const bannerError = lastError && !otherFieldError ? lastError : null;

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

  const optionalFields = (
    <div className={cn('flex flex-col gap-3', !compact && 'sm:max-w-xl')}>
      <WaitlistIndustryFields
        idPrefix="waitlist-form"
        industryKey={industryKey}
        onIndustryKeyChange={handleIndustryKeyChange}
        industryCustom={industryCustom}
        onIndustryCustomChange={(v) => {
          setIndustryCustom(v);
          if (lastError && isIndustryOtherFieldMessage(lastError)) setLastError(null);
        }}
        selectClassName={selClass}
        inputClassName={otherClass}
        otherFieldError={otherFieldError}
      />
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Country <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <CountrySelect
          id="waitlist-form-country"
          ariaLabel="Country"
          value={countryCode}
          onChange={(code) => {
            setCountryCode(code);
            setLastError(null);
          }}
          placeholder="Select country"
          className={selClass}
          clearable
        />
      </div>
    </div>
  );

  return (
    <div className={cn(compact ? '' : 'rounded-2xl border border-[var(--sidebar-border)] bg-[var(--card)] p-5 shadow-sm sm:p-6', className)}>
      {!compact && !hideMarketingTitle ? (
        <h3 className="text-base font-semibold text-slate-900 dark:text-white sm:text-lg">Join the waitlist</h3>
      ) : null}
      {!compact && !hideMarketingTitle ? (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Be first to know when we open the next wave of access.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className={cn(!compact && !hideMarketingTitle && 'mt-4', !compact && hideMarketingTitle && 'mt-0', compact && 'mt-0')}>
        <label className={cn('block', !compact && 'sm:max-w-md')}>
          <span
            className={
              explicitEmailLabel
                ? 'mb-1.5 block text-left text-xs font-medium text-slate-700 dark:text-slate-300'
                : 'sr-only'
            }
          >
            {explicitEmailLabel ? (
              <>
                Email <span className="text-red-600 dark:text-red-400">(required)</span>
              </>
            ) : (
              'Email'
            )}
          </span>
          <input
            id={emailInputId}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              setLastError(null);
            }}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
          />
        </label>

        {compact ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400">
              Optional details
            </summary>
            <div className="mt-2">{optionalFields}</div>
          </details>
        ) : (
          <div className="mt-3">{optionalFields}</div>
        )}

        {bannerError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {bannerError}
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
        {microcopy ? (
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-500">{microcopy}</p>
        ) : null}
      </form>
    </div>
  );
}
