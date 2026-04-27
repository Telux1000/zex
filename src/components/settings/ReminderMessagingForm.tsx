'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Business } from '@/lib/database.types';
import {
  createDefaultReminderMessagingSettings,
  DEFAULT_COPY,
  parseReminderMessaging,
  type ReminderMessagePreset,
  type ReminderMessagingSettingsV1,
  type ReminderPresetRow,
  type ReminderTone,
  REMINDER_MESSAGE_PRESETS,
  REMINDER_TONES,
} from '@/lib/invoices/reminder-messaging';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const monoClass = `${inputClass} font-mono text-sm disabled:opacity-60`;

const PRESET_LABEL: Record<ReminderMessagePreset, string> = {
  before_due: 'Before due date',
  due_today: 'Due today',
  overdue: 'Overdue',
  final_reminder: 'Final reminder',
};

const PLACEHOLDERS_LIST =
  '{{customer_name}} · {{business_name}} · {{invoice_number}} · {{amount_due}} · {{due_date}} · {{payment_link}} · {{support_email}}';

type Props = {
  business: Business;
  onSuccess: () => void;
  onClearSuccess: () => void;
};

/** “Reset to default” while staying in customize mode: professional copy, tone professional. */
function professionalCustomizeRow(preset: ReminderMessagePreset): ReminderPresetRow {
  const d = DEFAULT_COPY['professional'][preset];
  return {
    enabled: true,
    tone: 'professional',
    subject_template: d.subject,
    message_template: d.message,
  };
}

function clientValidate(m: ReminderMessagingSettingsV1): string | null {
  for (const key of REMINDER_MESSAGE_PRESETS) {
    const row = m.presets[key];
    if (!row.enabled) continue;
    if (!String(row.subject_template ?? '').trim()) {
      return `Add a subject for “${PRESET_LABEL[key]}” or select “Use default message”.`;
    }
    if (!String(row.message_template ?? '').trim()) {
      return `Add a message for “${PRESET_LABEL[key]}” or select “Use default message”.`;
    }
  }
  return null;
}

