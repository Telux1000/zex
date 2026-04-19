'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type SupportChatMessageShape = {
  id: string;
  body: string;
  attachment_storage_path?: string | null;
  attachment_content_type?: string | null;
  attachment_original_name?: string | null;
};

type ApiVariant = 'support' | 'admin';

function attachmentUrlPath(ticketId: string, messageId: string, variant: ApiVariant): string {
  const base =
    variant === 'admin' ? '/api/admin/support/tickets' : '/api/support/tickets';
  return `${base}/${ticketId}/messages/${messageId}/attachment-url`;
}

function SupportImageZoomModal({
  open,
  src,
  fileName,
  onClose,
}: {
  open: boolean;
  src: string | null;
  fileName?: string | null;
  onClose: () => void;
}) {
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    if (!open) setImgBroken(false);
  }, [open, src]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined' || !src) return null;

  const caption =
    fileName && String(fileName).trim() ? String(fileName).trim() : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity"
        onClick={onClose}
        aria-label="Close preview"
      />
      <div className="relative z-10 flex w-full max-w-[min(100vw-1.5rem,1200px)] flex-col items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'fixed right-3 top-3 z-[210] flex h-10 w-10 items-center justify-center rounded-full sm:right-5 sm:top-5',
            'bg-zinc-950/90 text-white shadow-lg ring-1 ring-white/15',
            'transition hover:bg-zinc-900'
          )}
          aria-label="Close"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </button>

        <div
          className={cn(
            'w-full overflow-hidden rounded-2xl shadow-[0_24px_64px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/12',
            'bg-zinc-950/30'
          )}
        >
          {imgBroken ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <ImageOff className="h-8 w-8 text-white/45" strokeWidth={1.5} aria-hidden />
              <p className="text-sm text-white/65">This image could not be loaded.</p>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              alt={caption || 'Attachment'}
              className="mx-auto block max-h-[min(85dvh,880px)] w-auto max-w-full object-contain"
              onError={() => setImgBroken(true)}
            />
          )}
        </div>

        {caption && !imgBroken ? (
          <p className="max-w-full truncate px-2 text-center text-xs font-medium text-white/55">{caption}</p>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function SupportMessageImageBlock({
  ticketId,
  messageId,
  variant,
  localPreviewUrl,
  fileName,
  className,
}: {
  ticketId: string;
  messageId: string;
  variant: ApiVariant;
  localPreviewUrl?: string | null;
  fileName?: string | null;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(localPreviewUrl ?? null);
  const [loading, setLoading] = useState(!localPreviewUrl);
  const [error, setError] = useState<string | null>(null);
  const [thumbBroken, setThumbBroken] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (localPreviewUrl) {
      setSrc(localPreviewUrl);
      setLoading(false);
      setError(null);
      setThumbBroken(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setThumbBroken(false);
    void (async () => {
      const res = await fetch(attachmentUrlPath(ticketId, messageId, variant));
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (cancelled) return;
      if (!res.ok || typeof j.url !== 'string') {
        setError(typeof j.error === 'string' ? j.error : 'Could not load image');
        setLoading(false);
        return;
      }
      setSrc(j.url);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, messageId, variant, localPreviewUrl]);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const showImage = src && !error && !thumbBroken;

  return (
    <>
      <div className={cn('mt-1.5', className)}>
        {loading ? (
          <div
            className={cn(
              'flex max-w-[min(100%,280px)] items-center gap-2 rounded-xl border px-3 py-2.5 text-xs shadow-sm',
              variant === 'support' &&
                'border-[var(--card-border)] bg-[var(--background)]/80 text-slate-500 dark:text-slate-400',
              variant === 'admin' &&
                'border-zinc-200/90 bg-white/90 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400'
            )}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 opacity-70" aria-hidden />
            <span className="font-medium">Loading…</span>
          </div>
        ) : error ? (
          <div
            className={cn(
              'flex max-w-[min(100%,280px)] items-center gap-2 rounded-xl border px-3 py-2.5 text-xs shadow-sm',
              'border-red-200/90 bg-red-50/95 text-red-800 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-200'
            )}
          >
            <ImageOff className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            <span className="leading-snug">{error}</span>
          </div>
        ) : thumbBroken && src ? (
          <div
            className={cn(
              'flex max-w-[min(100%,280px)] items-center gap-2 rounded-xl border px-3 py-2.5 text-xs shadow-sm',
              variant === 'support' &&
                'border-[var(--card-border)] bg-[var(--background)] text-slate-600 dark:text-slate-300',
              variant === 'admin' &&
                'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300'
            )}
            role="status"
          >
            <ImageOff className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="leading-snug">Image failed to load.</span>
          </div>
        ) : showImage ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className={cn(
              'group block max-w-[min(100%,260px)] overflow-hidden rounded-xl text-left shadow-sm',
              'ring-1 ring-black/[0.06] transition',
              'hover:ring-black/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
              'dark:ring-white/[0.08] dark:hover:ring-white/[0.14]',
              variant === 'support' && 'bg-black/[0.03] dark:bg-white/[0.04]',
              variant === 'admin' && 'bg-zinc-100/90 dark:bg-zinc-950/50'
            )}
            aria-label="Enlarge screenshot"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="max-h-[168px] w-full object-contain transition duration-200 group-hover:opacity-[0.97]"
              onError={() => setThumbBroken(true)}
            />
          </button>
        ) : null}
      </div>

      <SupportImageZoomModal
        open={lightboxOpen && Boolean(src)}
        src={src}
        fileName={fileName}
        onClose={closeLightbox}
      />
    </>
  );
}

export function SupportMessageContent({
  message,
  ticketId,
  variant,
  localPreviewUrl,
  localFileName,
  textClassName,
}: {
  message: SupportChatMessageShape;
  ticketId: string;
  variant: ApiVariant;
  localPreviewUrl?: string | null;
  /** Optimistic / composer preview file name */
  localFileName?: string | null;
  textClassName?: string;
}) {
  const path = message.attachment_storage_path ? String(message.attachment_storage_path).trim() : '';
  const hasAttachment = Boolean(localPreviewUrl || path);
  const text = message.body ?? '';
  const showText = text.trim().length > 0;
  const displayName =
    localFileName?.trim() ||
    (message.attachment_original_name ? String(message.attachment_original_name).trim() : null);

  return (
    <div className="space-y-2">
      {hasAttachment ? (
        <SupportMessageImageBlock
          ticketId={ticketId}
          messageId={message.id}
          variant={variant}
          localPreviewUrl={localPreviewUrl}
          fileName={displayName}
        />
      ) : null}
      {showText ? (
        <p className={cn('whitespace-pre-wrap leading-relaxed', textClassName)}>{text}</p>
      ) : null}
    </div>
  );
}
