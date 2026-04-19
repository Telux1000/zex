/**
 * Assistant chat convention: one **bold** block per line in source text; rendered in the UI
 * via `renderAssistantFormattedText` (see `assistant-formatted-text.tsx`).
 */
export function assistantBoldLine(text: string): string {
  return `**${text.replace(/\*\*/g, '')}**`;
}
