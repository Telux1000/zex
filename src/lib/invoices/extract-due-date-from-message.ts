import { isValid } from 'date-fns';
import {
  formatDueDate,
  parseDueDate,
  tryParseAbsoluteDuePhraseToIso,
} from '@/lib/utils/date';

/**
 * Deterministic due-date extraction when the LLM returns items but omits `due_date`
 * (common for long multi-item messages). Scans the **raw user text** for a `due …` clause.
 */
export function extractDueDateIsoFromInvoiceUserMessage(
  text: string,
  fromDate: Date = new Date()
): string | null {
  const t = text.trim();
  if (!t || !/\bdue\b/i.test(t)) return null;

  const tail = t.match(/\bdue\s+(?:on\s+)?(.+)$/i);
  if (!tail?.[1]) return null;

  let phrase = tail[1].trim().replace(/\.$/, '');
  const beforeAnd = phrase.split(/\s+and\s+/i)[0];
  if (beforeAnd != null) phrase = beforeAnd.trim();

  const absolute = tryParseAbsoluteDuePhraseToIso(phrase, fromDate);
  if (absolute) return absolute;

  const lower = phrase.toLowerCase();
  if (
    /in\s+\d+\s+days?/.test(lower) ||
    /^\d+\s+days?$/.test(lower) ||
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(lower)
  ) {
    const d = parseDueDate(phrase, fromDate);
    return isValid(d) ? formatDueDate(d) : null;
  }

  return null;
}
