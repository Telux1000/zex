'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export type AttachmentPreviewVariant = 'image' | 'pdf';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  src: string | null;
  variant: AttachmentPreviewVariant;
  loading?: boolean;
};

export default function ExpenseAttachmentPreviewModal({
  open,
  onClose,
  title,
  src,
  variant,
  loading = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button type="button" aria-label="Close preview" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attachment-preview-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 id="attachment-preview-title" className="truncate pr-4 text-sm font-semibold text-slate-900 dark:text-white">
            {title}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            {src ? (
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Open in new tab
              </a>
            ) : null}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="min-h-[240px] flex-1 overflow-auto bg-slate-50 p-4 dark:bg-slate-950/50">
          {loading || !src ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Preparing preview…
            </div>
          ) : variant === 'image' ? (
            <div className="flex justify-center">
              <img src={src} alt={title} className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-sm" />
            </div>
          ) : (
            <iframe
              title={title}
              src={src}
              className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            />
          )}
        </div>
      </div>
    </div>
  );
}
