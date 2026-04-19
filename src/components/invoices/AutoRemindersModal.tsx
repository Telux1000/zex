'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  parseInvoiceReminderSettings,
  resolveEffectiveReminderConfig,
  serializeInvoiceReminderSettings,
  type InvoiceReminderSettings,
  type ReminderTimingEntry,
} from '@/lib/invoices/reminder-settings';
import { formatNextReminderPreview } from '@/lib/invoices/auto-reminders-preview';
import {
  applySmartTimingDefaults,
  formatLocalDatetimeInput,
  isBeforeDueOptionAllowed,
  overdueCalendarDays,
  SCHEDULED_IN_PAST_MESSAGE,
  suggestFutureDatetimeLocalFrom,
  validateReminderTimingRows,
  validateScheduledDatetimeLocal,
} from '@/lib/invoices/auto-reminders-modal-validation';
import { useToasts } from '@/components/feedback/toast/ToastProvider';

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatLocalDatetimeInput(d);
}

type Props = {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  dueDate: string;
  useCustomerReminderDefaults: boolean;
  reminderSettings: unknown;
  customerReminderSettings: unknown | null;
  onSaved?: () => void;
};

export function AutoRemindersModal({
  open,
  onClose,
  invoiceId,
  dueDate,
  useCustomerReminderDefaults: initialUseDef,
  reminderSettings: initialRem,
  customerReminderSettings,
  onSaved,
}: Props) {
  const { showSuccessToast, showErrorToast } = useToasts();
  const [saving, setSaving] = useState(false);
  const [useCustomerReminderDefaults, setUseCustomerReminderDefaults] = useState(true);
  const [invoiceReminderAuto, setInvoiceReminderAuto] = useState(false);
  const [invoiceReminderTiming, setInvoiceReminderTiming] = useState<ReminderTimingEntry[]>([
    { days: 3, relativeTo: 'before_due' },
    { days: 3, relativeTo: 'after_due' },
  ]);
  const [scheduledReminderLocal, setScheduledReminderLocal] = useState('');

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setUseCustomerReminderDefaults(initialUseDef !== false);
    const irs = parseInvoiceReminderSettings(initialRem) ?? {};
    if (irs.scheduledReminderAt) {
      setScheduledReminderLocal(toDatetimeLocalValue(String(irs.scheduledReminderAt)));
    } else {
      setScheduledReminderLocal('');
    }
    if (irs.automaticReminders != null) setInvoiceReminderAuto(Boolean(irs.automaticReminders));
    let timing: ReminderTimingEntry[];
    if (irs.reminderTiming && irs.reminderTiming.length > 0) {
      timing = irs.reminderTiming;
    } else {
      timing = [
        { days: 3, relativeTo: 'before_due' },
        { days: 3, relativeTo: 'after_due' },
      ];
    }
    setInvoiceReminderTiming(applySmartTimingDefaults(timing, dueDate, now));
  }, [open, initialUseDef, initialRem, dueDate]);

  /** Keep rows valid if due is today/past (before_due not allowed). No-op when already normalized. */
  useEffect(() => {
    if (!open || useCustomerReminderDefaults || !invoiceReminderAuto) return;
    if (isBeforeDueOptionAllowed(dueDate, new Date())) return;
    setInvoiceReminderTiming((prev) => {
      const next = applySmartTimingDefaults(prev, dueDate, new Date());
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [open, useCustomerReminderDefaults, invoiceReminderAuto, dueDate]);

  const effective = useMemo(() => {
    let scheduledIso: string | null = null;
    if (scheduledReminderLocal.trim()) {
      const t = new Date(scheduledReminderLocal);
      if (!Number.isNaN(t.getTime())) scheduledIso = t.toISOString();
    }
    const invRaw: InvoiceReminderSettings = {
      scheduledReminderAt: scheduledIso,
      ...(!useCustomerReminderDefaults
        ? {
            automaticReminders: invoiceReminderAuto,
            reminderTiming: invoiceReminderTiming.map((r) => ({
              days: r.days,
              relativeTo: r.relativeTo,
            })),
          }
        : {}),
    };
    return resolveEffectiveReminderConfig(
      useCustomerReminderDefaults,
      customerReminderSettings,
      invRaw
    );
  }, [
    scheduledReminderLocal,
    useCustomerReminderDefaults,
    invoiceReminderAuto,
    invoiceReminderTiming,
    customerReminderSettings,
  ]);

  const previewText = useMemo(
    () => formatNextReminderPreview(effective, dueDate),
    [effective, dueDate]
  );

  const validationNow = new Date();
  const allowBeforeDue = isBeforeDueOptionAllowed(dueDate, validationNow);
  const overdueDays = overdueCalendarDays(dueDate, validationNow);

  const scheduledValidation = validateScheduledDatetimeLocal(scheduledReminderLocal, validationNow);
  const scheduledError = scheduledValidation.ok ? undefined : scheduledValidation.error;

  const timingValidation =
    !useCustomerReminderDefaults && invoiceReminderAuto
      ? validateReminderTimingRows(invoiceReminderTiming, dueDate, validationNow)
      : ({ ok: true as const } as const);

  const rowErrorMap =
    timingValidation.ok === false ? timingValidation.rowErrors : new Map<number, string>();

  const formValid = scheduledValidation.ok && timingValidation.ok;

  const handleSave = async () => {
    const now = new Date();
    const sched = validateScheduledDatetimeLocal(scheduledReminderLocal, now);
    const timing =
      !useCustomerReminderDefaults && invoiceReminderAuto
        ? validateReminderTimingRows(invoiceReminderTiming, dueDate, now)
        : ({ ok: true as const } as const);
    if (!sched.ok || !timing.ok) {
      showErrorToast('Fix the highlighted issues before saving.');
      return;
    }

    let scheduledIso: string | null = null;
    if (scheduledReminderLocal.trim()) {
      const t = new Date(scheduledReminderLocal);
      if (!Number.isNaN(t.getTime())) scheduledIso = t.toISOString();
    }
    const merged: InvoiceReminderSettings = {
      scheduledReminderAt: scheduledIso,
      ...(!useCustomerReminderDefaults
        ? {
            automaticReminders: invoiceReminderAuto,
            reminderTiming: invoiceReminderTiming.map((r) => ({
              days: r.days,
              relativeTo: r.relativeTo,
            })),
          }
        : {}),
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          use_customer_reminder_defaults: useCustomerReminderDefaults,
          reminder_settings: serializeInvoiceReminderSettings(merged, {
            useCustomerDefaults: useCustomerReminderDefaults,
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to save');
      showSuccessToast('Auto reminders saved');
      onSaved?.();
      onClose();
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-200';
  const inputClass =
    'mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
  const inputErrorClass =
    'mt-1 block h-10 w-full rounded-lg border border-red-500 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-red-500 dark:bg-slate-900 dark:text-white';

  const minScheduleLocal = formatLocalDatetimeInput(validationNow);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => !saving && onClose()}
      />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Auto reminders</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Configure automatic payment reminders for this invoice. Manual &quot;Send reminder&quot; is unchanged.
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200">
          <span className="font-medium">Preview:</span> {previewText}
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={useCustomerReminderDefaults}
              onChange={(e) => setUseCustomerReminderDefaults(e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Use customer reminder settings
            </span>
          </label>

          {!useCustomerReminderDefaults && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  checked={invoiceReminderAuto}
                  onChange={(e) => setInvoiceReminderAuto(e.target.checked)}
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Automatic reminders</span>
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sends on the schedule below when the invoice cron runs. Requires customer email.
              </p>
              {invoiceReminderAuto && overdueDays > 0 ? (
                <p className="text-xs text-amber-800 dark:text-amber-200/90">
                  This invoice is {overdueDays} day{overdueDays === 1 ? '' : 's'} past due. &quot;After due
                  date&quot; reminders must use at least {overdueDays} day{overdueDays === 1 ? '' : 's'}.
                </p>
              ) : null}
              <ul className="space-y-2">
                {invoiceReminderAuto &&
                  invoiceReminderTiming.map((row, idx) => {
                      const rowErr = rowErrorMap.get(idx);
                      const minAfter = overdueDays > 0 ? overdueDays : 0;
                      return (
                        <li key={idx} className="rounded-md border border-transparent p-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min={row.relativeTo === 'after_due' ? minAfter : 0}
                              max={365}
                              className={`w-20 rounded-lg border px-2 py-1.5 text-sm dark:bg-slate-900 ${
                                rowErr
                                  ? 'border-red-500 dark:border-red-500'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                              value={row.days}
                              onChange={(e) => {
                                let n = Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0));
                                if (row.relativeTo === 'after_due' && overdueDays > 0) {
                                  n = Math.max(n, overdueDays);
                                }
                                setInvoiceReminderTiming((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, days: n } : r))
                                );
                              }}
                              aria-label="Days"
                            />
                            <span className="text-sm text-slate-600 dark:text-slate-400">days</span>
                            <select
                              className={`rounded-lg border px-2 py-1.5 text-sm dark:bg-slate-900 ${
                                rowErr
                                  ? 'border-red-500 dark:border-red-500'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                              value={row.relativeTo}
                              onChange={(e) => {
                                const v = e.target.value === 'after_due' ? 'after_due' : 'before_due';
                                setInvoiceReminderTiming((prev) =>
                                  prev.map((r, i) => {
                                    if (i !== idx) return r;
                                    if (v === 'after_due' && overdueDays > 0) {
                                      return {
                                        relativeTo: v,
                                        days: Math.max(r.days, overdueDays),
                                      };
                                    }
                                    return { ...r, relativeTo: v };
                                  })
                                );
                              }}
                            >
                              {allowBeforeDue ? (
                                <option value="before_due">before due date</option>
                              ) : null}
                              <option value="after_due">after due date</option>
                            </select>
                            <button
                              type="button"
                              className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
                              onClick={() => setInvoiceReminderTiming((prev) => prev.filter((_, i) => i !== idx))}
                              aria-label="Remove rule"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {rowErr ? (
                            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400" role="alert">
                              {rowErr}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
              </ul>
              {invoiceReminderAuto ? (
                <button
                  type="button"
                  onClick={() =>
                    setInvoiceReminderTiming((prev) => [
                      ...prev,
                      allowBeforeDue
                        ? { days: 1, relativeTo: 'before_due' as const }
                        : { days: Math.max(overdueDays, 1), relativeTo: 'after_due' as const },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  <Plus className="h-4 w-4" />
                  Add timing
                </button>
              ) : null}
            </div>
          )}

          <div>
            <label className={labelClass}>Schedule reminder (optional)</label>
            <input
              type="datetime-local"
              min={minScheduleLocal}
              className={scheduledError ? inputErrorClass : inputClass}
              value={scheduledReminderLocal}
              onChange={(e) => setScheduledReminderLocal(e.target.value)}
              aria-invalid={Boolean(scheduledError)}
              aria-describedby={scheduledError ? 'scheduled-reminder-error' : undefined}
            />
            {scheduledError ? (
              <div id="scheduled-reminder-error" className="mt-2 space-y-2">
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {scheduledError}
                </p>
                {scheduledError === SCHEDULED_IN_PAST_MESSAGE ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-200 dark:hover:bg-indigo-900"
                      onClick={() => setScheduledReminderLocal(suggestFutureDatetimeLocalFrom(new Date()))}
                    >
                      Set to 15 minutes from now
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                One-off payment reminder email at this time if still unpaid.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !formValid}
            onClick={() => void handleSave()}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-50"
            title={!formValid ? 'Fix validation errors to save' : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
