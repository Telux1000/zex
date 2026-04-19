'use client';

import { useCallback, useEffect, useState } from 'react';
import ExpenseAttachmentUpload, { type ExpenseAttachmentValue } from './ExpenseAttachmentUpload';

export type ExpenseRow = {
  id: string;
  business_id: string;
  expense_date: string;
  description: string;
  category: string;
  amount: number;
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
  expense: ExpenseRow | null;
};

export default function ExpenseFormModal({ open, onClose, onSaved, businessId, expense }: Props) {
  const isEdit = Boolean(expense?.id);
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [attachment, setAttachment] = useState<ExpenseAttachmentValue>({
    url: null,
    name: null,
    type: null,
    size: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (expense) {
      setExpenseDate(String(expense.expense_date).slice(0, 10));
      setDescription(expense.description ?? '');
      setCategory(expense.category || 'General');
      setAmount(String(expense.amount ?? ''));
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
      setNotes('');
      setAttachment({ url: null, name: null, type: null, size: null });
    }
  }, [open, expense]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const desc = description.trim();
      if (!desc) {
        setError('Description is required.');
        return;
      }
      const n = Number(amount);
      if (!Number.isFinite(n)) {
        setError('Enter a valid amount.');
        return;
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
        setError('Something went wrong. Please retry');
      } finally {
        setSubmitting(false);
      }
    },
    [amount, attachment, businessId, category, description, expense, expenseDate, isEdit, notes, onClose, onSaved]
  );

  if (!open) return null;

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
            <input
              id="expense-date"
              type="date"
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
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
          <div>
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
