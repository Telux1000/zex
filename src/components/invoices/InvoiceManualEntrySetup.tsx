'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CurrencySelect } from '@/components/currency/CurrencySelect';
import { PhoneNumberInput } from '@/components/phone/PhoneNumberInput';
import { browserLocaleCountryHint, resolvePhoneDefaultCountryIso2 } from '@/lib/phone/default-country';
import {
  isPhoneCountryCallingCodeOnly,
  isValidPhoneForCountry,
  normalizePhoneToE164OrNull,
  PHONE_MSG,
} from '@/lib/phone/e164';
import { cn } from '@/lib/utils/cn';
import {
  MANUAL_INVOICE_FIELD_FOCUS,
  MANUAL_INVOICE_FIELD_FOCUS_ERROR,
} from '@/components/invoices/manual-invoice-field-classes';

type Props = {
  /** Called after profile + business are created so the parent can reload workspace state. */
  onWorkspaceReady: () => void;
};

/**
 * Inline prerequisite for manual invoice creation when the user has no business yet.
 * Collects minimum fields so core setup is satisfied without leaving the invoice flow.
 */
export function InvoiceManualEntrySetup({ onWorkspaceReady }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const phoneDefaultCountry = useMemo(
    () =>
      resolvePhoneDefaultCountryIso2({
        savedE164: businessPhone || null,
        businessCountryIso2: null,
        localeHintIso2: browserLocaleCountryHint(),
      }),
    [businessPhone]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fn = fullName.trim();
    const bn = businessName.trim();
    const em = businessEmail.trim();
    const ph = businessPhone.trim();
    if (!fn) {
      setError('Enter your name (shown on invoices as the sender).');
      return;
    }
    if (!bn) {
      setError('Enter your business name.');
      return;
    }
    if (!em) {
      setError('Enter a business email.');
      return;
    }
    if (!ph) {
      setError('Enter a business phone number.');
      setPhoneError(null);
      return;
    }
    if (isPhoneCountryCallingCodeOnly(ph)) {
      setPhoneError(PHONE_MSG.afterCountryCode);
      setError(null);
      return;
    }
    if (!isValidPhoneForCountry(ph, phoneDefaultCountry)) {
      setPhoneError(PHONE_MSG.invalid);
      setError(null);
      return;
    }
    setPhoneError(null);
    setSubmitting(true);
    try {
      const profileRes = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fn }),
      });
      const profileData = (await profileRes.json().catch(() => ({}))) as { error?: string };
      if (!profileRes.ok) {
        throw new Error(profileData.error ?? 'Could not save your name.');
      }

      const bootRes = await fetch('/api/onboarding/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: bn,
          currency: currency.trim().toUpperCase(),
          email: em,
          phone: normalizePhoneToE164OrNull(ph, phoneDefaultCountry) ?? ph,
        }),
      });
      const bootData = (await bootRes.json().catch(() => ({}))) as { error?: string };
      if (!bootRes.ok) {
        throw new Error(bootData.error ?? 'Could not create your business.');
      }

      router.refresh();
      onWorkspaceReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = (hasError: boolean) =>
    cn(
      'mt-1 block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white',
      hasError
        ? 'border-red-500 dark:border-red-500 ' + MANUAL_INVOICE_FIELD_FOCUS_ERROR
        : 'border-slate-300 dark:border-slate-600 ' + MANUAL_INVOICE_FIELD_FOCUS
    );

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Set up your business to create invoices</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Your business details appear on every invoice. This takes a minute—you&apos;ll continue here right after.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="manual-setup-full-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Your name
            </label>
            <input
              id="manual-setup-full-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={submitting}
              className={inputClass(false)}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label htmlFor="manual-setup-business-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Business name
            </label>
            <input
              id="manual-setup-business-name"
              type="text"
              autoComplete="organization"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={submitting}
              className={inputClass(false)}
              placeholder="Acme Studio"
            />
          </div>
          <div>
            <label htmlFor="manual-setup-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Business email
            </label>
            <input
              id="manual-setup-email"
              type="email"
              autoComplete="email"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              disabled={submitting}
              className={inputClass(false)}
              placeholder="billing@acme.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Business phone <span className="text-red-500">*</span>
            </label>
            <div className="mt-1">
              <PhoneNumberInput
                id="manual-setup-phone"
                countrySelectorId="manual-setup-phone-country"
                value={businessPhone}
                onChange={(next) => {
                  setBusinessPhone(next);
                  setPhoneError(null);
                  setError(null);
                }}
                defaultCountry={phoneDefaultCountry}
                disabled={submitting}
                required
                error={phoneError}
              />
            </div>
          </div>
          <div>
            <label htmlFor="manual-setup-currency" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Base currency
            </label>
            <CurrencySelect
              id="manual-setup-currency"
              value={currency}
              disabled={submitting}
              onChange={(code) => setCurrency(code.toUpperCase())}
              className={inputClass(false)}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Used for reporting and default invoice amounts.</p>
          </div>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 sm:w-auto"
            >
              {submitting ? 'Saving…' : 'Set up business'}
            </button>
            <Link
              href="/dashboard/invoices/new"
              className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
            >
              Back
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
