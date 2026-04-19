/**
 * Extract the first valid email address from a string.
 * Use when voice or text may include phrases like "customer email john@example.com"
 * so that only "john@example.com" is validated and stored.
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

export function extractEmailAddress(value: string | null | undefined): string {
  if (value == null || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(EMAIL_REGEX);
  return match ? match[0] : '';
}
