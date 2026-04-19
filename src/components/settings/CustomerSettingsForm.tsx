'use client';

import { useState } from 'react';
import type { Business, CustomerSettings } from '@/lib/database.types';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

type Props = {
  business: Business;
  onSuccess: () => void;
  onClearSuccess: () => void;
};

const PAYMENT_TERMS = [
  { value: 'net_7', label: 'Net 7' },
  { value: 'net_14', label: 'Net 14' },
  { value: 'net_30', label: 'Net 30' },
];

function defaultCustomerSettings(business: Business): CustomerSettings {
  const s = business.customer_settings ?? {};
  return {
    account_number_format: s.account_number_format ?? 'CUST-{seq}',
    auto_create_from_invoices: s.auto_create_from_invoices ?? true,
    duplicate_detection: s.duplicate_detection ?? true,
    default_payment_terms: s.default_payment_terms ?? 'net_30',
  };
}

export function CustomerSettingsForm({ business, onSuccess, onClearSuccess }: Props) {
  const [settings, setSettings] = useState<CustomerSettings>(() => defaultCustomerSettings(business));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onClearSuccess();
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_settings: settings }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Customer Settings</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        How customers are created and identified.
      </p>
      <div className="mt-6 space-y-4">
        <div>
          <label className={labelClass}>Customer account number format</label>
          <input
            type="text"
            value={settings.account_number_format ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, account_number_format: e.target.value }))}
            placeholder="CUST-{seq}"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Use {'{seq}'} for the next number (e.g. CUST-00001).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="auto_create"
            checked={settings.auto_create_from_invoices ?? true}
            onChange={(e) => setSettings((s) => ({ ...s, auto_create_from_invoices: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-zenzex-600 focus:ring-zenzex-500"
          />
          <label htmlFor="auto_create" className="text-sm text-slate-700 dark:text-slate-300">
            Auto-create customers from invoices when name/email is new
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="duplicate_detection"
            checked={settings.duplicate_detection ?? true}
            onChange={(e) => setSettings((s) => ({ ...s, duplicate_detection: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-zenzex-600 focus:ring-zenzex-500"
          />
          <label htmlFor="duplicate_detection" className="text-sm text-slate-700 dark:text-slate-300">
            Apply duplicate customer detection (match by name/email)
          </label>
        </div>
        <div>
          <label className={labelClass}>Default customer payment terms</label>
          <select
            value={settings.default_payment_terms ?? 'net_30'}
            onChange={(e) => setSettings((s) => ({ ...s, default_payment_terms: e.target.value }))}
            className={inputClass}
          >
            {PAYMENT_TERMS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
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
