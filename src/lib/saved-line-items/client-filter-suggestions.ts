import { normalizeLineItemName } from './names';
import { suggestSortKey, textMatchTier } from './suggest-ranking';
import type { LineItemSuggestRow } from './suggest-types';

/**
 * Client-side filter + rank (matches server suggest behavior) for a preloaded index.
 */
export function filterAndRankLineItemSuggestions(
  index: LineItemSuggestRow[],
  queryRaw: string,
  limit: number
): LineItemSuggestRow[] {
  const q = normalizeLineItemName(String(queryRaw ?? '').trim());
  if (!q) return [];
  const max = Math.max(1, Math.min(24, limit));
  const matched: LineItemSuggestRow[] = [];
  for (const row of index) {
    if (textMatchTier(q, row.normalizedName, row.name) > 0) {
      matched.push(row);
    }
  }
  matched.sort(
    (a, b) =>
      suggestSortKey(q, b.normalizedName, b.name, b.usageCount, b.lastUsedAt) -
      suggestSortKey(q, a.normalizedName, a.name, a.usageCount, a.lastUsedAt)
  );
  return matched.slice(0, max);
}
