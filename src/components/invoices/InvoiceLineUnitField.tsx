'use client';

import {
  INVOICE_UNIT_CUSTOM_SELECT_VALUE,
  INVOICE_UNIT_SELECT_OPTIONS,
  isStandardInvoiceUnit,
  normalizeCustomUnitLabelInput,
} from '@/lib/invoices/invoice-line-units';
import { MANUAL_INVOICE_FIELD_FOCUS } from '@/components/invoices/manual-invoice-field-classes';

type Variant = 'mobile' | 'desktop' | 'voice';

const selectClass: Record<Variant, string> = {
  mobile:
    'mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white ' +
    MANUAL_INVOICE_FIELD_FOCUS,
  desktop:
    'h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white ' +
    MANUAL_INVOICE_FIELD_FOCUS,
  voice:
    'w-full rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500',
};

const customInputClass: Record<Variant, string> = {
  mobile:
    'mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 ' +
    MANUAL_INVOICE_FIELD_FOCUS,
  desktop:
    'mt-1.5 h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 placeholder:text-slate-400 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 ' +
    MANUAL_INVOICE_FIELD_FOCUS,
  voice:
    'mt-1 w-full rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500',
};

export type InvoiceLineUnitFieldProps = {
  id: string;
  unitLabel: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  variant: Variant;
};

/**
 * Standard units + Custom… for service/product billing.
 * Custom mode may use empty string until the user types; persist with `normalizeInvoiceUnitLabel` on save.
 */
export function InvoiceLineUnitField({ id, unitLabel, onChange, disabled, variant }: InvoiceLineUnitFieldProps) {
  const trimmed = String(unitLabel ?? '').trim();
  const lower = trimmed.toLowerCase();
  const isPreset = trimmed !== '' && isStandardInvoiceUnit(lower);
  const selectValue = isPreset ? lower : INVOICE_UNIT_CUSTOM_SELECT_VALUE;
  const customInputValue = isPreset ? '' : lower;

  return (
    <div className="min-w-0">
      <select
        id={id}
        aria-label="Unit"
        className={selectClass[variant]}
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === INVOICE_UNIT_CUSTOM_SELECT_VALUE) {
            onChange('');
          } else {
            onChange(v);
          }
        }}
      >
        {INVOICE_UNIT_SELECT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={INVOICE_UNIT_CUSTOM_SELECT_VALUE}>Custom…</option>
      </select>
      {selectValue === INVOICE_UNIT_CUSTOM_SELECT_VALUE ? (
        <input
          type="text"
          id={`${id}-custom`}
          className={customInputClass[variant]}
          value={customInputValue}
          onChange={(e) => onChange(normalizeCustomUnitLabelInput(e.target.value))}
          placeholder="Enter unit (e.g. milestone, package, session)"
          disabled={disabled}
          autoComplete="off"
          aria-label="Custom unit label"
        />
      ) : null}
    </div>
  );
}
