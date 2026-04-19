'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { SupportAttachmentComposerPreview } from '@/components/support/SupportAttachmentComposerPreview';
import { validateSupportImageFile } from '@/lib/support/support-attachment-validation';

/**
 * Full-screen new ticket form for mobile (and usable anywhere).
 * Desktop continues to use {@link NewSupportTicketModal} by default.
 */
export function NewSupportTicketScreen() {
  const router = useRouter();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRevokeRef = useRef<string | null>(null);

  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => descriptionRef.current?.focus(), 100);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    return () => {
      if (previewRevokeRef.current) {
        URL.revokeObjectURL(previewRevokeRef.current);
        previewRevokeRef.current = null;
      }
    };
  }, []);

  function clearAttachment() {
    if (previewRevokeRef.current) {
      URL.revokeObjectURL(previewRevokeRef.current);
      previewRevokeRef.current = null;
    }
    setPreviewUrl(null);
    setPendingFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function onPickFile(f: File | null) {
    setFileError(null);
    if (!f) return;
    const v = validateSupportImageFile(f);
    if (!v.ok) {
      setFileError(v.error);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (previewRevokeRef.current) URL.revokeObjectURL(previewRevokeRef.current);
    const url = URL.createObjectURL(f);
    previewRevokeRef.current = url;
    setPreviewUrl(url);
    setPendingFile(f);
  }

  const canSubmit =
    Boolean(subject.trim()) && Boolean(details.trim()) && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setFileError(null);
    try {
      const fd = new FormData();
      fd.set('subject', subject.trim());
      fd.set('details', details.trim());
      if (pendingFile) fd.set('file', pendingFile);

      const res = await fetch('/api/support/tickets', { method: 'POST', body: fd });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        ticket_id?: string;
      };
      if (!res.ok || !j.ticket_id) {
        window.alert(typeof j.error === 'string' ? j.error : 'Could not create ticket.');
        return;
      }
      router.replace(`/dashboard/support/${j.ticket_id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] min-h-0 flex-col bg-[var(--background)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--card-border)] bg-[var(--card)] px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.push('/dashboard/support')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-400"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          Back
        </button>
        <h1 className="min-w-0 flex-1 pr-14 text-center text-base font-semibold text-slate-900 dark:text-white">
          New Ticket
        </h1>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div>
            <label htmlFor="new-ticket-subject" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Subject
            </label>
            <input
              id="new-ticket-subject"
              className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="What do you need help with?"
              autoComplete="off"
            />
          </div>

          <div className="flex min-h-[12rem] flex-col">
            <label htmlFor="new-ticket-description" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Description
            </label>
            <textarea
              ref={descriptionRef}
              id="new-ticket-description"
              className="mt-1.5 min-h-[12rem] flex-1 w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={8000}
              placeholder="Describe the issue. Include any error messages or steps to reproduce."
              autoComplete="off"
            />
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              className="sr-only"
              aria-label="Attach screenshot"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            {!previewUrl ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <Paperclip className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                Attach screenshot
              </button>
            ) : (
              <div className="space-y-2">
                <SupportAttachmentComposerPreview
                  previewUrl={previewUrl}
                  fileName={pendingFile?.name ?? 'screenshot'}
                  fileSizeBytes={pendingFile?.size ?? 0}
                  onRemove={clearAttachment}
                  disabled={loading}
                  tone="support"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Replace image
                </button>
              </div>
            )}
            {fileError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fileError}</p> : null}
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">PNG or JPEG, up to 5MB.</p>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--card-border)] bg-[var(--card)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create ticket'}
          </button>
        </div>
      </form>
    </div>
  );
}
