import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { normalizeLineItemName } from './names';
import { suggestSortKey, textMatchTier } from './suggest-ranking';
import type { LineItemSuggestRow } from './suggest-types';

export type { LineItemSuggestRow } from './suggest-types';

function rowKey(normalizedName: string, unitLabel: string, currency: string) {
  return `${normalizedName}|${unitLabel}|${currency}`;
}

/**
 * Suggestions: saved (non-archived) + recent invoice line history for the same business + currency.
 */
export async function fetchLineItemSuggestions(
  supabase: SupabaseClient,
  args: { businessId: string; currency: string; query: string; limit?: number }
): Promise<LineItemSuggestRow[]> {
  const max = Math.min(12, args.limit ?? 8);
  const qRaw = String(args.query ?? '').trim();
  if (!qRaw) return [];
  const queryNorm = normalizeLineItemName(qRaw);
  if (!queryNorm) return [];
  const cur = String(args.currency ?? 'USD')
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const bid = args.businessId;

  const { data: savedRows, error: sErr } = await supabase
    .from('saved_line_items')
    .select(
      'id, name, normalized_name, description, unit_label, unit_price, tax_percent, currency, usage_count, last_used_at'
    )
    .eq('business_id', bid)
    .eq('currency', cur)
    .is('archived_at', null)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(400);

  if (sErr) {
    if (sErr.code === '42P01') return [];
    console.warn('[suggest] saved', sErr.message);
  }

  const { data: invList } = await supabase
    .from('invoices')
    .select('id')
    .eq('business_id', bid)
    .eq('currency', cur)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(120);
  const invIds = (invList ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
  let historyRaw: {
    name: string;
    description: string | null;
    unit_price: number;
    unit_label: string;
    tax_percent: number;
    created_at: string;
  }[] = [];
  if (invIds.length) {
    const { data: lines, error: hErr } = await supabase
      .from('invoice_items')
      .select('name, description, unit_price, unit_label, tax_percent, created_at, invoice_id')
      .in('invoice_id', invIds)
      .order('created_at', { ascending: false });
    if (hErr) console.warn('[suggest] history', hErr.message);
    else historyRaw = (lines ?? []) as typeof historyRaw;
  }

  const savedCands: LineItemSuggestRow[] = [];
  for (const r of savedRows ?? []) {
    const row = r as {
      id: string;
      name: string;
      normalized_name: string;
      description: string | null;
      unit_label: string;
      unit_price: number;
      tax_percent: number;
      usage_count: number;
      last_used_at: string;
    };
    const nn = String(row.normalized_name ?? normalizeLineItemName(row.name));
    if (textMatchTier(queryNorm, nn, row.name) === 0) continue;
    const uAt = row.last_used_at ? Date.parse(row.last_used_at) : Date.now();
    savedCands.push({
      id: row.id,
      name: row.name,
      normalizedName: nn,
      description: row.description,
      unitLabel: normalizeInvoiceUnitLabel(row.unit_label),
      unitPrice: Number(row.unit_price) || 0,
      taxPercent: Number(row.tax_percent) || 0,
      currency: cur,
      source: 'saved',
      usageCount: Math.max(1, Number(row.usage_count) || 1),
      lastUsedAt: Number.isFinite(uAt) ? uAt : Date.now(),
    });
  }

  savedCands.sort(
    (a, b) =>
      suggestSortKey(queryNorm, b.normalizedName, b.name, b.usageCount, b.lastUsedAt) -
      suggestSortKey(queryNorm, a.normalizedName, a.name, a.usageCount, a.lastUsedAt)
  );

  const seen = new Set<string>();
  for (const s of savedCands) seen.add(rowKey(s.normalizedName, s.unitLabel, s.currency));

  const historyCands: LineItemSuggestRow[] = [];
  for (const r of historyRaw) {
    const u = normalizeInvoiceUnitLabel((r as { unit_label?: string }).unit_label);
    const nn = normalizeLineItemName(String(r.name ?? ''));
    if (!nn) continue;
    if (textMatchTier(queryNorm, nn, r.name) === 0) continue;
    const k = rowKey(nn, u, cur);
    if (seen.has(k)) continue;
    const uAt = (r as { created_at: string }).created_at
      ? Date.parse((r as { created_at: string }).created_at)
      : Date.now();
    const tp = Number((r as { tax_percent?: number }).tax_percent);
    historyCands.push({
      id: `hist:${k}`,
      name: String(r.name).trim(),
      normalizedName: nn,
      description: (r as { description?: string | null }).description ?? null,
      unitLabel: u,
      unitPrice: Number((r as { unit_price: number }).unit_price) || 0,
      taxPercent: Number.isFinite(tp) ? tp : 0,
      currency: cur,
      source: 'history',
      usageCount: 1,
      lastUsedAt: Number.isFinite(uAt) ? uAt : Date.now(),
    });
    seen.add(k);
  }
  historyCands.sort(
    (a, b) =>
      suggestSortKey(queryNorm, b.normalizedName, b.name, b.usageCount, b.lastUsedAt) -
      suggestSortKey(queryNorm, a.normalizedName, a.name, a.usageCount, a.lastUsedAt)
  );

  const out: LineItemSuggestRow[] = [];
  for (const s of savedCands) {
    out.push(s);
    if (out.length >= max) return out;
  }
  for (const h of historyCands) {
    out.push(h);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Full saved + history rows for a business/currency, for client-side autocomplete filtering
 * (no per-keystroke network). Same sources as `fetchLineItemSuggestions` but without query filter.
 */
export async function fetchLineItemAutocompleteIndex(
  supabase: SupabaseClient,
  args: { businessId: string; currency: string }
): Promise<LineItemSuggestRow[]> {
  const cur = String(args.currency ?? 'USD')
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const bid = args.businessId;

  const { data: savedRows, error: sErr } = await supabase
    .from('saved_line_items')
    .select(
      'id, name, normalized_name, description, unit_label, unit_price, tax_percent, currency, usage_count, last_used_at'
    )
    .eq('business_id', bid)
    .eq('currency', cur)
    .is('archived_at', null)
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(400);

  if (sErr) {
    if (sErr.code === '42P01') return [];
    console.warn('[autocomplete-index] saved', sErr.message);
  }

  const { data: invList } = await supabase
    .from('invoices')
    .select('id')
    .eq('business_id', bid)
    .eq('currency', cur)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(120);
  const invIds = (invList ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
  let historyRaw: {
    name: string;
    description: string | null;
    unit_price: number;
    unit_label: string;
    tax_percent: number;
    created_at: string;
  }[] = [];
  if (invIds.length) {
    const { data: lines, error: hErr } = await supabase
      .from('invoice_items')
      .select('name, description, unit_price, unit_label, tax_percent, created_at, invoice_id')
      .in('invoice_id', invIds)
      .order('created_at', { ascending: false });
    if (hErr) console.warn('[autocomplete-index] history', hErr.message);
    else historyRaw = (lines ?? []) as typeof historyRaw;
  }

  const savedList: LineItemSuggestRow[] = [];
  for (const r of savedRows ?? []) {
    const row = r as {
      id: string;
      name: string;
      normalized_name: string;
      description: string | null;
      unit_label: string;
      unit_price: number;
      tax_percent: number;
      usage_count: number;
      last_used_at: string;
    };
    const nn = String(row.normalized_name ?? normalizeLineItemName(row.name));
    if (!nn) continue;
    const uAt = row.last_used_at ? Date.parse(row.last_used_at) : Date.now();
    savedList.push({
      id: row.id,
      name: row.name,
      normalizedName: nn,
      description: row.description,
      unitLabel: normalizeInvoiceUnitLabel(row.unit_label),
      unitPrice: Number(row.unit_price) || 0,
      taxPercent: Number(row.tax_percent) || 0,
      currency: cur,
      source: 'saved',
      usageCount: Math.max(1, Number(row.usage_count) || 1),
      lastUsedAt: Number.isFinite(uAt) ? uAt : Date.now(),
    });
  }

  const seen = new Set<string>();
  for (const s of savedList) seen.add(rowKey(s.normalizedName, s.unitLabel, s.currency));

  const historyList: LineItemSuggestRow[] = [];
  for (const r of historyRaw) {
    const u = normalizeInvoiceUnitLabel((r as { unit_label?: string }).unit_label);
    const nn = normalizeLineItemName(String(r.name ?? ''));
    if (!nn) continue;
    const k = rowKey(nn, u, cur);
    if (seen.has(k)) continue;
    const uAt = (r as { created_at: string }).created_at
      ? Date.parse((r as { created_at: string }).created_at)
      : Date.now();
    const tp = Number((r as { tax_percent?: number }).tax_percent);
    const row: LineItemSuggestRow = {
      id: `hist:${k}`,
      name: String(r.name).trim(),
      normalizedName: nn,
      description: (r as { description?: string | null }).description ?? null,
      unitLabel: u,
      unitPrice: Number((r as { unit_price: number }).unit_price) || 0,
      taxPercent: Number.isFinite(tp) ? tp : 0,
      currency: cur,
      source: 'history',
      usageCount: 1,
      lastUsedAt: Number.isFinite(uAt) ? uAt : Date.now(),
    };
    historyList.push(row);
    seen.add(k);
  }

  return [...savedList, ...historyList];
}
