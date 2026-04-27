import { devSetAssistantInvoiceChatClickT0 } from '@/lib/dev/assistant-invoice-chat-timing';

/** Single source of truth for the Assistant app route. */
export const DASHBOARD_ASSISTANT_HREF = '/dashboard/assistant' as const;

/**
 * Development: shared click `t0` for assistant perf logs (Create hub, sidebar, mobile).
 * No-op in production and for other hrefs. Supports `?context=` etc.
 */
export function markAssistantNavClickForDevTiming(href: string): void {
  if (href === DASHBOARD_ASSISTANT_HREF || href.startsWith(`${DASHBOARD_ASSISTANT_HREF}?`)) {
    devSetAssistantInvoiceChatClickT0();
  }
}
