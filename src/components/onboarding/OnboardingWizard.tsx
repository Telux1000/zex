'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Business } from '@/lib/database.types';
import { AccountSettingsForm } from '@/components/settings/AccountSettingsForm';
import { BusinessProfileForm } from '@/components/settings/BusinessProfileForm';
import { FinanceCurrencySettingsForm } from '@/components/settings/FinanceCurrencySettingsForm';
import { guessBaseCurrencyFromBrowser } from '@/lib/currency/guess-from-locale';
import type { PricingPlan } from '@/lib/billing/plans';
import { pricingPlans as defaultPricingPlans } from '@/lib/billing/plans';
import { OnboardingPricingStep } from '@/components/onboarding/OnboardingPricingStep';
import type { OnboardingEntryState } from '@/lib/onboarding/entry-state';

const FORM_PROFILE = 'onboarding-step-profile';
const FORM_BUSINESS = 'onboarding-step-business';
const FORM_CURRENCY = 'onboarding-step-currency';

const steps = [
  { n: 1, label: 'Profile' },
  { n: 2, label: 'Business' },
  { n: 3, label: 'Currency' },
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepQuery = searchParams.get('step');
  const focusFullNameOnMount = searchParams.get('focus') === 'full_name';
  const onPricingStep = stepQuery === 'pricing';
  const rawNumeric = Number(stepQuery);
  const numericStep: 1 | 2 | 3 =
    !onPricingStep && Number.isFinite(rawNumeric) && rawNumeric >= 1 && rawNumeric <= 3
      ? (Math.min(3, Math.max(1, Math.floor(rawNumeric))) as 1 | 2 | 3)
      : 1;

  const [hydrated, setHydrated] = useState(false);
  const [pricingComplete, setPricingComplete] = useState(false);
  const [planCatalog, setPlanCatalog] = useState<PricingPlan[] | null>(null);
  const [onboardingEntry, setOnboardingEntry] = useState<OnboardingEntryState | null>(null);
  const [trialDaysConfigured, setTrialDaysConfigured] = useState(14);
  const [business, setBusiness] = useState<Business | null>(null);
  const [geoCountryCode, setGeoCountryCode] = useState<string | null>(null);
  const [requestLocaleCountryCode, setRequestLocaleCountryCode] = useState<string | null>(null);
  const [hasFinancialRecords, setHasFinancialRecords] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [profileStepCanSubmit, setProfileStepCanSubmit] = useState(false);
  const [businessStepCanSubmit, setBusinessStepCanSubmit] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const workspaceBootstrapStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /** False when redirecting away so we never render the full wizard before navigation. */
      let revealOnboardingUi = true;
      try {
        const res = await fetch('/api/onboarding/state');
        const data = (await res.json()) as {
          business: Business | null;
          hasFinancialRecords?: boolean;
          wizardComplete?: boolean;
          error?: string;
          geoCountryCode?: string | null;
          requestLocaleCountryCode?: string | null;
          pricingComplete?: boolean;
          planCatalog?: PricingPlan[];
          trialDaysConfigured?: number;
          onboardingEntry?: OnboardingEntryState;
        };
        if (cancelled) return;
        if (data.error) {
          setBanner({ type: 'err', text: data.error });
          return;
        }
        if (data.wizardComplete) {
          revealOnboardingUi = false;
          router.replace('/dashboard');
          router.refresh();
          return;
        }
        setPricingComplete(data.pricingComplete === true);
        setPlanCatalog(Array.isArray(data.planCatalog) ? data.planCatalog : null);
        setOnboardingEntry(data.onboardingEntry ?? null);
        setTrialDaysConfigured(
          typeof data.trialDaysConfigured === 'number' && data.trialDaysConfigured > 0
            ? data.trialDaysConfigured
            : 14
        );
        setGeoCountryCode(data.geoCountryCode ?? null);
        setRequestLocaleCountryCode(data.requestLocaleCountryCode ?? null);
        const b = data.business;
        if (b) {
          setBusiness(b);
          setHasFinancialRecords(!!data.hasFinancialRecords);
        }
      } finally {
        if (!cancelled && revealOnboardingUi) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!hydrated) return;
    const p = searchParams.get('step');
    if (!pricingComplete) {
      if (p !== 'pricing') {
        router.replace('/onboarding?step=pricing');
      }
      return;
    }
    if (p === 'pricing') {
      router.replace('/onboarding?step=1');
      return;
    }
    if (!p || !['1', '2', '3'].includes(p)) {
      router.replace('/onboarding?step=1');
    }
  }, [hydrated, pricingComplete, searchParams, router]);

  useEffect(() => {
    if (numericStep !== 1) setProfileStepCanSubmit(false);
    if (numericStep !== 2) setBusinessStepCanSubmit(false);
  }, [numericStep]);

  useEffect(() => {
    if (!hydrated) return;
    if (numericStep < 2 || business) return;
    if (workspaceBootstrapStarted.current) return;
    workspaceBootstrapStarted.current = true;

    let cancelled = false;
    setBootstrapping(true);
    setBanner(null);

    (async () => {
      try {
        const currency = guessBaseCurrencyFromBrowser();
        const res = await fetch('/api/onboarding/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currency }),
        });
        const data = (await res.json()) as {
          business?: Business;
          error?: string;
          geoCountryCode?: string | null;
          requestLocaleCountryCode?: string | null;
        };
        if (cancelled) return;
        if (!res.ok || !data.business) {
          setBanner({
            type: 'err',
            text: data.error ?? 'Could not create your workspace.',
          });
          router.replace('/onboarding?step=1');
          return;
        }
        setGeoCountryCode(data.geoCountryCode ?? null);
        setRequestLocaleCountryCode(data.requestLocaleCountryCode ?? null);
        setBusiness(data.business);
        setHasFinancialRecords(false);
        setBanner({
          type: 'ok',
          text: 'Workspace ready. Next: your business details.',
        });
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
      workspaceBootstrapStarted.current = false;
      setBootstrapping(false);
    };
  }, [hydrated, numericStep, business, router]);

  const markOnboardingCompleteAndLeave = useCallback(async () => {
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_onboarding_complete: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        onboarding_blocker?: { step: 1 | 2 | 3; code: string };
        onboarding_just_completed?: boolean;
      };
      if (!res.ok) {
        const step = data.onboarding_blocker?.step;
        setBanner({
          type: 'err',
          text: data.error ?? 'Could not finish setup. Try again.',
        });
        if (typeof step === 'number' && step >= 1 && step <= 3) {
          router.replace(`/onboarding?step=${step}`);
        }
        return;
      }
      const celebrate = data.onboarding_just_completed === true;
      router.replace(celebrate ? '/dashboard?welcome=1' : '/dashboard');
      router.refresh();
      return;
    } catch {
      setBanner({ type: 'err', text: 'Could not finish setup. Try again.' });
      return;
    }
  }, [router]);

  const clearBanner = useCallback(() => setBanner(null), []);

  const onProfileSaved = useCallback(() => {
    setAdvancing(false);
    setBanner({ type: 'ok', text: 'Profile saved.' });
    router.replace('/onboarding?step=2');
  }, [router]);

  const onProfileSaveError = useCallback((msg: string) => {
    setAdvancing(false);
    setBanner({ type: 'err', text: msg });
  }, []);

  const startStep1Continue = () => {
    setBanner(null);
    const el = document.getElementById(FORM_PROFILE) as HTMLFormElement | null;
    if (el) el.requestSubmit();
  };

  const startStep2Continue = () => {
    setBanner(null);
    const el = document.getElementById(FORM_BUSINESS) as HTMLFormElement | null;
    if (el) el.requestSubmit();
  };

  const startStep3Continue = () => {
    setAdvancing(true);
    setBanner(null);
    const el = document.getElementById(FORM_CURRENCY) as HTMLFormElement | null;
    if (el) el.requestSubmit();
    else setAdvancing(false);
  };

  const onBusinessSaved = useCallback((updated?: Business) => {
    setAdvancing(false);
    setBanner({ type: 'ok', text: 'Business profile saved.' });
    if (updated && typeof updated === 'object' && 'id' in updated) {
      setBusiness(updated as Business);
    }
    router.replace('/onboarding?step=3');
  }, [router]);

  const onBusinessSaveError = useCallback((msg: string) => {
    setAdvancing(false);
    setBanner({ type: 'err', text: msg });
  }, []);

  const onCurrencySaved = useCallback(
    async (updated?: Business) => {
      setAdvancing(false);
      setBanner({ type: 'ok', text: 'Currency saved.' });
      if (updated && typeof updated === 'object' && 'id' in updated) {
        setBusiness(updated);
      }
      await markOnboardingCompleteAndLeave();
    },
    [markOnboardingCompleteAndLeave]
  );

  const onCurrencySaveError = useCallback((msg: string) => {
    setAdvancing(false);
    setBanner({ type: 'err', text: msg });
  }, []);

  const onPricingCompleted = useCallback(() => {
    setPricingComplete(true);
    router.replace('/onboarding?step=1');
  }, [router]);

  const effectivePlans = planCatalog?.length ? planCatalog : defaultPricingPlans;

  if (!hydrated) {
    return (
      <div className="app-card-surface mx-auto max-w-2xl p-8 text-center text-sm text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  if (!pricingComplete) {
    if (onPricingStep) {
      return (
        <div className="mx-auto max-w-7xl px-4 pb-10">
          <div className="app-card-surface border border-[var(--card-border)] p-5 sm:p-8">
            <OnboardingPricingStep
              plans={effectivePlans}
              trialDays={trialDaysConfigured}
              initialEntryState={onboardingEntry}
              onCompleted={onPricingCompleted}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="app-card-surface mx-auto max-w-2xl p-8 text-center text-sm text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          Get started
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Set up your account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          A few quick steps. Everything here matches{' '}
          <Link href="/settings" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Settings
          </Link>{' '}
          so you can change it anytime.
        </p>
      </div>

      <ol className="mb-8 flex gap-2 sm:gap-4" aria-label="Onboarding steps">
        {steps.map((s) => {
          const active = numericStep === s.n;
          const done = numericStep > s.n;
          return (
            <li key={s.n} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? 'bg-indigo-600 text-white'
                    : active
                      ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
                      : 'bg-[var(--card-border)] text-[var(--muted)]'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? '✓' : s.n}
              </span>
              <span
                className={`hidden truncate text-sm font-medium sm:inline ${
                  active ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="app-card-surface border border-[var(--card-border)] p-5 sm:p-8">
        {banner ? (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              banner.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
            }`}
            role={banner.type === 'err' ? 'alert' : 'status'}
          >
            {banner.text}
          </div>
        ) : null}

        {numericStep === 1 ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your profile</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                How you&apos;ll appear in the product. Continue saves your profile; your workspace is created when you
                open the next step.
              </p>
            </div>
            <AccountSettingsForm
              formId={FORM_PROFILE}
              variant="onboarding"
              showBuiltInSubmit={false}
              focusFullNameOnMount={focusFullNameOnMount}
              onSuccess={onProfileSaved}
              onClearSuccess={clearBanner}
              onSaveError={onProfileSaveError}
              onValidatedSubmitStart={() => setAdvancing(true)}
              onCanSubmitChange={setProfileStepCanSubmit}
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--card-border)] pt-6">
              <button
                type="button"
                disabled={advancing || !profileStepCanSubmit}
                onClick={startStep1Continue}
                className="app-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {advancing ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </div>
        ) : null}

        {numericStep === 2 && !business && bootstrapping ? (
          <div className="py-8 text-center text-sm text-[var(--muted)]">Preparing your workspace…</div>
        ) : null}

        {numericStep === 2 && business ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Complete your business profile
              </h2>
            </div>
            <BusinessProfileForm
              key={business.id}
              business={business}
              geoCountryCode={geoCountryCode}
              requestLocaleCountryCode={requestLocaleCountryCode}
              countryDetectionResolved={hydrated}
              formId={FORM_BUSINESS}
              variant="onboarding"
              showBuiltInSubmit={false}
              onSuccess={onBusinessSaved}
              onClearSuccess={clearBanner}
              onSaveError={onBusinessSaveError}
              onValidatedSubmitStart={() => setAdvancing(true)}
              onCanSubmitChange={setBusinessStepCanSubmit}
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--card-border)] pt-6">
              <button
                type="button"
                disabled={advancing}
                onClick={() => {
                  setBanner(null);
                  router.replace('/onboarding?step=3');
                }}
                className="app-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Skip for now
              </button>
              <button
                type="button"
                disabled={advancing || !businessStepCanSubmit}
                onClick={startStep2Continue}
                className="app-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {advancing ? 'Saving…' : 'Save & continue'}
              </button>
            </div>
          </div>
        ) : null}

        {numericStep === 3 && business ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Base currency</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Used for reporting and defaults. Pre-filled from your region when we could detect it.
              </p>
            </div>
            <FinanceCurrencySettingsForm
              key={`${business.id}-${business.currency}`}
              business={business}
              hasFinancialRecords={hasFinancialRecords}
              formId={FORM_CURRENCY}
              variant="onboarding"
              showBuiltInSubmit={false}
              showAllowedCurrencies={false}
              onSuccess={onCurrencySaved}
              onClearSuccess={clearBanner}
              onSaveError={onCurrencySaveError}
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--card-border)] pt-6">
              <button
                type="button"
                disabled={advancing}
                onClick={() => {
                  setBanner(null);
                  router.replace('/dashboard');
                  router.refresh();
                }}
                className="app-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Skip — use default
              </button>
              <button
                type="button"
                disabled={advancing}
                onClick={startStep3Continue}
                className="app-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {advancing ? 'Saving…' : 'Save & continue'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
