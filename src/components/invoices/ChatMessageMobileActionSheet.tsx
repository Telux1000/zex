'use client';

import { useCallback, useEffect, useRef, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { hapticLight } from '@/lib/ui/haptics';
import { cn } from '@/lib/utils/cn';

export type ChatMessageMobileActionSheetProps = {
  open: boolean;
  /** Plain-text preview (truncated by parent if needed). */
  previewPlainText: string;
  role: 'user' | 'assistant';
  /** When false, Edit is hidden (assistant or locked chat). */
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
};

/**
 * Full-width bottom action sheet for long-press message actions on small viewports.
 * Desktop uses hover actions on the message row (lg+). This sheet is `lg:hidden` so it matches
 * `useIsLgDown` (max-width 1023px), not `sm` — avoids a dead zone where hover actions don’t work on touch.
 */
export function ChatMessageMobileActionSheet({
  open,
  previewPlainText,
  role,
  canEdit,
  onClose,
  onEdit,
  onCopy,
}: ChatMessageMobileActionSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragPanelStart = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hapticLight();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLButtonElement>('button[data-action="primary"]')?.focus();
    }, 220);
    return () => window.clearTimeout(t);
  }, [open, canEdit, role]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    dragStartY.current = e.touches[0]?.clientY ?? null;
    dragPanelStart.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (dragStartY.current == null) return;
    const y = e.touches[0]?.clientY;
    if (y == null) return;
    const dy = y - dragStartY.current;
    if (dy > 0) {
      dragPanelStart.current = dy;
      const el = panelRef.current;
      if (el) el.style.transform = `translateY(${Math.min(dy, 120)}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const el = panelRef.current;
    if (el) el.style.transform = '';
    if (dragPanelStart.current > 72) {
      hapticLight();
      onClose();
    }
    dragStartY.current = null;
    dragPanelStart.current = 0;
  }, [onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const preview =
    previewPlainText.trim().length > 0
      ? previewPlainText.trim().length > 160
        ? `${previewPlainText.trim().slice(0, 160)}…`
        : previewPlainText.trim()
      : role === 'assistant'
        ? 'Assistant message'
        : 'Your message';

  return createPortal(
    <div
      className="fixed inset-0 z-[90] lg:hidden"
      data-mobile-msg-sheet
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-msg-sheet-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 bg-slate-950/40 opacity-0 backdrop-blur-[2px] animate-message-backdrop-in"
        aria-label="Dismiss"
        onClick={() => {
          hapticLight();
          onClose();
        }}
      />
      <div
        ref={panelRef}
        className="absolute bottom-0 left-0 right-0 z-10 flex justify-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className={cn(
            'animate-message-sheet-in flex w-full max-h-[min(85dvh,520px)] flex-col',
            'rounded-t-[1.25rem] border border-b-0 border-[var(--card-border)] bg-[var(--card)]',
            'shadow-[0_-8px_32px_rgba(15,23,42,0.12)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.45)]',
            'pb-[max(1rem,env(safe-area-inset-bottom))] pt-1'
          )}
        >
          <div className="flex flex-col items-center pt-2 pb-3" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-slate-300/90 dark:bg-slate-600" />
          </div>

          <div className="border-b border-[var(--card-border)] px-5 pb-4 pt-0">
            <p
              id="chat-msg-sheet-title"
              className="text-center text-[13px] font-semibold text-[var(--foreground)]"
            >
              Message
            </p>
            <p className="mt-2 line-clamp-3 text-center text-xs leading-relaxed text-[var(--muted)]">
              {preview}
            </p>
          </div>

          <div className="flex flex-col gap-1 px-3 pt-2" role="menu" aria-label="Message actions">
            {canEdit && role === 'user' ? (
              <button
                type="button"
                role="menuitem"
                data-action="primary"
                className={cn(
                  'min-h-[52px] w-full rounded-xl px-4 text-left text-[17px] font-medium text-[var(--foreground)]',
                  'transition-colors active:bg-slate-100 dark:active:bg-slate-700/80',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/50'
                )}
                onClick={() => {
                  hapticLight();
                  onEdit();
                }}
              >
                Edit message
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              data-action={canEdit && role === 'user' ? undefined : 'primary'}
              className={cn(
                'min-h-[52px] w-full rounded-xl px-4 text-left text-[17px] font-medium text-[var(--foreground)]',
                'transition-colors active:bg-slate-100 dark:active:bg-slate-700/80',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/50'
              )}
              onClick={() => {
                hapticLight();
                onCopy();
              }}
            >
              Copy message
            </button>
          </div>

          <div className="mt-2 px-3">
            <button
              type="button"
              className={cn(
                'min-h-[52px] w-full rounded-xl px-4 text-center text-[17px] font-semibold text-[var(--muted)]',
                'transition-colors active:bg-slate-100 dark:active:bg-slate-700/80',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400/50'
              )}
              onClick={() => {
                hapticLight();
                onClose();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

type MobileCopyToastProps = {
  message: string | null;
};

/** Bottom snackbar for copy confirmation on mobile (no actions). */
export function MobileCopyToast({ message }: MobileCopyToastProps) {
  if (!message || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] flex justify-center lg:hidden"
      style={{
        paddingBottom: 'max(5.25rem, calc(env(safe-area-inset-bottom, 0px) + 4.25rem))',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'animate-toast-in mx-4 max-w-md rounded-full border border-[var(--card-border)] bg-[var(--card)] px-5 py-2.5 text-center text-sm font-medium text-[var(--foreground)]',
          'shadow-lg dark:border-slate-600 dark:bg-slate-800'
        )}
      >
        {message}
      </div>
    </div>,
    document.body
  );
}
