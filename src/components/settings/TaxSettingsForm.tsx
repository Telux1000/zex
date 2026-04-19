'use client';

import { useState } from 'react';
import type { Business, TaxSettings, TaxRateItem } from '@/lib/database.types';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

type Props = {
  business: Business;
  onSuccess: () => void;
  onClearSuccess: () => void;
};

function defaultTaxSettings(business: Business): TaxSettings {
  const s = business.tax_settings ?? {};
  return {
    default_rate: s.default_rate ?? 0,
    tax_name: s.tax_name ?? 'VAT',
    calculation_method: s.calculation_method ?? 'exclusive',
    rates: Array.isArray(s.rates) && s.rates.length > 0 ? s.rates : [{ name: 'Standard', rate: 0, default: true }],
  };
}

export function TaxSettingsForm({ business, onSuccess, onClearSuccess }: Props) {
  const [settings, setSettings] = useState<TaxSettings>(() => defaultTaxSettings(business));
  const [saving, setSaving] = useState(false);

  const rates: TaxRateItem[] = settings.rates?.length ? settings.rates : [{ name: 'Standard', rate: 0, default: true }];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onClearSuccess();
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tax_settings: {
            ...settings,
            rates: rates.filter((r) => r.name.trim() !== ''),
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  function updateRate(index: number, updates: Partial<TaxRateItem>) {
    let next = rates.map((r, i) => (i === index ? { ...r, ...updates } : r));
    if (updates.default) {
      next = next.map((r, i) => (i === index ? r : { ...r, default: false }));
    }
    setSettings((s) => ({ ...s, rates: next }));
  }

  function addRate() {
    setSettings((s) => ({
      ...s,
      rates: [...(s.rates ?? []), { name: '', rate: 0, default: false }],
    }));
  }

  function removeRate(index: number) {
    if (rates.length <= 1) return;
    setSettings((s) => ({ ...s, rates: rates.filter((_, i) => i !== index) }));
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Tax Settings</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Default tax and rates available when creating invoices.
      </p>
      <div className="mt-6 space-y-4">
        <div>
          <label className={labelClass}>Default tax rate (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={settings.default_rate ?? 0}
            onChange={(e) => setSettings((s) => ({ ...s, default_rate: parseFloat(e.target.value) || 0 }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Tax name (VAT / GST / Sales Tax)</label>
          <input
            type="text"
            value={settings.tax_name ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, tax_name: e.target.value }))}
            placeholder="VAT"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Tax calculation method</label>
          <select
            value={settings.calculation_method ?? 'exclusive'}
            onChange={(e) =>
              setSettings((s) => ({ ...s, calculation_method: e.target.value as 'exclusive' | 'inclusive' }))
            }
            className={inputClass}
          >
            <option value="exclusive">Tax exclusive (tax added on top of subtotal)</option>
            <option value="inclusive">Tax inclusive (price includes tax)</option>
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className={labelClass}>Tax rates</label>
            <button
              type="button"
              onClick={addRate}
              className="text-sm font-medium text-zenzex-600 hover:text-zenzex-700 dark:text-zenzex-400"
            >
              + Add rate
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {rates.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                <input
                  type="text"
                  value={r.name}
                  onChange={(e) => updateRate(i, { name: e.target.value })}
                  placeholder="Name"
                  className="min-w-[100px] rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={r.rate}
                  onChange={(e) => updateRate(i, { rate: parseFloat(e.target.value) || 0 })}
                  className="w-20 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <span className="text-sm text-slate-500">%</span>
                <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={!!r.default}
                    onChange={(e) => updateRate(i, { default: e.target.checked })}
                    className="h-3 w-3 rounded border-slate-300 text-zenzex-600"
                  />
                  Default
                </label>
                {rates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRate(i)}
                    className="text-sm text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
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
