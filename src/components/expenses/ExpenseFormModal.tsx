'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import ExpenseAttachmentUpload, { type ExpenseAttachmentValue } from './ExpenseAttachmentUpload';
import { CurrencySelect } from '@/components/currency/CurrencySelect';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { roundMoney2 } from '@/lib/currency/amounts-in-base';

export type ExpenseRow = {
  id: string;
  business_id: string;
  expense_date: string;
  description: string;
  category: string;
  amount: number;
  currency?: string | null;
  base_currency?: string | null;
  base_amount?: number | null;
  exchange_rate?: number | null;
  attachment_url: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

const CATEGORIES = ['General', 'Travel', 'Meals', 'Software', 'Office', 'Marketing', 'Other'] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  businessId: string;
  baseCurrency: string;
  expense: ExpenseRow | null;
};

export default function ExpenseFormModal({ open, onClose, onSaved, businessId, baseCurrency, expense }: Props) {
  const isEdit = Boolean(expense?.id);
  const base = (baseCurrency || 'USD').trim().toUpperCase() || 'USD';
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [amount, setAmount] = useState('');
  const [expenseCurrency, setExpenseCurrency] = useState(base);
  const [exchangeRateStr, setExchangeRateStr] = useState('1');
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const skipFxFetchRef = useRef(true);
  const [notes, setNotes] = useState('');
  const [attachment, setAttachment] = useState<ExpenseAttachmentValue>({
    url: null,
    name: null,
    type: null,
    size: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expenseDateInputRef = useRef<HTMLInputElement | null>(null);

  const isValidExpenseDate = useCallback((value: string): boolean => {
    const v = String(value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00.000Z`);
    if (!Number.isFinite(d.getTime())) return false;
    return d.toISOString().slice(0, 10) === v;
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    skipFxFetchRef.current = true;
    if (expense) {
      setExpenseDate(String(expense.expense_date).slice(0, 10));
      setDescription(expense.description ?? '');
      setCategory(expense.category || 'General');
      setAmount(String(expense.amount ?? ''));
      setExpenseCurrency(
        (expense.currency != null && String(expense.currency).trim() !== ''
          ? String(expense.currency).trim()
          : base
        ).toUpperCase()
      );
      const savedRate = expense.exchange_rate != null ? Number(expense.exchange_rate) : NaN;
      setExchangeRateStr(
        Number.isFinite(savedRate) && savedRate > 0 ? String(savedRate) : '1'
      );
      setNotes(expense.notes ?? '');
      setAttachment({
        url: expense.attachment_url ?? null,
        name: expense.attachment_name ?? null,
        type: expense.attachment_type ?? null,
        size: expense.attachment_size ?? null,
      });
    } else {
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setDescription('');
      setCategory('General');
      setAmount('');
      setExpenseCurrency(base);
      setExchangeRateStr('1');
      setNotes('');
      setAttachment({ url: null, name: null, type: null, size: null });
    }
  }, [open, expense, base]);

  useEffect(() => {
    if (!open) return;
    const exp = expenseCurrency.toUpperCase();
    if (exp === base) {
      setExchangeRateStr('1');
      setFxError(null);
      setFxLoading(false);
      return;
    }
    if (skipFxFetchRef.current) {
      skipFxFetchRef.current = false;
      return;
    }
    let cancelled = false;
    setFxLoading(true);
    setFxError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/exchange-rate?from=${encodeURIComponent(exp)}&to=${encodeURIComponent(base)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Rate unavailable');
        const r = Number(data.rate);
        if (!Number.isFinite(r) || r <= 0) throw new Error('Invalid rate');
        setExchangeRateStr(String(r));
      } catch (e) {
        if (!cancelled) {
          setFxError(e instanceof Error ? e.message : 'Could not load rate');
          setExchangeRateStr('1');
        }
      } finally {
        if (!cancelled) setFxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, expenseCurrency, base]);

  const approxBase =
    expenseCurrency.toUpperCase() !== base
      ? (() => {
          const a = Number(amount);
          const r = Number(exchangeRateStr);
          if (!Number.isFinite(a) || !Number.isFinite(r) || r <= 0) return null;
          return roundMoney2(a * r);
        })()
      : null;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const desc = description.trim();
      if (!expenseDate.trim()) {
        setError('Date is required.');
        return;
      }
      if (!isValidExpenseDate(expenseDate)) {
        setError('Enter a valid expense date.');
        return;
      }
      if (!desc) {
        setError('Description is required.');
        return;
      }
      const n = Number(amount);
      if (!Number.isFinite(n)) {
        setError('Enter a valid amount.');
        return;
      }
      const exp = expenseCurrency.trim().toUpperCase();
      let rate = 1;
      if (exp !== base) {
        rate = Number(exchangeRateStr);
        if (!Number.isFinite(rate) || rate <= 0) {
          setError('Enter a valid exchange rate.');
          return;
        }
      }
      setSubmitting(true);
      try {
        if (isEdit && expense) {
          const res = await fetch(`/api/expenses/${expense.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expense_date: expenseDate,
              description: desc,
              category: category.trim() || 'General',
              amount: n,
              currency: exp,
              exchange_rate: rate,
              attachment_url: attachment.url?.trim() || null,
              attachment_name: attachment.name?.trim() || null,
              attachment_type: attachment.type?.trim() || null,
              attachment_size: attachment.size ?? null,
              notes: notes.trim() || null,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? 'Update failed');
        } else {
          const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business_id: businessId,
              expense_date: expenseDate,
              description: desc,
              category: category.trim() || 'General',
              amount: n,
              currency: exp,
              exchange_rate: rate,
              attachment_url: attachment.url?.trim() || null,
              attachment_name: attachment.name?.trim() || null,
              attachment_type: attachment.type?.trim() || null,
              attachment_size: attachment.size ?? null,
              notes: notes.trim() || null,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? 'Create failed');
        }
        onSaved();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please retry');
      } finally {
        setSubmitting(false);
      }
    },
    [
      amount,
      attachment,
      base,
      businessId,
      category,
      description,
      exchangeRateStr,
      expense,
      expenseCurrency,
      expenseDate,
      isEdit,
      notes,
      onClose,
      onSaved,
      isValidExpenseDate,
    ]
  );

  if (!open) return null;

  const showFx = expenseCurrency.toUpperCase() !== base;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isEdit ? 'Edit expense' : 'Record expense'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="expense-date" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Date
            </label>
            <div className="relative mt-1">
              <input
                ref={expenseDateInputRef}
                id="expense-date"
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                onClick={(e) => {
                  const input = e.currentTarget;
                  if (typeof input.showPicker === 'function') input.showPicker();
                }}
                className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="button"
                aria-label="Open date picker"
                onClick={() => {
                  const input = expenseDateInputRef.current;
                  if (!input) return;
                  input.focus();
                  if (typeof input.showPicker === 'function') input.showPicker();
                }}
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <CalendarDays className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="expense-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Description
            </label>
            <input
              id="expense-description"
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="expense-category" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Category
            </label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="expense-amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Amount
              </label>
              <input
                id="expense-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="w-full shrink-0 sm:w-40">
              <label htmlFor="expense-currency" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Currency
              </label>
              <CurrencySelect
                id="expense-currency"
                value={expenseCurrency}
                onChange={(code) => setExpenseCurrency(code.toUpperCase())}
                disabled={submitting}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
          {showFx ? (
            <div className="space-y-2 rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/40">
              {approxBase != null ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  ≈{' '}
                  <span className="font-medium text-slate-900 dark:text-white">
                    {formatCurrencyAmount(approxBase, base)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Enter amount and rate to see base estimate.</p>
              )}
              <div>
                <label
                  htmlFor="expense-fx-rate"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Exchange rate
                  {fxLoading ? (
                    <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">Loading…</span>
                  ) : null}
                </label>
                <input
                  id="expense-fx-rate"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  required
                  value={exchangeRateStr}
                  onChange={(e) => setExchangeRateStr(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  1 {expenseCurrency} → {exchangeRateStr || '—'} {base}
                </p>
              </div>
              {fxError ? (
                <p className="text-xs text-amber-700 dark:text-amber-300/90">
                  {fxError}. Using 1.00 — adjust if needed.
                </p>
              ) : null}
            </div>
          ) : null}
          <div>
            <label htmlFor="expense-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Notes <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
            </label>
            <textarea
              id="expense-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes, memo, or extra context…"
              className="mt-1 block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white md:min-h-[4.875rem]"
            />
          </div>
          <ExpenseAttachmentUpload
            businessId={businessId}
            value={attachment}
            onChange={setAttachment}
            disabled={submitting}
          />
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300/50 hover:bg-indigo-500/[0.04] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-400/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
