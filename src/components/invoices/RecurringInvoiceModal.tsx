'use client';

import { useEffect, useState } from 'react';
import { formatDisplayDate } from '@/lib/utils/date';
import { useToasts } from '@/components/feedback/toast/ToastProvider';

type EndCondition = 'never' | 'end_date' | 'count';
type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
type AutomationMode = 'draft' | 'auto_send';

export type RecurringInvoiceModalProps = {
  open: boolean;
  onClose: () => void;
  businessId: string;
  /** Required for create flow */
  sourceInvoiceId?: string;
  /** When set, loads rule and PATCHes instead of POST */
  editRuleId?: string | null;
  onCreated?: (payload: { next_invoice_date: string; message: string }) => void;
};

const freqLabel: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function RecurringInvoiceModal({
  open,
  onClose,
  businessId,
  sourceInvoiceId,
  editRuleId,
  onCreated,
}: RecurringInvoiceModalProps) {
  const { showErrorToast } = useToasts();
  const [loading, setLoading] = useState(false);
  const [loadRule, setLoadRule] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endCondition, setEndCondition] = useState<EndCondition>('never');
  const [endDate, setEndDate] = useState('');
  const [endAfterCount, setEndAfterCount] = useState(12);
  const [automationMode, setAutomationMode] = useState<AutomationMode>('draft');
  const [nextRunDate, setNextRunDate] = useState('');

  const isEdit = Boolean(editRuleId);

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    if (!isEdit) {
      setFrequency('monthly');
      setStartDate(today);
      setEndCondition('never');
      setEndDate('');
      setEndAfterCount(12);
      setAutomationMode('draft');
      setNextRunDate('');
      return;
    }
    let cancelled = false;
    setLoadRule(true);
    fetch(`/api/recurring-invoices/${editRuleId}`)
      .then((r) => r.json())
      .then((data: { rule?: Record<string, unknown> }) => {
        if (cancelled || !data.rule) return;
        const r = data.rule;
        setFrequency((String(r.frequency) as Frequency) || 'monthly');
        setStartDate(String(r.start_date ?? today));
        setEndCondition((String(r.end_condition_type) as EndCondition) || 'never');
        setEndDate(r.end_date ? String(r.end_date) : '');
        setEndAfterCount(
          r.end_after_count != null ? Number(r.end_after_count) : 12
        );
        setAutomationMode((String(r.automation_mode) as AutomationMode) || 'draft');
        setNextRunDate(String(r.next_run_date ?? today));
      })
      .catch(() => showErrorToast('Could not load recurring rule'))
      .finally(() => {
        if (!cancelled) setLoadRule(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, editRuleId, showErrorToast]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      if (!editRuleId) return;
      if (!nextRunDate) {
        showErrorToast('Next invoice date is required');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/recurring-invoices/${editRuleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frequency,
            end_condition_type: endCondition,
            end_date: endCondition === 'end_date' ? endDate : null,
            end_after_count: endCondition === 'count' ? endAfterCount : null,
            automation_mode: automationMode,
            next_run_date: nextRunDate,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Update failed');
        onCreated?.({
          next_invoice_date: String((data as { rule?: { next_run_date?: string } }).rule?.next_run_date ?? nextRunDate),
          message: 'Recurring invoice updated',
        });
        onClose();
      } catch (err) {
        showErrorToast(err instanceof Error ? err.message : 'Update failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!sourceInvoiceId) {
      showErrorToast('Missing invoice');
      return;
    }
    if (!startDate) {
      showErrorToast('Start date is required');
      return;
    }
    if (endCondition === 'end_date' && !endDate) {
      showErrorToast('End date is required');
      return;
    }
    if (endCondition === 'count' && (!endAfterCount || endAfterCount < 1)) {
      showErrorToast('Enter how many invoices to create');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/recurring-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          source_invoice_id: sourceInvoiceId,
          frequency,
          start_date: startDate,
          end_condition_type: endCondition,
          end_date: endCondition === 'end_date' ? endDate : undefined,
          end_after_count: endCondition === 'count' ? endAfterCount : undefined,
          automation_mode: automationMode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to create recurring invoice');
      const next = String((data as { next_invoice_date?: string }).next_invoice_date ?? '');
      onCreated?.({
        next_invoice_date: next,
        message: String((data as { message?: string }).message ?? 'Recurring invoice created'),
      });
      onClose();
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => {
          if (!loading) onClose();
        }}
      />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          {isEdit ? 'Edit recurring invoice' : 'Create recurring invoice'}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {isEdit
            ? 'Update schedule and automation. Line items stay frozen from the original template.'
            : 'Invoices are generated from this invoice as a template. Default is draft — nothing is emailed until you choose automatic send.'}
        </p>

        {loadRule ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {(Object.keys(freqLabel) as Frequency[]).map((k) => (
                  <option key={k} value={k}>
                    {freqLabel[k]}
                  </option>
                ))}
              </select>
            </div>

            {!isEdit ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Start date</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-slate-500">First invoice run on or after this date (UTC calendar day).</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Original start date</label>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{formatDisplayDate(startDate)}</p>
              </div>
            )}

            {isEdit ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Next invoice date</label>
                <input
                  type="date"
                  required
                  value={nextRunDate}
                  onChange={(e) => setNextRunDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">End condition</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="end"
                  checked={endCondition === 'never'}
                  onChange={() => setEndCondition('never')}
                />
                Never (until cancelled)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="end"
                  checked={endCondition === 'end_date'}
                  onChange={() => setEndCondition('end_date')}
                />
                End on date
              </label>
              {endCondition === 'end_date' ? (
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="end"
                  checked={endCondition === 'count'}
                  onChange={() => setEndCondition('count')}
                />
                After a number of invoices
              </label>
              {endCondition === 'count' ? (
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={endAfterCount}
                  onChange={(e) => setEndAfterCount(Number(e.target.value))}
                  className="ml-6 w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              ) : null}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Automation</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="auto"
                  checked={automationMode === 'draft'}
                  onChange={() => setAutomationMode('draft')}
                />
                Create as draft (default)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="auto"
                  checked={automationMode === 'auto_send'}
                  onChange={() => setAutomationMode('auto_send')}
                />
                Automatically send to customer
              </label>
              <p className="text-xs text-slate-500">
                Automatic send uses the same flow as “Send invoice” (customer email and payment link required).
              </p>
            </fieldset>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create schedule'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
