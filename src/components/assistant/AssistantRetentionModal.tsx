'use client';

import type { MessageRetentionOption } from '@/lib/assistant/conversation-storage';
import { cn } from '@/lib/utils/cn';

const OPTIONS: { value: MessageRetentionOption; label: string; hint: string }[] = [
  { value: '24h', label: '24 hours', hint: 'Remove chat messages older than one day' },
  { value: '3d', label: '3 days', hint: '' },
  { value: '7d', label: '7 days', hint: '' },
  { value: '30d', label: '30 days', hint: '' },
  { value: 'off', label: 'Off', hint: 'Keep messages until you clear the conversation' },
];

type Props = {
  open: boolean;
  value: MessageRetentionOption;
  onChange: (v: MessageRetentionOption) => void;
  onClose: () => void;
};

export function AssistantRetentionModal({ open, value, onChange, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="retention-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-xl dark:border-slate-600 dark:bg-slate-800'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="retention-modal-title"
          className="text-base font-semibold text-[var(--foreground)]"
        >
          Auto-delete messages
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Applies only to this chat history on this device. Invoices, customers, and payments in Zenzex
          are not affected.
        </p>
        <fieldset className="mt-4 space-y-0">
          <legend className="sr-only">Retention period</legend>
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-[var(--background)]"
            >
              <input
                type="radio"
                name="retention"
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="mt-1 h-4 w-4 border-[var(--card-border)] text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--foreground)]">{opt.label}</span>
                {opt.hint ? (
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">{opt.hint}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
