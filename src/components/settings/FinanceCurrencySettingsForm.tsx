'use client';

import { useMemo, useState } from 'react';
import type { Business, FinanceSettings } from '@/lib/database.types';
import { CurrencySelect } from '@/components/currency/CurrencySelect';
import { getBusinessBaseCurrency } from '@/lib/business/base-currency';
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from '@/lib/currency/supported';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

type Props = {
  business: Business;
  hasFinancialRecords: boolean;
  /** Receives the updated business row from the API when save succeeds. */
  onSuccess: (updatedBusiness?: Business) => void;
  onClearSuccess: () => void;
  formId?: string;
  variant?: 'settings' | 'onboarding';
  showBuiltInSubmit?: boolean;
  /** Full settings UI includes optional allowed invoice currencies; onboarding hides this. */
  showAllowedCurrencies?: boolean;
  onSaveError?: (message: string) => void;
};

function readFinanceSettings(b: Business): FinanceSettings {
  const fs = b.finance_settings;
  if (fs && typeof fs === 'object' && !Array.isArray(fs)) {
    return fs as FinanceSettings;
  }
  return {};
}

export function FinanceCurrencySettingsForm({
  business,
  hasFinancialRecords,
  onSuccess,
  onClearSuccess,
  formId,
  variant = 'settings',
  showBuiltInSubmit = true,
  showAllowedCurrencies = true,
  onSaveError,
}: Props) {
  const initialBase = useMemo(() => getBusinessBaseCurrency(business), [business]);
  const [baseCurrency, setBaseCurrency] = useState(initialBase);
  const [addCode, setAddCode] = useState('USD');
  const [allowed, setAllowed] = useState<string[]>(() => {
    const list = readFinanceSettings(business).allowed_currencies ?? [];
    return Array.from(new Set(list.map((c) => String(c).trim().toUpperCase()).filter(Boolean))).sort();
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addAllowed() {
    const code = addCode.trim().toUpperCase();
    if (!code || allowed.includes(code)) return;
    setAllowed((prev) => [...prev, code].sort());
  }

  function removeAllowed(code: string) {
    setAllowed((prev) => prev.filter((c) => c !== code));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    onClearSuccess();
    try {
      if (hasFinancialRecords && baseCurrency !== initialBase) {
        setError('Base currency is locked because this business already has invoices, quotes, or expenses.');
        return;
      }
      const baseCode = baseCurrency.trim().toUpperCase();
      if (!isSupportedCurrency(baseCode)) {
        const msg = 'Choose a supported base currency.';
        setError(msg);
        onSaveError?.(msg);
        return;
      }
      const effectiveAllowed =
        allowed.length === 0
          ? []
          : Array.from(new Set([...allowed.map((c) => c.toUpperCase()), baseCurrency.toUpperCase()])).sort((a, b) =>
              a.localeCompare(b)
            );
      const payload: Record<string, unknown> = {
        finance_settings: { allowed_currencies: effectiveAllowed },
      };
      if (!hasFinancialRecords) {
        payload.currency = baseCode;
      }

      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? 'Failed to save';
        setError(msg);
        onSaveError?.(msg);
        return;
      }
      onSuccess(data as Business);
    } catch {
      onSaveError?.('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const onboarding = variant === 'onboarding';

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      {!onboarding ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Currency</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Base currency is used for reporting, analytics, and as the default for new invoices. Optional
            allowed list prepares for multi-currency invoicing.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          We pre-selected a currency from your region when possible. Same as{' '}
          <a
            href="/settings?section=finance-currency"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Settings → Finance → Currency
          </a>
          . Skip if the default is fine.
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-6">
        <div>
          <label className={labelClass} htmlFor="base-currency">
            Base currency
          </label>
          <CurrencySelect
            id="base-currency"
            value={baseCurrency}
            onChange={(code) => setBaseCurrency(code)}
            disabled={hasFinancialRecords}
            className={inputClass}
          />
          {hasFinancialRecords ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Base currency cannot be changed while invoices, quotes, or expenses exist. Contact support if you
              need a migration.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Set this before recording financial activity. Changing it later requires a data migration.
            </p>
          )}
        </div>

        {showAllowedCurrencies ? (
        <div>
          <label className={labelClass}>Allowed invoice currencies (optional)</label>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Leave empty for no restriction. If you add codes, the list must include your base currency (
            {baseCurrency}).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {allowed.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200"
              >
                {code}
                <button
                  type="button"
                  onClick={() => removeAllowed(code)}
                  className="ml-1 rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                  aria-label={`Remove ${code}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <CurrencySelect
                value={addCode}
                onChange={setAddCode}
                className={inputClass}
              />
            </div>
            <button type="button" onClick={addAllowed} className="app-btn-secondary shrink-0 px-4 py-2 text-sm">
              Add currency
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Supported codes: {SUPPORTED_CURRENCIES.map((c) => c.code).join(', ')}.
          </p>
        </div>
        ) : null}
      </div>

      {showBuiltInSubmit ? (
        <div className="mt-6">
          <button type="submit" disabled={saving} className="app-btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}
    </form>
  );
}
