/** Single-line preview for ticket list (no newlines). */
export function previewLine(text: string, maxLen = 140): string {
  const one = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (one.length <= maxLen) return one;
  return `${one.slice(0, maxLen - 1)}…`;
}
