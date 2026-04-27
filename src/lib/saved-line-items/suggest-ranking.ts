import { normalizeLineItemName } from './names';

/** Higher = stronger text match (tier). */
export function textMatchTier(queryNorm: string, key: string, displayName: string): number {
  if (!queryNorm) return 0;
  if (key.startsWith(queryNorm)) return 4;
  if (key.includes(queryNorm)) return 3;
  const nn = normalizeLineItemName(displayName);
  if (nn.includes(queryNorm)) return 2;
  const words = queryNorm.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => nn.includes(w))) return 1;
  return 0;
}

export function suggestSortKey(
  queryNorm: string,
  normalizedName: string,
  displayName: string,
  usageCount: number,
  lastUsedAtMs: number
): number {
  const tier = textMatchTier(queryNorm, normalizedName, displayName);
  return tier * 1e12 + usageCount * 1e6 + lastUsedAtMs / 1e6;
}
