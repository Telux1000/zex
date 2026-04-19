'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/** Desktop / large-viewport modal. On mobile, use {@link NewSupportTicketScreen} at `/dashboard/support/new`. */
export function NewSupportTicketModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setSubject('');
      setMessage('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const s = subject.trim();
    const m = message.trim();
    if (!s || !m) return;
    setLoading(true);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: s, details: m }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ticket_id?: string };
      if (!res.ok || !j.ticket_id) {
        window.alert(typeof j.error === 'string' ? j.error : 'Could not create ticket.');
        return;
      }
      onCreated(j.ticket_id);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-new-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={cn(
          'relative z-[101] flex max-h-[min(92dvh,640px)] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl sm:rounded-2xl'
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4">
          <h2 id="support-new-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            New ticket
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div>
            <label htmlFor="modal-support-subject" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Subject
            </label>
            <input
              id="modal-support-subject"
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={200}
              placeholder="What do you need help with?"
            />
          </div>
          <div className="min-h-0 flex-1">
            <label htmlFor="modal-support-message" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Message
            </label>
            <textarea
              id="modal-support-message"
              className="mt-1.5 min-h-[160px] w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-white"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={8000}
              placeholder="Describe the issue. Include any error messages or steps to reproduce."
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--card-border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
