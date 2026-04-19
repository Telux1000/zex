/**
 * Shared per-business line-item memory (localStorage) for quotes + invoices + AI flows.
 * Learns from usage (counts + recency). `meta` reserved for a future product library.
 */

const STORAGE_PREFIX = 'zenzex_saved_line_items_v1:';

export const SAVED_LINE_ITEMS_CHANGED_EVENT = 'zenzex-saved-line-items-changed';

function dispatchSavedLineItemsChanged(businessId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SAVED_LINE_ITEMS_CHANGED_EVENT, { detail: { businessId } })
  );
}

export type SavedLineItemEntry = {
  id: string;
  name: string;
  normalizedName: string;
  unitPrice: number;
  description: string | null;
  taxPercent: number | null;
  usageCount: number;
  lastUsedAt: number;
  meta?: Record<string, unknown>;
};

export type SavedLineItemsBucket = {
  version: 1;
  byKey: Record<string, SavedLineItemEntry>;
};

function bucketKey(businessId: string): string {
  return `${STORAGE_PREFIX}${businessId}`;
}

export function savedLineItemsLocalStorageKey(businessId: string): string {
  return bucketKey(businessId);
}

export function normalizeItemNameKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function emptyBucket(): SavedLineItemsBucket {
  return { version: 1, byKey: {} };
}

function coerceEntry(raw: unknown, storageKey: string): SavedLineItemEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? '').trim();
  if (!name) return null;
  const unitPrice = Number(o.unitPrice ?? o.unit_price ?? 0);
  const nn = String(o.normalizedName ?? '').trim().toLowerCase();
  const normalizedName = nn || normalizeItemNameKey(name);
  const usageRaw = Number(o.usageCount);
  const usageCount = Number.isFinite(usageRaw) && usageRaw >= 1 ? Math.floor(usageRaw) : 1;
  const lastRaw = Number(o.lastUsedAt ?? o.updatedAt);
  const lastUsedAt = Number.isFinite(lastRaw) ? lastRaw : Date.now();
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId(),
    name,
    normalizedName: normalizedName || storageKey,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    description: o.description != null ? String(o.description).trim() || null : null,
    taxPercent:
      o.taxPercent != null && Number.isFinite(Number(o.taxPercent))
        ? Number(o.taxPercent)
        : o.tax_percent != null && Number.isFinite(Number(o.tax_percent))
          ? Number(o.tax_percent)
          : null,
    usageCount,
    lastUsedAt,
    meta: o.meta && typeof o.meta === 'object' ? (o.meta as Record<string, unknown>) : undefined,
  };
}

export function loadSavedLineItemsBucket(businessId: string): SavedLineItemsBucket {
  if (typeof window === 'undefined' || !businessId) return emptyBucket();
  try {
    const raw = window.localStorage.getItem(bucketKey(businessId));
    if (!raw) return emptyBucket();
    const parsed = JSON.parse(raw) as Partial<SavedLineItemsBucket>;
    if (!parsed || parsed.version !== 1 || typeof parsed.byKey !== 'object' || !parsed.byKey) {
      return emptyBucket();
    }
    const byKey: Record<string, SavedLineItemEntry> = {};
    let mutated = false;
    for (const [k, v] of Object.entries(parsed.byKey)) {
      const entry = coerceEntry(v, k);
      if (!entry) continue;
      let final = entry;
      if (final.normalizedName !== k) {
        final = { ...final, normalizedName: k };
        mutated = true;
      }
      if (
        !v ||
        typeof v !== 'object' ||
        typeof (v as { id?: string }).id !== 'string' ||
        typeof (v as { usageCount?: unknown }).usageCount !== 'number' ||
        ((v as { lastUsedAt?: unknown }).lastUsedAt == null &&
          (v as { updatedAt?: unknown }).updatedAt != null) ||
        typeof (v as { normalizedName?: unknown }).normalizedName !== 'string'
      ) {
        mutated = true;
      }
      byKey[k] = final;
    }
    if (mutated) {
      writeBucket(businessId, { version: 1, byKey });
    }
    return { version: 1, byKey };
  } catch {
    return emptyBucket();
  }
}

function writeBucket(businessId: string, bucket: SavedLineItemsBucket): void {
  if (typeof window === 'undefined' || !businessId) return;
  try {
    window.localStorage.setItem(bucketKey(businessId), JSON.stringify(bucket));
    dispatchSavedLineItemsChanged(businessId);
  } catch {
    /* quota / private mode */
  }
}

