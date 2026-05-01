'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Business, PaymentSettings } from '@/lib/database.types';
import { resolveOnlineInvoiceProvider, type OnlineInvoiceProviderId } from '@/lib/invoices/online-invoice-provider';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

type Props = {
  business: Business;
  onSuccess: () => void;
  onClearSuccess: () => void;
};

function defaultPaymentSettings(business: Business): PaymentSettings {
  const s = business.payment_settings ?? {};
  return {
    // Bank transfer
    enable_bank_transfer: s.enable_bank_transfer ?? Boolean(
      s.bank_account_name ||
        s.bank_name ||
        s.bank_account_number ||
        s.bank_sort_code ||
        s.bank_swift_bic ||
        s.bank_address
    ),
    bank_account_name: s.bank_account_name ?? '',
    bank_name: s.bank_name ?? '',
    bank_account_number: s.bank_account_number ?? '',
    bank_sort_code: s.bank_sort_code ?? '',
    bank_swift_bic: s.bank_swift_bic ?? '',
    bank_address: s.bank_address ?? '',

    // International transfer
    enable_international_bank_transfer: s.enable_international_bank_transfer ?? Boolean(
      s.intl_account_name ||
        s.intl_iban ||
        s.intl_swift_bic ||
        s.intl_bank_name ||
        s.intl_bank_address
    ),
    intl_account_name: s.intl_account_name ?? '',
    intl_iban: s.intl_iban ?? '',
    intl_swift_bic: s.intl_swift_bic ?? '',
    intl_bank_name: s.intl_bank_name ?? '',
    intl_bank_address: s.intl_bank_address ?? '',

    // PayPal
    enable_paypal: s.enable_paypal ?? Boolean(s.paypal_email),
    paypal_email: s.paypal_email ?? '',

    // Default online / card (invoice links try this provider first when available)
    default_online_payment_provider:
      (s.default_online_payment_provider as OnlineInvoiceProviderId | undefined) ?? 'flutterwave',
    enable_flutterwave: s.enable_flutterwave ?? false,
    enable_paystack: s.enable_paystack ?? false,

    // Stripe (prefer business table columns when present)
    enable_stripe_card:
      s.enable_stripe_card ?? Boolean(business.stripe_account_id ?? s.stripe_connected),
    stripe_connected: s.stripe_connected ?? false,
    stripe_account_id: (business.stripe_account_id ?? s.stripe_account_id) ?? '',

    // General instructions
    payment_instructions: s.payment_instructions ?? '',
    auto_send_invoice_on_quote_accept: Boolean(s.auto_send_invoice_on_quote_accept ?? false),
  };
}

