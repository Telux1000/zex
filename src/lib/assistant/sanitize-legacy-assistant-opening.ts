import type { PersistedChatMessage } from '@/lib/assistant/conversation-storage';

const LEGACY_SEND_LINE = 'Send me the customer, items, rates';

/** Labels from the old invoice-opening chip row (5-up). */
const LEGACY_INVOICE_CHIP_LABELS = new Set([
  'Add customer',
  'Add item',
  'Set due date',
  'Upload screenshot',
  'Record voice',
]);

function structuredMentionsLegacyOnboarding(m: PersistedChatMessage): boolean {
  const s = m.structured;
  if (!s) return false;
  const lines = [s.title, ...(s.lines ?? [])].map((x) => String(x ?? ''));
  return lines.some((l) => l.includes(LEGACY_SEND_LINE));
}

/**
 * Strips obsolete invoice-opening copy + chip rows from persisted threads so
 * restored sessions match the current minimal opening UI.
 */
export function sanitizeLegacyAssistantOpeningMessages(
  messages: PersistedChatMessage[]
): PersistedChatMessage[] {
  return messages
    .map((m) => {
      if (m.role !== 'assistant') return m;
      const content = String(m.content ?? '');
      if (content.includes(LEGACY_SEND_LINE) || structuredMentionsLegacyOnboarding(m)) {
        return {
          ...m,
          content: '',
          quickReplies: undefined,
          structured: undefined,
          cards: undefined,
        };
      }
      const qr = m.quickReplies;
      if (Array.isArray(qr) && qr.length >= 4) {
        const labels = qr.map((x) => String((x as { label?: string }).label ?? ''));
        let legacyHits = 0;
        for (const l of labels) {
          if (LEGACY_INVOICE_CHIP_LABELS.has(l)) legacyHits += 1;
        }
        if (legacyHits >= 4) {
          return { ...m, quickReplies: undefined };
        }
      }
      return m;
    })
    .filter((m) => {
      if (m.role !== 'assistant') return true;
      const t = String(m.content ?? '').replace(/\u00a0/g, ' ').trim();
      const hasText = t.length > 0;
      const hasCards = Array.isArray(m.cards) && m.cards.length > 0;
      const hasStruct =
        m.structured &&
        (Boolean(m.structured.title?.trim()) || (m.structured.lines?.length ?? 0) > 0);
      return hasText || hasCards || hasStruct;
    });
}
