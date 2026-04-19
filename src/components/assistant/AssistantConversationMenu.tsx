'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useAssistantConversationMenu } from '@/components/assistant/assistant-conversation-context';
import { cn } from '@/lib/utils/cn';

type Props = {
  className?: string;
  /** Larger tap target on mobile header */
  compact?: boolean;
};

/**
 * WhatsApp-style overflow menu for Assistant conversation actions.
 * Handlers are registered by `InvoiceChatWizard` when persistence is enabled.
 */
export function AssistantConversationMenu({ className, compact }: Props) {
  const handlers = useAssistantConversationMenu();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!handlers) return null;

  const disabled = Boolean(handlers.disabled);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center justify-center rounded-full text-[var(--foreground)] transition-colors hover:bg-[var(--card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40',
          compact ? 'h-10 w-10' : 'h-9 w-9'
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Conversation options"
      >
        <MoreVertical className={compact ? 'h-5 w-5' : 'h-5 w-5'} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[13.5rem] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
            onClick={() => {
              setOpen(false);
              handlers.clearConversation();
            }}
          >
            Clear chat…
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
            onClick={() => {
              setOpen(false);
              handlers.openRetentionModal();
            }}
          >
            Auto-delete messages…
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
            onClick={() => {
              setOpen(false);
              handlers.exportConversation();
            }}
          >
            Export as PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}
