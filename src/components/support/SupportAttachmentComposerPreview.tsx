'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Tone = 'support' | 'admin';

export function SupportAttachmentComposerPreview({
  previewUrl,
  fileName,
  fileSizeBytes,
  onRemove,
  disabled,
  tone = 'support',
}: {
  previewUrl: string;
  fileName: string;
  fileSizeBytes: number;
  onRemove: () => void;
  disabled?: boolean;
  tone?: Tone;
}) {
  const kb = fileSizeBytes / 1024;
  const sizeLabel = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border p-1.5 pr-2 shadow-sm',
        tone === 'support' &&
          'border-[var(--card-border)] bg-[var(--card)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
        tone === 'admin' &&
          'border-zinc-200/90 bg-white ring-1 ring-zinc-950/[0.04] dark:border-zinc-700 dark:bg-zinc-950 dark:ring-white/[0.06]'
      )}
    >
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/[0.04] shadow-inner dark:bg-white/[0.06]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p
          className={cn(
            'truncate text-[11px] font-medium leading-tight',
            tone === 'support' && 'text-slate-700 dark:text-slate-200',
            tone === 'admin' && 'text-zinc-800 dark:text-zinc-200'
          )}
          title={fileName}
        >
          {fileName || 'Screenshot'}
        </p>
        <p
          className={cn(
            'mt-0.5 text-[10px] tabular-nums',
            tone === 'support' && 'text-slate-500 dark:text-slate-400',
            tone === 'admin' && 'text-zinc-500 dark:text-zinc-400'
          )}
        >
          {sizeLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
          'disabled:pointer-events-none disabled:opacity-40',
          'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
          tone === 'admin' &&
            'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'
        )}
        aria-label="Remove attachment"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
