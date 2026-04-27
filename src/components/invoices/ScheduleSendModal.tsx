'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatLocalDatetimeInput,
  suggestFutureDatetimeLocalFrom,
  validateScheduledDatetimeLocal,
} from '@/lib/invoices/auto-reminders-modal-validation';
import {
  formatScheduledSendConfirmationMessage,
  normalizeBusinessTimezone,
  SCHEDULE_PAST_ERROR,
  SCHEDULE_PAST_ERROR_SECONDARY,
} from '@/lib/invoices/scheduled-send-time';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { cn } from '@/lib/utils/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  /** ISO UTC when editing existing schedule */
  initialScheduledAtIso: string | null;
  /** Used for confirmation toast formatting (same as business display elsewhere). */
  accountTimezone: string;
  onSaved?: () => void;
};

const EMPTY_DATETIME_MESSAGE = 'Please select a date and time.';

/** Same as Auto Reminders: ISO → `datetime-local` string in the browser timezone. */
function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatLocalDatetimeInput(d);
}

type ScheduleValidation = {
  canSave: boolean;
  highlightInputs: boolean;
  primaryMessage: string | null;
  secondaryMessage: string | null;
};

function computeScheduleValidation(
  scheduledLocal: string,
  now: Date,
  pastMessage: string
): ScheduleValidation {
  if (!String(scheduledLocal ?? '').trim()) {
    return {
      canSave: false,
      highlightInputs: false,
      primaryMessage: null,
      secondaryMessage: null,
    };
  }
  const r = validateScheduledDatetimeLocal(scheduledLocal, now, pastMessage);
  if (!r.ok) {
    const isPast = r.error === pastMessage;
    return {
      canSave: false,
      highlightInputs: true,
      primaryMessage: r.error,
      secondaryMessage: isPast ? SCHEDULE_PAST_ERROR_SECONDARY : null,
    };
  }
  return {
    canSave: true,
    highlightInputs: false,
    primaryMessage: null,
    secondaryMessage: null,
  };
}

export function ScheduleSendModal({
  open,
  onClose,
  invoiceId,
  initialScheduledAtIso,
  accountTimezone,
  onSaved,
}: Props) {
  const { showSuccessToast, showErrorToast } = useToasts();
  const [saving, setSaving] = useState(false);
  const tz = useMemo(() => normalizeBusinessTimezone(accountTimezone), [accountTimezone]);
  /** Same control as Auto Reminder “Schedule reminder (optional)” — `datetime-local`. */
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setApiError(null);
    if (initialScheduledAtIso) {
      const v = isoToDatetimeLocalValue(String(initialScheduledAtIso));
      setScheduledLocal(v || suggestFutureDatetimeLocalFrom(new Date()));
    } else {
      setScheduledLocal(suggestFutureDatetimeLocalFrom(new Date()));
    }
  }, [open, initialScheduledAtIso]);

  const validation = useMemo(
    () => computeScheduleValidation(scheduledLocal, now, SCHEDULE_PAST_ERROR),
    [scheduledLocal, now]
  );

  const minScheduleLocal = formatLocalDatetimeInput(now);

  const inputClassName = (invalid: boolean) =>
    cn(
      'app-date-field mt-1 block h-10 w-full',
      invalid
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30 dark:border-red-500 dark:focus:border-red-500'
        : undefined
    );

  const handleSave = async () => {
    if (!String(scheduledLocal).trim()) {
      setApiError(EMPTY_DATETIME_MESSAGE);
      return;
    }
    const t = new Date(scheduledLocal);
    if (Number.isNaN(t.getTime())) {
      setApiError('Invalid date and time.');
      return;
    }
    const check = validateScheduledDatetimeLocal(scheduledLocal, new Date(), SCHEDULE_PAST_ERROR);
    if (!check.ok) {
      setApiError(check.error);
      return;
    }
    const iso = t.toISOString();
    setSaving(true);
    setApiError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_send_at: iso,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiError((data as { error?: string }).error ?? 'Could not save schedule. Try again.');
        return;
      }
      showSuccessToast(formatScheduledSendConfirmationMessage(iso, tz));
      onSaved?.();
      onClose();
    } catch {
      showErrorToast('Could not save schedule. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearSchedule = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_send_at: null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to cancel');
      showSuccessToast('Scheduled send cancelled');
      onSaved?.();
      onClose();
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : 'Could not cancel');
    } finally {
      setSaving(false);
    }
  };

  const primaryInline = validation.primaryMessage ?? apiError;
  const showSecondaryNearSave = Boolean(validation.secondaryMessage) && !apiError;
  const highlightInputs =
    validation.highlightInputs || (apiError != null && apiError === SCHEDULE_PAST_ERROR);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => !saving && onClose()} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Schedule send</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Choose when to email this invoice to the customer. The invoice stays a draft until then.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="schedule-send-datetime" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Date and time
            </label>
            <input
              id="schedule-send-datetime"
              type="datetime-local"
              min={minScheduleLocal}
              className={inputClassName(highlightInputs)}
              value={scheduledLocal}
              onChange={(e) => {
                setScheduledLocal(e.target.value);
                setApiError(null);
              }}
              aria-invalid={highlightInputs}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Same date/time control as Auto Reminder — uses your device timezone.
            </p>
            {primaryInline ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {primaryInline}
                </p>
                {primaryInline === SCHEDULE_PAST_ERROR ? (
                  <button
                    type="button"
                    className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-200 dark:hover:bg-indigo-900"
                    onClick={() => setScheduledLocal(suggestFutureDatetimeLocalFrom(new Date()))}
                  >
                    Set to 15 minutes from now
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          {initialScheduledAtIso ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleClearSchedule()}
              className="text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400"
            >
              Cancel schedule
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-col items-end gap-2">
            {showSecondaryNearSave ? (
              <p className="max-w-[14rem] text-right text-xs text-slate-600 dark:text-slate-400">
                {validation.secondaryMessage}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Close
              </button>
              <button
                type="button"
                disabled={saving || !validation.canSave}
                onClick={() => void handleSave()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save schedule'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
