'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import {
  countries as locationCountries,
  detectLikelyCountryCode,
  getStates,
  normalizeCountryCode,
} from '@/lib/location';
import type { Customer } from '@/lib/database.types';
import { CurrencySelect } from '@/components/currency/CurrencySelect';
import { labelForCurrencyCode } from '@/lib/currency/supported';
import { CountrySelect } from '@/components/location/CountrySelect';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import {
  defaultCustomerReminderSettings,
  parseCustomerReminderSettings,
  serializeCustomerReminderSettings,
  type ReminderRelativeTo,
} from '@/lib/invoices/reminder-settings';

type FormData = {
  name: string;
  email: string;
  company: string;
  phone: string;
  preferred_currency: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  notes: string;
  automatic_reminders: boolean;
  reminder_timing: { days: string; relativeTo: ReminderRelativeTo }[];
};

const emptyForm: FormData = {
  name: '',
  email: '',
  company: '',
  phone: '',
  preferred_currency: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  country: '',
  postal_code: '',
  notes: '',
  automatic_reminders: false,
  reminder_timing: defaultCustomerReminderSettings().reminderTiming.map((t) => ({
    days: String(t.days),
    relativeTo: t.relativeTo,
  })),
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (customer?: Customer, meta?: { action: 'create' | 'update' }) => void | Promise<void>;
  businessId: string;
  /** Company reporting/base currency; new customers default preferred currency to this. */
  companyBaseCurrency?: string | null;
  customer?: Customer | null;
  readOnly?: boolean;
  onSwitchToEdit?: () => void;
};

