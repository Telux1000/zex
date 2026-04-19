'use client';

import { useState } from 'react';
import type { Business, InvoiceSettings } from '@/lib/database.types';
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
  { value: 'due_on_receipt', label: 'Due on receipt' },
];

function defaultInvoiceSettings(business: Business): InvoiceSettings {
  const s = business.invoice_settings ?? {};
  return {
    number_prefix: s.number_prefix ?? 'INV',
    start_number: s.start_number ?? 1,
    auto_increment: s.auto_increment ?? true,
    default_payment_terms: s.default_payment_terms ?? 'net_30',
    default_tax_rate: s.default_tax_rate ?? 0,
    default_notes: s.default_notes ?? '',
    default_terms: s.default_terms ?? '',
    show_customer_address: s.show_customer_address ?? true,
    show_tax_breakdown: s.show_tax_breakdown ?? true,
    show_discount_line: s.show_discount_line ?? true,
  };
}

export function InvoiceSettingsForm({ business, onSuccess, onClearSuccess }: Props) {
  const [settings, setSettings] = useState<InvoiceSettings>(() => defaultInvoiceSettings(business));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onClearSuccess();
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_settings: settings,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Invoice Settings</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Numbering and default behavior for new invoices. Base currency is under Settings → Finance → Currency.
      </p>
      <div className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Invoice number prefix</label>
            <input
              type="text"
              value={settings.number_prefix ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, number_prefix: e.target.value }))}
              placeholder="INV"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Starting invoice number</label>
            <input
              type="number"
              min={1}
              value={settings.start_number ?? 1}
              onChange={(e) => setSettings((s) => ({ ...s, start_number: parseInt(e.target.value, 10) || 1 }))}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="auto_increment"
            checked={settings.auto_increment ?? true}
            onChange={(e) => setSettings((s) => ({ ...s, auto_increment: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-zenzex-600 focus:ring-zenzex-500"
          />
          <label htmlFor="auto_increment" className="text-sm text-slate-700 dark:text-slate-300">
            Auto-increment invoice numbers
          </label>
        </div>
        <div>
          <label className={labelClass}>Default payment terms</label>
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
        <div>
          <label className={labelClass}>Default tax rate (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={settings.default_tax_rate ?? 0}
            onChange={(e) => setSettings((s) => ({ ...s, default_tax_rate: parseFloat(e.target.value) || 0 }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Default invoice notes</label>
          <textarea
            rows={2}
            value={settings.default_notes ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, default_notes: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Default invoice terms</label>
          <textarea
            rows={2}
            value={settings.default_terms ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, default_terms: e.target.value }))}
            className={inputClass}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className={labelClass}>Invoice appearance</legend>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show_customer_address"
              checked={settings.show_customer_address ?? true}
              onChange={(e) => setSettings((s) => ({ ...s, show_customer_address: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-zenzex-600 focus:ring-zenzex-500"
            />
            <label htmlFor="show_customer_address" className="text-sm text-slate-700 dark:text-slate-300">
              Show customer address
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show_tax_breakdown"
              checked={settings.show_tax_breakdown ?? true}
              onChange={(e) => setSettings((s) => ({ ...s, show_tax_breakdown: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-zenzex-600 focus:ring-zenzex-500"
            />
            <label htmlFor="show_tax_breakdown" className="text-sm text-slate-700 dark:text-slate-300">
              Show tax breakdown
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show_discount_line"
              checked={settings.show_discount_line ?? true}
              onChange={(e) => setSettings((s) => ({ ...s, show_discount_line: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-zenzex-600 focus:ring-zenzex-500"
            />
            <label htmlFor="show_discount_line" className="text-sm text-slate-700 dark:text-slate-300">
              Show discount line
            </label>
          </div>
        </fieldset>
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
