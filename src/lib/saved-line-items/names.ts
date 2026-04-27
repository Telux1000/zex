/**
 * Normalize a line item name for matching: trim, collapse internal whitespace, lowercase.
 */
export function normalizeLineItemName(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** @deprecated use normalizeLineItemName */
export const normalizeItemNameKey = normalizeLineItemName;