export function PaymentSettingsForm({ business, onSuccess, onClearSuccess }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<PaymentSettings>(() => defaultPaymentSettings(business));
  const [saving, setSaving] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeStatusNotice, setStripeStatusNotice] = useState<string | null>(null);

  const stripeOnboardingStatus =
    business.stripe_onboarding_status ?? settings.stripe_connect_status ?? 'not_connected';
  const stripeChargesEnabled = business.stripe_charges_enabled ?? false;
  const stripeAccountId = business.stripe_account_id ?? settings.stripe_account_id ?? '';

  const onlineInvoiceProvider = resolveOnlineInvoiceProvider(settings, business);
  const showOnlineSetupPrompt = onlineInvoiceProvider == null;

  const stripeStatusLabel = (() => {
    switch (stripeOnboardingStatus) {
      case 'connected':
        return 'Connected';
      case 'pending_verification':
        return 'Pending verification';
      case 'action_required':
        return 'Action required';
      case 'pending':
        return 'Pending';
      case 'onboarding_required':
        return 'Onboarding required';
      case 'not_connected':
      default:
        return 'Not connected';
    }
  })();

  useEffect(() => {
    const stripe = searchParams.get('stripe');
    if (stripe !== 'return') return;

    // User just returned from Stripe. Do not assume onboarding is complete.
    // Sync status from backend/DB and then remove the query param.
    setStripeStatusNotice('Syncing Stripe connection status…');
    fetch('/api/stripe/connect-sync')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          router.refresh();
          setStripeStatusNotice('Stripe status updated.');
        } else {
          setStripeStatusNotice(null);
        }
      })
      .catch(() => setStripeStatusNotice(null))
      .finally(() => {
        // Drop stripe=return to keep URL clean.
        router.replace('/settings?section=payment');
      });
  }, [searchParams, router]);

  useEffect(() => {
    const stripe = searchParams.get('stripe');
    if (stripe !== 'refresh') return;

    // User clicked "Edit information" in Stripe onboarding and got redirected back here.
    // Immediately generate a fresh Account Link and send them back to Stripe.
    setStripeError(null);
    setStripeLoading(true);
    fetch('/api/stripe/connect-refresh-link', { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error ?? 'Failed to refresh Stripe onboarding');
        window.location.href = data.url as string;
      })
      .catch((err) => {
        setStripeLoading(false);
        setStripeError(err instanceof Error ? err.message : 'Failed to refresh Stripe onboarding');
        router.replace('/settings?section=payment');
      });
  }, [searchParams, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onClearSuccess();
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_settings: settings }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  async function handleStripeOnboarding() {
    setStripeError(null);
    setStripeLoading(true);
    try {
      // If we already have an account and we’re not connected, treat this as "resume".
      const endpoint = stripeAccountId ? '/api/stripe/connect-refresh-link' : '/api/stripe/connect-onboarding';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.error_code === 'connect_not_enabled') {
          setStripeError(
            data.message ??
              'Stripe Connect is not enabled for this platform yet. Enable Connect in your Stripe Dashboard before onboarding businesses.'
          );
          return;
        }
        throw new Error(data.error ?? 'Failed to start Stripe onboarding');
      }
      if (!data.url) {
        throw new Error('Failed to start Stripe onboarding');
      }
      window.location.href = data.url as string;
    } catch (err) {
      setStripeError(err instanceof Error ? err.message : 'Failed to start Stripe onboarding');
    } finally {
      setStripeLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Payment Settings</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Configure how clients can pay you. Enabled methods and details will appear on your invoices.
      </p>
      {stripeStatusNotice && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          {stripeStatusNotice}
        </div>
      )}
      {showOnlineSetupPrompt && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100/95"
        >
          No online card option is available yet. Connect Stripe below to accept card payments on invoices, or
          use bank transfer / PayPal. Flutterwave and Paystack invoice links are coming soon; you can still set
          your preferred default.
        </div>
      )}
      <div className="mt-6 space-y-6">
        {/* Default online payment provider (invoice pay links) */}
        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Online card payments (default)</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            We try your selection first for hosted &quot;Pay now&quot; links. Stripe Connect is available for eligible
            businesses; additional providers roll out over time.
          </p>
          <fieldset className="mt-4 space-y-3">
            <legend className="sr-only">Default online payment provider</legend>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800/60">
              <input
                type="radio"
                className="app-radio mt-0.5"
                name="default_online"
                checked={settings.default_online_payment_provider === 'flutterwave'}
                onChange={() => setSettings((s) => ({ ...s, default_online_payment_provider: 'flutterwave' }))}
              />
              <span>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Flutterwave — Recommended
                </span>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Accept global card payments and multiple currencies.
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="app-checkbox"
                    id="enable_flutterwave"
                    checked={Boolean(settings.enable_flutterwave)}
                    onChange={(e) => setSettings((s) => ({ ...s, enable_flutterwave: e.target.checked }))}
                  />
                  <label htmlFor="enable_flutterwave">Enable Flutterwave when connected (invoice links)</label>
                </div>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800/60">
              <input
                type="radio"
                className="app-radio mt-0.5"
                name="default_online"
                checked={settings.default_online_payment_provider === 'paystack'}
                onChange={() => setSettings((s) => ({ ...s, default_online_payment_provider: 'paystack' }))}
              />
              <span>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Paystack</span>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Accept card and local payments in supported regions.
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="app-checkbox"
                    id="enable_paystack"
                    checked={Boolean(settings.enable_paystack)}
                    onChange={(e) => setSettings((s) => ({ ...s, enable_paystack: e.target.checked }))}
                  />
                  <label htmlFor="enable_paystack">Enable Paystack when connected (invoice links)</label>
                </div>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800/60">
              <input
                type="radio"
                className="app-radio mt-0.5"
                name="default_online"
                checked={settings.default_online_payment_provider === 'stripe'}
                onChange={() => setSettings((s) => ({ ...s, default_online_payment_provider: 'stripe' }))}
              />
              <span>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Stripe — for supported countries
                </span>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Connect Stripe if your business is registered in a Stripe-supported country.
                </p>
              </span>
            </label>
          </fieldset>
        </section>

        {/* Bank transfer (domestic) */}
        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <input
                  type="checkbox"
                  className="app-checkbox"
                  checked={Boolean(settings.enable_bank_transfer)}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      enable_bank_transfer: e.target.checked,
                    }))
                  }
                />
                Bank transfer
              </label>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Local bank transfer details for domestic payments.
              </p>
            </div>
          </div>
          {settings.enable_bank_transfer && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Bank name</label>
                <input
                  type="text"
                  value={settings.bank_name ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, bank_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Account name</label>
                <input
                  type="text"
                  value={settings.bank_account_name ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, bank_account_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Account number</label>
                <input
                  type="text"
                  value={settings.bank_account_number ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, bank_account_number: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Sort code / routing number</label>
                <input
                  type="text"
                  value={settings.bank_sort_code ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, bank_sort_code: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>SWIFT / BIC</label>
                <input
                  type="text"
                  value={settings.bank_swift_bic ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, bank_swift_bic: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Bank address (optional)</label>
                <input
                  type="text"
                  value={settings.bank_address ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, bank_address: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </section>

        {/* International bank transfer */}
        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              <input
                type="checkbox"
                className="app-checkbox"
                checked={Boolean(settings.enable_international_bank_transfer)}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    enable_international_bank_transfer: e.target.checked,
                  }))
                }
              />
              International bank transfer
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Details for clients paying from abroad (IBAN / SWIFT).
            </p>
          </div>
          {settings.enable_international_bank_transfer && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Account name</label>
                <input
                  type="text"
                  value={settings.intl_account_name ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, intl_account_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>IBAN</label>
                <input
                  type="text"
                  value={settings.intl_iban ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, intl_iban: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>SWIFT / BIC</label>
                <input
                  type="text"
                  value={settings.intl_swift_bic ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, intl_swift_bic: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Bank name</label>
                <input
                  type="text"
                  value={settings.intl_bank_name ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, intl_bank_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Bank address</label>
                <input
                  type="text"
                  value={settings.intl_bank_address ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, intl_bank_address: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </section>

        {/* PayPal */}
        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              <input
                type="checkbox"
                className="app-checkbox"
                checked={Boolean(settings.enable_paypal)}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    enable_paypal: e.target.checked,
                  }))
                }
              />
              PayPal
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Show a PayPal email for clients who prefer PayPal.
            </p>
          </div>
          {settings.enable_paypal && (
            <div className="mt-4">
              <label className={labelClass}>PayPal email</label>
              <input
                type="email"
                value={settings.paypal_email ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, paypal_email: e.target.value }))}
                className={inputClass}
              />
            </div>
          )}
        </section>

        {/* Stripe Connect (card payments) */}
        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <input
                  type="checkbox"
                  className="app-checkbox"
                  checked={Boolean(settings.enable_stripe_card)}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      enable_stripe_card: e.target.checked,
                    }))
                  }
                />
                Stripe (card payments via Connect)
              </label>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Optional: allow customers to pay invoices online with cards when your business is in a
                supported region. Set Stripe as the default above if you rely on it for pay links.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <button
                type="button"
                className="app-btn-secondary !px-3 !py-1.5 !text-xs disabled:opacity-60"
                disabled={!settings.enable_stripe_card || stripeLoading}
                onClick={handleStripeOnboarding}
              >
                {stripeLoading
                  ? 'Redirecting…'
                  : stripeOnboardingStatus === 'connected'
                    ? 'Manage Stripe'
                    : stripeAccountId
                      ? 'Resume Stripe onboarding'
                      : 'Connect Stripe'}
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {stripeOnboardingStatus === 'connected'
                  ? `Connected Stripe account ${stripeAccountId || ''}`.trim()
                  : settings.enable_stripe_card
                    ? stripeOnboardingStatus === 'action_required'
                      ? 'Action required in Stripe. Resolve required items to enable card payments.'
                      : stripeOnboardingStatus === 'pending_verification'
                        ? 'Stripe is verifying your information. Payments will be available once verification completes.'
                        : stripeOnboardingStatus === 'pending'
                          ? 'Onboarding in progress. Payments will be available once Stripe enables your account.'
                          : 'Complete Stripe onboarding to start accepting card payments.'
                    : 'Enable Stripe to start card payments and launch onboarding.'}
              </p>
              {settings.enable_stripe_card && !stripeChargesEnabled && stripeOnboardingStatus !== 'connected' && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Status: <span className="font-medium">{stripeStatusLabel}</span>
                </p>
              )}
              {stripeError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {stripeError}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* General instructions */}
        <section>
          <label className={labelClass}>General payment instructions</label>
          <textarea
            rows={3}
            value={settings.payment_instructions ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, payment_instructions: e.target.value }))}
            placeholder="e.g. Please include the invoice number in the payment reference."
            className={inputClass}
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            <input
              type="checkbox"
              className="app-checkbox"
              checked={Boolean(settings.auto_send_invoice_on_quote_accept)}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  auto_send_invoice_on_quote_accept: e.target.checked,
                }))
              }
            />
            Auto-send invoice when quote is accepted
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Off by default. When enabled, customer quote acceptance will create and send the invoice automatically.
          </p>
        </section>
      </div>
      <div className="mt-6">
        <button
          type="submit"
          disabled={saving}
          className="app-btn-primary"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
