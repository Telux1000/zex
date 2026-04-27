'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { INVOICE_TEMPLATE_IDS, type InvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';

const LABELS: Record<InvoiceTemplateId, { title: string; blurb: string }> = {
  classic: { title: 'Classic', blurb: 'Default layout' },
  modern: { title: 'Modern', blurb: 'Clean SaaS style' },
  minimal: { title: 'Minimal', blurb: 'Whitespace & light borders' },
  bold: { title: 'Bold', blurb: 'Strong hierarchy' },
  elegant: { title: 'Elegant', blurb: 'Refined & premium' },
};

function TemplateMiniPreview({ id, compact }: { id: InvoiceTemplateId; compact?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'w-full overflow-hidden rounded-md border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white dark:border-slate-600 dark:from-slate-800/60 dark:to-slate-900/40',
        compact ? 'h-8 p-1' : 'h-14 p-1.5',
        id === 'bold' && 'border-slate-400 dark:border-slate-500',
        id === 'minimal' && 'border-slate-200/60 bg-white dark:bg-slate-900/20',
        id === 'elegant' && 'border-stone-300/70 from-stone-50/80 dark:border-stone-600',
        id === 'modern' && 'from-slate-100/90',
        !compact && 'mt-2'
      )}
    >
      <div className="flex h-full flex-col justify-between">
        <div className={cn('rounded-sm bg-slate-300/80 dark:bg-slate-600', compact ? 'h-1 w-1/2' : 'h-1.5 w-1/2')} />
        <div className={cn('space-y-0.5', compact && 'space-y-px')}>
          <div className={cn('w-full bg-slate-200/80 dark:bg-slate-600/80', compact ? 'h-px' : 'h-0.5')} />
          <div className={cn('w-4/5 bg-slate-200/60 dark:bg-slate-600/60', compact ? 'h-px' : 'h-0.5')} />
        </div>
        <div
          className={cn('w-1/3 rounded-sm bg-slate-200/90 dark:bg-slate-500/80', compact ? 'h-0.5' : 'h-1')}
        />
      </div>
    </div>
  );
}

type Props = {
  value: InvoiceTemplateId;
  onChange: (next: InvoiceTemplateId) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Mobile: 2-column grid (no horizontal flex row) so min-content never exceeds the form width.
 * `md+`: 3 columns, `lg+`: 5 — same card layout as before; no min-width from five fixed 9rem cards in a row.
 */
export function InvoiceTemplatePicker({ value, onChange, disabled, className }: Props) {
  const baseId = useId();
  return (
    <div className={cn('min-w-0 max-w-full space-y-2', className)}>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Template</p>
      <div
        className="grid w-full min-w-0 max-w-full grid-cols-2 gap-2 md:grid-cols-3 md:gap-2 lg:grid-cols-5"
        role="radiogroup"
        aria-label="Invoice template"
      >
        {INVOICE_TEMPLATE_IDS.map((id) => {
          const selected = value === id;
          const inputId = `${baseId}-tpl-${id}`;
          return (
            <div key={id} className="min-w-0">
              <input
                id={inputId}
                type="radio"
                className="peer sr-only"
                name={`${baseId}-invoice-template`}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(id)}
                aria-describedby={selected ? `${inputId}-sel` : undefined}
              />
              <label
                htmlFor={inputId}
                className={cn(
                  'relative flex w-full min-w-0 max-w-full cursor-pointer flex-col rounded-xl border-2 p-2 transition-colors',
                  'min-h-[44px]',
                  'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-600',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 dark:ring-offset-slate-900',
                  'md:min-h-0 md:rounded-xl md:p-2.5',
                  selected && [
                    'border-indigo-600 shadow-sm',
                    'ring-2 ring-inset ring-indigo-500/30 dark:border-indigo-500',
                    'dark:ring-indigo-500/30',
                  ],
                  disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                {selected ? (
                  <span
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow dark:bg-indigo-500"
                    aria-hidden
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                ) : null}
                <span
                  className="pr-6 text-xs font-semibold leading-tight text-slate-900 dark:text-slate-100"
                  id={selected ? `${inputId}-name` : undefined}
                >
                  {LABELS[id].title}
                </span>
                <span
                  className="mt-0.5 hidden text-[10px] leading-tight text-slate-500 dark:text-slate-400 md:line-clamp-2"
                  title={LABELS[id].blurb}
                >
                  {LABELS[id].blurb}
                </span>
                <div className="md:hidden">
                  <TemplateMiniPreview id={id} compact />
                </div>
                <div className="mt-0 hidden md:block">
                  <TemplateMiniPreview id={id} />
                </div>
                {selected ? (
                  <span
                    id={`${inputId}-sel`}
                    className="mt-1.5 hidden text-[10px] font-medium text-indigo-600 dark:text-indigo-400 md:block"
                  >
                    Selected
                  </span>
                ) : null}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
