'use client';

import type { AssistantLaunchContext } from '@/lib/assistant/assistant-launch-context';
import type { AssistantQuickReply } from '@/lib/invoices/conversational-invoice-wizard/types';

/** Shown only when launching from Create Invoice AI Assisted — no instructional copy, chips only. */
const INVOICE_ENTRY_CHIPS: AssistantQuickReply[] = [
  { label: 'Create invoice', message: 'I want to create an invoice.' },
  { label: 'Add customer', message: 'Help me choose a customer for this invoice.' },
  { label: 'Upload screenshot', message: 'I have a screenshot to turn into an invoice.' },
];

/** Shown only when launching with create-customer context — minimal shortcuts. */
const CUSTOMER_ENTRY_CHIPS: AssistantQuickReply[] = [
  { label: 'Add customer', message: 'I need to add a new customer.' },
  { label: 'Company name', message: 'New customer — company name is ' },
];

/**
 * Optional lightweight chips below the first greeting (never a second assistant message).
 * General Assistant: not rendered. Invoice/customer entry: compact actions only.
 */
export function AssistantOpeningContextPanels({
  launchContext,
  show,
  disabled,
  onChip,
}: {
  launchContext: AssistantLaunchContext;
  show: boolean;
  disabled: boolean;
  onChip: (message: string) => void;
}) {
  if (!show) return null;

  const chips: AssistantQuickReply[] | null =
    launchContext === 'create_invoice'
      ? INVOICE_ENTRY_CHIPS
      : launchContext === 'create_customer'
        ? CUSTOMER_ENTRY_CHIPS
        : null;

  if (!chips?.length) return null;

  return (
    <div
      className="flex w-full justify-start pt-0.5"
      role="group"
      aria-label="Suggested actions"
    >
      <div className="flex max-w-[85%] flex-wrap gap-1.5">
        {chips.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={disabled}
            onClick={() => onChip(q.message.trim())}
            className="rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-slate-600/80 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
