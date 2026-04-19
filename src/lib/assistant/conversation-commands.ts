/**
 * Natural-language controls for the Assistant chat (explicit actions only — no undo/redo).
 * Matching is intentionally strict to avoid accidental triggers mid-sentence.
 */

export type ParsedConversationCommand = { kind: 'clear_chat' };

const CLEAR_RE =
  /^(?:clear\s+chat|reset\s+chat|start\s+over)\s*\.?$/i;

export function parseConversationCommand(raw: string): ParsedConversationCommand | null {
  const t = raw.trim();
  if (!t) return null;
  if (CLEAR_RE.test(t)) return { kind: 'clear_chat' };
  return null;
}