export function ReminderMessagingForm({ business, onSuccess, onClearSuccess }: Props) {
  const initial = useMemo(
    () => parseReminderMessaging(business.reminder_messaging ?? null),
    [business.reminder_messaging]
  );
  const [messaging, setMessaging] = useState<ReminderMessagingSettingsV1>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setMessaging(parseReminderMessaging(business.reminder_messaging ?? null));
  }, [business.reminder_messaging]);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPreset, setPreviewPreset] = useState<ReminderMessagePreset | null>(null);
  const [previewBody, setPreviewBody] = useState<{ subject: string; text: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [openInfoPreset, setOpenInfoPreset] = useState<ReminderMessagePreset | null>(null);

  const onSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      onClearSuccess();
      setError(null);
      const c = clientValidate(messaging);
      if (c) {
        setError(c);
        return;
      }
      setSaving(true);
      const res = await fetch(`/api/businesses/${business.id}/reminder-messaging`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
        setError(j.error ?? 'Save failed');
        setSaving(false);
        return;
      }
      onSuccess();
      setSaving(false);
    },
    [business.id, messaging, onSuccess, onClearSuccess]
  );

  async function openPreview(p: ReminderMessagePreset) {
    setPreviewOpen(true);
    setPreviewPreset(p);
    setPreviewBody(null);
    setLoadingPreview(true);
    setError(null);
    const c = clientValidate(messaging);
    if (c) {
      setError(c);
      setLoadingPreview(false);
      return;
    }
    const res = await fetch(`/api/businesses/${business.id}/reminder-messaging/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: p, messaging }),
    });
    if (!res.ok) {
      setError('Could not build preview.');
      setLoadingPreview(false);
      return;
    }
    const j = (await res.json()) as { subject: string; message_plain: string };
    setPreviewBody({ subject: j.subject, text: j.message_plain });
    setLoadingPreview(false);
  }

  return (
    <form
      onSubmit={onSave}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Reminder emails</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set what customers read when an automated payment reminder goes out. The email design still comes
          from your template; you control the wording here.
        </p>
        {error && (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
        )}
      </div>

      {REMINDER_MESSAGE_PRESETS.map((key) => {
        const row = messaging.presets[key];
        const useDefault = !row.enabled;
        return (
          <div
            key={key}
            className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <h3 className="text-base font-medium text-slate-900 dark:text-slate-100">
                {PRESET_LABEL[key]}
              </h3>
              <div className="flex flex-shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openPreview(key)}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  Preview email
                </button>
                {row.enabled && (
                  <button
                    type="button"
                    onClick={() =>
                      setMessaging((m) => ({
                        ...m,
                        presets: {
                          ...m.presets,
                          [key]: professionalCustomizeRow(key),
                        },
                      }))
                    }
                    className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Reset to default
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-between">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Message copy</p>
              <div
                className="relative flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 p-1 dark:border-slate-600"
                role="radiogroup"
                aria-label={`Message copy for ${PRESET_LABEL[key]}`}
              >
                <span id={`reminder-copy-help-${key}`} className="sr-only">
                  Default: Zenzex sends a professional message automatically. Customize: You can edit the
                  subject and message for this reminder.
                </span>
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-3 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    className="h-4 w-4 text-indigo-600"
                    checked={useDefault}
                    aria-label="Use default reminder message"
                    aria-describedby={`reminder-copy-help-${key}`}
                    onChange={() =>
                      setMessaging((m) => ({
                        ...m,
                        presets: {
                          ...m.presets,
                          [key]: { ...m.presets[key], enabled: false },
                        },
                      }))
                    }
                  />
                  <span>Default</span>
                </label>
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-3 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    className="h-4 w-4 text-indigo-600"
                    checked={!useDefault}
                    aria-label="Customize reminder message"
                    aria-describedby={`reminder-copy-help-${key}`}
                    onChange={() =>
                      setMessaging((m) => ({
                        ...m,
                        presets: {
                          ...m.presets,
                          [key]: { ...m.presets[key], enabled: true },
                        },
                      }))
                    }
                  />
                  <span>Customize</span>
                </label>
                <button
                  type="button"
                  aria-label="Message copy help"
                  aria-describedby={`reminder-copy-help-${key}`}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white"
                  onClick={() => setOpenInfoPreset((curr) => (curr === key ? null : key))}
                >
                  ⓘ
                </button>
                {openInfoPreset === key && (
                  <div
                    role="tooltip"
                    className="absolute right-0 top-[calc(100%+8px)] z-20 w-[min(90vw,20rem)] rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <p>
                      Default: Zenzex sends a professional message automatically. Customize: You can edit
                      the subject and message for this reminder.
                    </p>
                    <button
                      type="button"
                      className="mt-2 inline-flex min-h-9 items-center rounded-md border border-slate-200 px-2 text-xs text-slate-700 dark:border-slate-500 dark:text-slate-100"
                      onClick={() => setOpenInfoPreset(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
              <div>
                <label className={labelClass} htmlFor={`reminder-tone-${key}`}>
                  Tone
                </label>
                <select
                  id={`reminder-tone-${key}`}
                  className={inputClass}
                  value={row.tone}
                  onChange={(e) => {
                    const t = e.target.value as ReminderTone;
                    setMessaging((m) => ({
                      ...m,
                      presets: {
                        ...m.presets,
                        [key]: (() => {
                          const next = { ...m.presets[key], tone: t };
                          if (!m.presets[key].enabled) {
                            const d = DEFAULT_COPY[t][key];
                            return {
                              ...next,
                              subject_template: d.subject,
                              message_template: d.message,
                            };
                          }
                          return next;
                        })(),
                      },
                    }));
                  }}
                >
                  {REMINDER_TONES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {row.enabled && (
              <>
                <p className="mb-0 mt-4 text-xs text-slate-500 dark:text-slate-500">
                  Available placeholders: {PLACEHOLDERS_LIST}
                </p>
                <div className="mt-3">
                  <label className={labelClass} htmlFor={`reminder-subj-${key}`}>
                    Subject
                  </label>
                  <input
                    id={`reminder-subj-${key}`}
                    className={inputClass}
                    value={row.subject_template}
                    onChange={(e) =>
                      setMessaging((m) => ({
                        ...m,
                        presets: {
                          ...m.presets,
                          [key]: { ...m.presets[key], subject_template: e.target.value },
                        },
                      }))
                    }
                    autoComplete="off"
                  />
                </div>
                <div className="mt-3">
                  <label className={labelClass} htmlFor={`reminder-msg-${key}`}>
                    Message
                  </label>
                  <textarea
                    id={`reminder-msg-${key}`}
                    className={monoClass}
                    rows={7}
                    value={row.message_template}
                    onChange={(e) =>
                      setMessaging((m) => ({
                        ...m,
                        presets: {
                          ...m.presets,
                          [key]: { ...m.presets[key], message_template: e.target.value },
                        },
                      }))
                    }
                    spellCheck
                  />
                </div>
              </>
            )}

          </div>
        );
      })}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                !window.confirm(
                  'Restore the standard reminder text for all reminder types? Your current draft will be replaced.'
                )
              ) {
                return;
              }
              setMessaging(createDefaultReminderMessagingSettings());
              onClearSuccess();
            }}
            className="text-sm text-slate-600 underline-offset-2 hover:underline dark:text-slate-400"
          >
            Restore all default messages
          </button>
        </div>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setPreviewOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setPreviewOpen(false)}
          role="dialog"
          aria-modal
          tabIndex={-1}
        >
          <div
            className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-y-auto rounded-t-xl border border-slate-200 bg-white p-4 shadow-lg sm:rounded-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Preview email{previewPreset ? ` — ${PRESET_LABEL[previewPreset]}` : ''}
              </h3>
              <button
                type="button"
                className="min-h-9 min-w-9 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Example customer and amounts are shown so you can see how placeholders look when sent.
            </p>
            {loadingPreview && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
            {previewBody && !loadingPreview && (
              <div className="mt-3 text-sm text-slate-800 dark:text-slate-200">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Subject</p>
                <p className="mt-1 break-words text-slate-700 dark:text-slate-300">{previewBody.subject}</p>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Message</p>
                <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">
                  {previewBody.text}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
