export type NormalizedAssistantInput = {
  raw: string;
  normalized: string;
  normalizedLower: string;
  /** Punctuation-light text for broad keyword checks. */
  keywordText: string;
};

/**
 * Deterministic input normalization for assistant routing.
 * Keeps intent matching robust across punctuation/Unicode variants.
 */
export function normalizeAssistantInput(text: string): NormalizedAssistantInput {
  const raw = String(text ?? '');
  const normalized = raw
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedLower = normalized.toLowerCase();
  const keywordText = normalizedLower
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { raw, normalized, normalizedLower, keywordText };
}
