'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { labelSupportTicketStatus } from '@/lib/support/ticket-status';
import { validateSupportImageFile } from '@/lib/support/support-attachment-validation';
import { SupportMessageContent } from '@/components/support/SupportMessageContent';
import { SupportAttachmentComposerPreview } from '@/components/support/SupportAttachmentComposerPreview';
import { formatSupportTicketRef } from '@/lib/support/ticket-number';

export type ConversationMessage = {
  id: string;
  author_user_id: string;
  body: string;
  is_staff: boolean;
  created_at: string;
  attachment_storage_path?: string | null;
  attachment_content_type?: string | null;
  attachment_original_name?: string | null;
  attachment_size_bytes?: number | null;
  /** transient client-only preview for optimistic rows */
  _localPreviewUrl?: string | null;
  _localFileName?: string | null;
};

export type ConversationTicket = {
  id: string;
  subject: string;
  status: string;
  ticket_number: number | null;
  created_at: string;
  updated_at: string;
};

export type SupportSendPayload = { body: string; file: File | null };

export function SupportConversationPanel({
  ticket,
  messages,
  currentUserId,
  readOnly,
  onSend,
  onRefreshList,
  hideTicketHeader = false,
}: {
  ticket: ConversationTicket | null;
  messages: ConversationMessage[];
  currentUserId: string;
  readOnly: boolean;
  onSend: (payload: SupportSendPayload) => Promise<{
    ok: boolean;
    message?: ConversationMessage;
    error?: string;
  }>;
  onRefreshList?: () => void;
  /** When true, omit the ticket subject/status header (e.g. mobile stacked nav shows title). */
  hideTicketHeader?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRevokeRef = useRef<string | null>(null);
  const [rows, setRows] = useState(messages);
  const [draft, setDraft] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  useEffect(() => {
    setRows(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rows, ticket?.id]);

  useEffect(() => {
    return () => {
      if (previewRevokeRef.current) {
        URL.revokeObjectURL(previewRevokeRef.current);
        previewRevokeRef.current = null;
      }
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  function revokePreviewRef() {
    if (previewRevokeRef.current) {
      URL.revokeObjectURL(previewRevokeRef.current);
      previewRevokeRef.current = null;
    }
  }

  function clearPendingAttachment() {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl(null);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function onPickFile(f: File | null) {
    setComposerError(null);
    if (!f) return;
    const v = validateSupportImageFile(f);
    if (!v.ok) {
      setComposerError(v.error);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    const url = URL.createObjectURL(f);
    setPendingPreviewUrl(url);
    setPendingFile(f);
  }

  function labelFor(m: ConversationMessage): string {
    if (m.is_staff) return 'Support';
    if (m.author_user_id === currentUserId) return 'You';
    return 'Teammate';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket || readOnly || sending) return;
    const text = draft.trim();
    if (!text && !pendingFile) return;

    if (pendingFile) {
      const v = validateSupportImageFile(pendingFile);
      if (!v.ok) {
        setComposerError(v.error);
        return;
      }
    }

    const optimisticId = `opt-${crypto.randomUUID()}`;
    const localPreview = pendingFile ? URL.createObjectURL(pendingFile) : null;
    revokePreviewRef();
    previewRevokeRef.current = localPreview;

    const optimistic: ConversationMessage = {
      id: optimisticId,
      author_user_id: currentUserId,
      body: text,
      is_staff: false,
      created_at: new Date().toISOString(),
      attachment_storage_path: null,
      _localPreviewUrl: localPreview,
      _localFileName: pendingFile?.name ?? undefined,
    };

    const fileToSend = pendingFile;
    setRows((prev) => [...prev, optimistic]);
    setDraft('');
    clearPendingAttachment();
    setSending(true);
    setComposerError(null);

    try {
      const result = await onSend({ body: text, file: fileToSend });
      if (!result.ok) {
        revokePreviewRef();
        setRows((prev) => prev.filter((r) => r.id !== optimisticId));
        setDraft(text);
        if (fileToSend) {
          const url = URL.createObjectURL(fileToSend);
          setPendingPreviewUrl(url);
          setPendingFile(fileToSend);
        }
        if (result.error) setComposerError(result.error);
        return;
      }
      revokePreviewRef();
      if (result.message) {
        setRows((prev) =>
          prev.map((r) => (r.id === optimisticId ? { ...result.message! } : r))
        );
      }
      onRefreshList?.();
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(draft.trim() || pendingFile) && !sending;

  if (!ticket) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[var(--card)] px-6 py-12 text-center">
        <p className="max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Select a conversation from the list, or start a new ticket to reach our team.
        </p>
      </div>
    );
  }

  const closed = String(ticket.status).toLowerCase() === 'closed';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--card)]">
      {!hideTicketHeader ? (
        <header className="shrink-0 border-b border-[var(--card-border)] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                {ticket.subject}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {ticket.ticket_number != null ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <span>(#{formatSupportTicketRef(ticket.ticket_number)})</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(formatSupportTicketRef(ticket.ticket_number!));
                      }}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-200/80 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      aria-label="Copy ticket number"
                      title="Copy ticket number"
                    >
                      <Copy className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </span>
                ) : null}
                <span>
                  Started{' '}
                  {new Date(ticket.created_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>
            <span
              className={cn(
                'inline-flex w-fit shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold',
                ticket.status === 'open' && 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-200',
                ticket.status === 'pending' && 'bg-amber-500/15 text-amber-900 dark:text-amber-200',
                ticket.status === 'resolved' && 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200',
                ticket.status === 'closed' && 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
              )}
            >
              {labelSupportTicketStatus(ticket.status)}
            </span>
          </div>
        </header>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {rows.map((m) => {
            const fromSupport = m.is_staff;
            const localPreview = m._localPreviewUrl ?? null;
            const hasStoredAttachment = Boolean(m.attachment_storage_path?.trim());
            const showAttachment = Boolean(localPreview || hasStoredAttachment);
            return (
              <div
                key={m.id}
                className={cn('flex w-full', fromSupport ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'max-w-[min(100%,520px)] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                    fromSupport
                      ? 'rounded-tl-md border border-indigo-200/80 bg-indigo-50/95 text-slate-800 dark:border-indigo-500/25 dark:bg-indigo-950/40 dark:text-indigo-50'
                      : 'rounded-tr-md border border-slate-200/90 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100'
                  )}
                >
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <span className={fromSupport ? 'text-indigo-700 dark:text-indigo-300' : ''}>
                      {labelFor(m)}
                    </span>
                    <time dateTime={m.created_at} className="tabular-nums opacity-80">
                      {new Date(m.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  {showAttachment || (m.body ?? '').trim() ? (
                    <SupportMessageContent
                      message={m}
                      ticketId={ticket.id}
                      variant="support"
                      localPreviewUrl={localPreview}
                      localFileName={m._localFileName ?? null}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {closed || readOnly ? (
        <div className="shrink-0 border-t border-[var(--card-border)] bg-[var(--background)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-slate-500 dark:text-slate-400 sm:px-5">
          This ticket is closed. Start a new ticket if you need anything else.
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="shrink-0 border-t border-[var(--card-border)] bg-[var(--background)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-4"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {pendingFile && pendingPreviewUrl ? (
              <SupportAttachmentComposerPreview
                previewUrl={pendingPreviewUrl}
                fileName={pendingFile.name}
                fileSizeBytes={pendingFile.size}
                onRemove={() => {
                  clearPendingAttachment();
                  setComposerError(null);
                }}
                disabled={sending}
                tone="support"
              />
            ) : null}
            {composerError ? (
              <p className="text-xs text-red-600 dark:text-red-400">{composerError}</p>
            ) : null}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                className="sr-only"
                aria-label="Attach image"
                disabled={sending}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  onPickFile(f);
                }}
              />
              <button
                type="button"
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-lg leading-none text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Attach screenshot (PNG or JPEG)"
                title="Attach screenshot (PNG or JPEG, max 5MB)"
              >
                📎
              </button>
              <input
                type="text"
                className="min-h-[44px] flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 dark:text-white"
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={8000}
                disabled={sending}
                aria-label="Message"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex min-h-[44px] min-w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Sending" /> : 'Send'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