function mergeRowIntoBucket(bucket: SavedLineItemsBucket, row: {
  name: string;
  unitPrice: number;
  description?: string | null;
  taxPercent?: number | null;
}): void {
  const name = String(row.name ?? '').trim();
  if (!name) return;
  const key = normalizeItemNameKey(name);
  if (!key) return;
  const prev = bucket.byKey[key];
  const now = Date.now();
  if (prev) {
    bucket.byKey[key] = {
      id: prev.id,
      name,
      normalizedName: key,
      unitPrice: Number.isFinite(row.unitPrice) ? row.unitPrice : prev.unitPrice,
      description:
        row.description != null && String(row.description).trim()
          ? String(row.description).trim()
          : prev.description,
      taxPercent:
        row.taxPercent != null && Number.isFinite(row.taxPercent)
          ? row.taxPercent
          : prev.taxPercent,
      usageCount: prev.usageCount + 1,
      lastUsedAt: now,
      meta: prev.meta,
    };
  } else {
    bucket.byKey[key] = {
      id: newId(),
      name,
      normalizedName: key,
      unitPrice: Number.isFinite(row.unitPrice) ? row.unitPrice : 0,
      description: row.description?.trim() ? row.description.trim() : null,
      taxPercent:
        row.taxPercent != null && Number.isFinite(row.taxPercent) ? row.taxPercent : null,
      usageCount: 1,
      lastUsedAt: now,
    };
  }
}

export function upsertSavedLineItem(
  businessId: string,
  row: {
    name: string;
    unitPrice: number;
    description?: string | null;
    taxPercent?: number | null;
  }
): void {
  if (!businessId) return;
  const bucket = loadSavedLineItemsBucket(businessId);
  mergeRowIntoBucket(bucket, row);
  writeBucket(businessId, bucket);
}

export function persistSavedLineItemsFromSave(
  businessId: string,
  items: Array<{
    name: string;
    unitPrice: number;
    description?: string | null;
    taxPercent?: number | null;
  }>
): void {
  if (!businessId || !items.length) return;
  const bucket = loadSavedLineItemsBucket(businessId);
  for (const it of items) {
    mergeRowIntoBucket(bucket, it);
  }
  writeBucket(businessId, bucket);
}

/** After AI/document parse creates an invoice (user-confirmed server success). */
export function persistSavedLineItemsFromAiParsed(
  businessId: string,
  parsed: {
    items: Array<{
      name: string;
      description?: string | null;
      unit_price: number;
      tax_percent?: number | null;
    }>;
    tax_percent?: number | null;
  } | null
): void {
  if (!businessId || !parsed?.items?.length) return;
  const fallbackTax = parsed.tax_percent != null && Number.isFinite(parsed.tax_percent) ? parsed.tax_percent : null;
  const bucket = loadSavedLineItemsBucket(businessId);
  for (const i of parsed.items) {
    const name = String(i.name ?? '').trim();
    if (!name) continue;
    const unit = Number(i.unit_price);
    const tp =
      i.tax_percent != null && Number.isFinite(Number(i.tax_percent))
        ? Number(i.tax_percent)
        : fallbackTax;
    mergeRowIntoBucket(bucket, {
      name,
      unitPrice: Number.isFinite(unit) ? unit : 0,
      description: i.description ?? null,
      taxPercent: tp,
    });
  }
  writeBucket(businessId, bucket);
}

export type SavedLineItemSuggestion = SavedLineItemEntry & { key: string };

/** Higher = stronger text match (tier). */
function textMatchTier(queryNorm: string, key: string, displayName: string): number {
  if (!queryNorm) return 0;
  if (key.startsWith(queryNorm)) return 4;
  if (key.includes(queryNorm)) return 3;
  const nn = normalizeItemNameKey(displayName);
  if (nn.includes(queryNorm)) return 2;
  const words = queryNorm.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => nn.includes(w))) return 1;
  return 0;
}

/** Rank: text match, then usage, then recency. */
export function filterSavedLineItemSuggestions(
  businessId: string,
  queryRaw: string,
  limit = 8
): SavedLineItemSuggestion[] {
  if (!businessId) return [];
  const queryNorm = normalizeItemNameKey(queryRaw);
  if (queryNorm.length < 1) return [];
  const { byKey } = loadSavedLineItemsBucket(businessId);
  const out: SavedLineItemSuggestion[] = [];
  for (const key of Object.keys(byKey)) {
    const entry = byKey[key];
    if (!entry?.name?.trim()) continue;
    const tier = textMatchTier(queryNorm, key, entry.name);
    if (tier === 0) continue;
    out.push({ ...entry, key });
  }
  out.sort((a, b) => {
    const ta = textMatchTier(queryNorm, a.key, a.name);
    const tb = textMatchTier(queryNorm, b.key, b.name);
    if (tb !== ta) return tb - ta;
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    return b.lastUsedAt - a.lastUsedAt;
  });
  return out.slice(0, limit);
}