export default function CustomerFormModal({
  open,
  onClose,
  onSaved,
  businessId,
  companyBaseCurrency,
  customer,
  readOnly = false,
  onSwitchToEdit,
}: Props) {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showSuccessToast, showErrorToast } = useToasts();

  const isEdit = !!customer?.id && !readOnly;

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    if (customer) {
      const initialName = String(customer.name ?? '').trim();
      const initialCompanyRaw = String(customer.company ?? '').trim();
      const initialCompany =
        initialCompanyRaw &&
        initialName &&
        initialCompanyRaw.toLowerCase() === initialName.toLowerCase()
          ? ''
          : initialCompanyRaw;
      const rs = parseCustomerReminderSettings(
        (customer as { reminder_settings?: unknown }).reminder_settings
      );
      const timing =
        rs && rs.reminderTiming.length > 0
          ? rs.reminderTiming.map((t) => ({ days: String(t.days), relativeTo: t.relativeTo }))
          : defaultCustomerReminderSettings().reminderTiming.map((t) => ({
              days: String(t.days),
              relativeTo: t.relativeTo,
            }));
      setForm({
        name: customer.name ?? '',
        email: customer.email ?? '',
        company: initialCompany,
        phone: customer.phone ?? '',
        preferred_currency: customer.preferred_currency_code ?? '',
        address_line1: customer.address_line1 ?? '',
        address_line2: customer.address_line2 ?? '',
        city: customer.city ?? '',
        state: customer.state ?? '',
        country: customer.country ? normalizeCountryCode(customer.country) : '',
        postal_code: customer.postal_code ?? '',
        notes: customer.notes ?? '',
        automatic_reminders: rs?.automaticReminders ?? false,
        reminder_timing: timing,
      });
    } else {
      const base = String(companyBaseCurrency ?? '').trim().toUpperCase();
      const guessed = detectLikelyCountryCode();
      setForm({ ...emptyForm, preferred_currency: base, country: guessed });
    }
  }, [open, customer, companyBaseCurrency]);

  const update = useCallback((key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      if (key === 'email' || key === 'phone') {
        delete next.email;
        delete next.phone;
      }
      return next;
    });
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (readOnly) return;
      const companyRaw = form.company.trim();
      const name = form.name.trim();
      const company =
        companyRaw &&
        name &&
        companyRaw.toLowerCase() === name.toLowerCase()
          ? ''
          : companyRaw;
      const email = form.email.trim();
      const errors: Partial<Record<keyof FormData, string>> = {};
      if (!company && !name) {
        errors.company = 'Company or client name is required';
      }
      if (!email) {
        errors.email = 'Email is required.';
      }
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setError(null);
        return;
      }
      setFieldErrors({});
      setSubmitting(true);
      setError(null);
      try {
        if (isEdit && customer) {
          const res = await fetch(`/api/customers/${customer.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name || '',
              email: form.email.trim() || null,
              company: company || null,
              phone: form.phone.trim() || null,
              address_line1: form.address_line1.trim() || null,
              address_line2: form.address_line2.trim() || null,
              city: form.city.trim() || null,
              state: form.state.trim() || null,
              country: normalizeCountryCode(form.country) || null,
              postal_code: form.postal_code.trim() || null,
              notes: form.notes.trim() || null,
              preferred_currency_code: form.preferred_currency.trim() || null,
              reminder_settings: serializeCustomerReminderSettings({
                automaticReminders: form.automatic_reminders,
                reminderTiming: form.reminder_timing.map((t) => ({
                  days: Math.min(365, Math.max(0, parseInt(t.days, 10) || 0)),
                  relativeTo: t.relativeTo,
                })),
              }),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Update failed');
          await onSaved(data as Customer, { action: 'update' });
        } else {
          const res = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business_id: businessId,
              name: name || '',
              email: form.email.trim() || null,
              company: company || null,
              phone: form.phone.trim() || null,
              address_line1: form.address_line1.trim() || null,
              address_line2: form.address_line2.trim() || null,
              city: form.city.trim() || null,
              state: form.state.trim() || null,
              country: normalizeCountryCode(form.country) || null,
              postal_code: form.postal_code.trim() || null,
              notes: form.notes.trim() || null,
              preferred_currency_code: form.preferred_currency.trim() || null,
              reminder_settings: serializeCustomerReminderSettings({
                automaticReminders: form.automatic_reminders,
                reminderTiming: form.reminder_timing.map((t) => ({
                  days: Math.min(365, Math.max(0, parseInt(t.days, 10) || 0)),
                  relativeTo: t.relativeTo,
                })),
              }),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Create failed');
          await onSaved(data as Customer, { action: 'create' });
        }
        if (!readOnly && !isEdit) showSuccessToast('Customer created');
        onClose();
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : isEdit
              ? 'Something went wrong. Please retry'
              : 'Couldn\u2019t create customer. Try again';
        showErrorToast(msg);
        setError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [form, businessId, customer, isEdit, readOnly, onSaved, onClose, showErrorToast]
  );

  const inputClass =
    'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white';
  const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
  const getCountryNameFromCode = (code: string) =>
    locationCountries.find((c) => c.code === code)?.name ?? code;
  const countryCode = normalizeCountryCode(form.country);
  const stateOptions = getStates(countryCode);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-x-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-form-title"
    >
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="customer-form-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            {readOnly ? 'Customer profile' : isEdit ? 'Edit customer' : 'Add customer'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {readOnly && customer ? (
          /* Profile view – clean details layout, no readonly inputs */
          <div className="p-6">
            {/* Header: Company name, Account number, primary actions */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                {customer.company?.trim() || customer.name || '—'}
              </h3>
              {customer.account_number && (
                <p className="mt-1 font-mono text-sm text-slate-500 dark:text-slate-400">
                  {customer.account_number}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {onSwitchToEdit && (
                  <button
                    type="button"
                    onClick={onSwitchToEdit}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.04] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-400/5"
                  >
                    Edit
                  </button>
                )}
                <Link
                  href={`/dashboard/invoices/new?mode=form&customer_id=${customer.id}`}
                  onClick={onClose}
                  className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  Create invoice
                </Link>
              </div>
            </div>

            {/* Contact Information */}
            <section className="mb-6">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Contact Information
              </h4>
              <dl className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/30">
                <div>
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Contact Person</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">{customer.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                    {customer.email?.trim() ? (
                      <a href={`mailto:${customer.email}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                        {customer.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Phone</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                    {customer.phone?.trim() ? (
                      <a href={`tel:${customer.phone}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                        {customer.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Preferred invoice currency</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                    {customer.preferred_currency_code?.trim()
                      ? labelForCurrencyCode(customer.preferred_currency_code)
                      : '— (company default)'}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Billing Address */}
            <section className="mb-6">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Billing Address
              </h4>
              <dl className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/30">
                <div>
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Address</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                    {[customer.address_line1, customer.address_line2].filter(Boolean).join(', ') || '—'}
                  </dd>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">City</dt>
                    <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">{customer.city || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">State / Province</dt>
                    <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                  {customer.country
                    ? getStates(customer.country).find((s) => s.code === (customer.state ?? ''))?.name ?? customer.state ?? '—'
                    : customer.state || '—'}
                    </dd>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Country</dt>
                    <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                      {customer.country ? getCountryNameFromCode(customer.country) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Postal Code</dt>
                    <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">{customer.postal_code || '—'}</dd>
                  </div>
                </div>
              </dl>
            </section>

            {/* Additional Information */}
            <section>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Additional Information
              </h4>
              <dl className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/30">
                {customer.notes?.trim() ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Notes</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900 dark:text-white">{customer.notes}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Created Date</dt>
                  <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                    {customer.created_at ? format(new Date(customer.created_at), 'MMM d, yyyy') : '—'}
                  </dd>
                </div>
                {customer.updated_at && customer.updated_at !== customer.created_at ? (
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Updated Date</dt>
                    <dd className="mt-0.5 text-sm text-slate-900 dark:text-white">
                      {format(new Date(customer.updated_at), 'MMM d, yyyy')}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          )}

          {customer?.account_number && (
            <div>
              <label className={labelClass}>Customer Account Number</label>
              <input
                type="text"
                readOnly
                disabled
                value={customer.account_number}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                aria-readonly="true"
              />
            </div>
          )}
          {!customer?.account_number && !readOnly && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Customer account number will be auto-generated when saved.</p>
          )}

          <div>
            {/* 1. Company / Client Name (required) */}
            <div>
              <label htmlFor="customer-company" className={labelClass}>
                Company / Client Name <span className="text-red-500" aria-hidden>*</span>
              </label>
              <input
                id="customer-company"
                type="text"
                required
                className={fieldErrors.company ? inputClass + ' border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500' : inputClass}
                value={form.company}
                onChange={(e) => update('company', e.target.value)}
                placeholder="Only if different from name"
                aria-required="true"
                aria-invalid={!!fieldErrors.company}
                aria-describedby={fieldErrors.company ? 'customer-company-error' : undefined}
              />
              {fieldErrors.company && (
                <p id="customer-company-error" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {fieldErrors.company}
                </p>
              )}
            </div>

            {/* 2. Contact Person (optional) */}
            <div>
              <label htmlFor="customer-name" className={labelClass}>
                Contact Person
              </label>
              <input
                id="customer-name"
                type="text"
                className={fieldErrors.name ? inputClass + ' border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500' : inputClass}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Full name of contact (optional)"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? 'customer-name-error' : undefined}
              />
              {fieldErrors.name && (
                <p id="customer-name-error" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {fieldErrors.name}
                </p>
              )}
            </div>

            {/* 3. Email */}
            <div>
              <label htmlFor="customer-email" className={labelClass}>Email</label>
              <p className="text-xs text-slate-500 dark:text-slate-400">Required for customer profile.</p>
              <input
                id="customer-email"
                type="email"
                required
                className={fieldErrors.email ? inputClass + ' border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500' : inputClass}
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="billing@example.com"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'customer-contact-error' : undefined}
              />
              {fieldErrors.email && (
                <p id="customer-contact-error" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* 4. Phone */}
            <div>
              <label htmlFor="customer-phone" className={labelClass}>Phone</label>
              <input
                id="customer-phone"
                type="tel"
                className={fieldErrors.phone ? inputClass + ' border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500' : inputClass}
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+1 234 567 8900"
                aria-invalid={!!fieldErrors.phone}
                aria-describedby={fieldErrors.phone ? 'customer-contact-error' : undefined}
              />
            </div>

            <div>
              <label htmlFor="customer-pref-currency" className={labelClass}>
                Preferred invoice currency
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Defaults to your company base currency ({companyBaseCurrency ?? '—'}). New invoices use this unless you override on the invoice.
              </p>
              <CurrencySelect
                id="customer-pref-currency"
                allowEmpty
                emptyLabel={
                  companyBaseCurrency
                    ? `Use company base (${companyBaseCurrency})`
                    : 'Use company base currency'
                }
                value={form.preferred_currency}
                onChange={(code) => update('preferred_currency', code)}
                className={inputClass}
              />
            </div>

            {/* 5. Billing Address */}
            <div>
              <label htmlFor="customer-address" className={labelClass}>Billing Address</label>
              <input
                id="customer-address"
                type="text"
                className={inputClass}
                value={form.address_line1}
                onChange={(e) => update('address_line1', e.target.value)}
                placeholder="Street address"
              />
            </div>
            <div>
              <label htmlFor="customer-address2" className={labelClass}>Address line 2</label>
              <input
                id="customer-address2"
                type="text"
                className={inputClass}
                value={form.address_line2}
                onChange={(e) => update('address_line2', e.target.value)}
                placeholder="Suite, unit, etc."
              />
            </div>

            {/* 6. City, 7. State / Province */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="customer-city" className={labelClass}>City</label>
                <input
                  id="customer-city"
                  type="text"
                  className={inputClass}
                  value={form.city}
                  onChange={(e) => update('city', e.target.value)}
                  placeholder="City"
                />
              </div>
              <div>
                <label htmlFor="customer-state" className={labelClass}>State / Province</label>
                {stateOptions.length > 0 ? (
                  <select
                    id="customer-state"
                    className={inputClass}
                    value={form.state}
                    onChange={(e) => update('state', e.target.value)}
                    aria-label="State or province"
                  >
                    <option value="">Select</option>
                    {stateOptions.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="customer-state"
                    type="text"
                    className={inputClass}
                    value={form.state}
                    onChange={(e) => update('state', e.target.value)}
                    placeholder="State / Province"
                  />
                )}
              </div>
            </div>

            {/* 8. Country, 9. Postal Code */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 min-w-0 max-w-full">
                <label htmlFor="customer-country" className={labelClass}>
                  Country
                </label>
                <CountrySelect
                  id="customer-country"
                  value={form.country}
                  onChange={(isoCode) => {
                    update('country', isoCode);
                    update('state', '');
                  }}
                  className={inputClass + ' h-11'}
                />
              </div>
              <div>
                <label htmlFor="customer-postal" className={labelClass}>Postal Code</label>
                <input
                  id="customer-postal"
                  type="text"
                  className={inputClass}
                  value={form.postal_code}
                  onChange={(e) => update('postal_code', e.target.value)}
                  placeholder="Postal code"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Invoice reminders</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Default rules for this customer. Invoices can follow these or use custom rules.
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  checked={form.automatic_reminders}
                  onChange={(e) => setForm((f) => ({ ...f, automatic_reminders: e.target.checked }))}
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Automatic reminders</span>
              </label>
              <ul className="mt-3 space-y-2">
                {form.reminder_timing.map((row, idx) => (
                  <li key={idx} className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                      value={row.days}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((f) => ({
                          ...f,
                          reminder_timing: f.reminder_timing.map((r, i) =>
                            i === idx ? { ...r, days: v } : r
                          ),
                        }));
                      }}
                      aria-label="Days"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">days</span>
                    <select
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                      value={row.relativeTo}
                      onChange={(e) => {
                        const rel = e.target.value === 'after_due' ? 'after_due' : 'before_due';
                        setForm((f) => ({
                          ...f,
                          reminder_timing: f.reminder_timing.map((r, i) =>
                            i === idx ? { ...r, relativeTo: rel } : r
                          ),
                        }));
                      }}
                    >
                      <option value="before_due">before due date</option>
                      <option value="after_due">after due date</option>
                    </select>
                    <button
                      type="button"
                      className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          reminder_timing: f.reminder_timing.filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    reminder_timing: [...f.reminder_timing, { days: '1', relativeTo: 'before_due' as ReminderRelativeTo }],
                  }))
                }
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400"
              >
                <Plus className="h-4 w-4" />
                Add timing
              </button>
            </div>

            {/* 10. Notes */}
            <div>
              <label htmlFor="customer-notes" className={labelClass}>Notes</label>
              <textarea
                id="customer-notes"
                rows={2}
                className={inputClass}
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="Internal notes"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.04] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-400/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {submitting
                ? isEdit
                ? 'Saving customer changes...'
                  : 'Creating customer...'
                : isEdit
                  ? 'Save changes'
                  : 'Add customer'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
