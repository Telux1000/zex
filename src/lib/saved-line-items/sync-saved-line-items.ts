import type { SupabaseClient } from '@supabase/supabase-js';
import { invoiceSaveTimingEnabled } from '@/lib/dev/invoice-save-timing';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { inferLineTypeFromUnitLabel } from './infer-line-type';
import { normalizeLineItemName } from './names';
export type LineUsageForSavedItem = {
  name: string;
  description?: string | null;
  unit_label?: string | null;
  unit_price: number;
  tax_percent?: number | null;
};

/**
 * Upserts saved line items from invoice/quote line usage. Idempotent and safe to call after every save.
 * Does not change invoice line tables.
 */
export async function syncSavedLineItemsFromUsage(
  supabase: SupabaseClient,
  args: { businessId: string; currency: string; items: LineUsageForSavedItem[] }
): Promise<void> {
  const { businessId, items } = args;
  const cur = String(args.currency ?? 'USD')
    .trim()
    .toUpperCase()
    .slice(0, 3);
  if (!businessId || !items.length) return;

  const _t0 = invoiceSaveTimingEnabled() ? performance.now() : 0;

  for (const raw of items) {
    const name = String(raw.name ?? '').trim();
    if (!name) continue;
    const normalizedName = normalizeLineItemName(name);
    if (!normalizedName) continue;
    const unitLabel = normalizeInvoiceUnitLabel(raw.unit_label);
    const unitPrice = Number.isFinite(Number(raw.unit_price)) ? Number(raw.unit_price) : 0;
    const newDesc = raw.description != null ? String(raw.description).trim() : '';
    const taxRaw = raw.tax_percent;
    const taxPercent =
      taxRaw != null && Number.isFinite(Number(taxRaw)) ? Math.min(100, Math.max(0, Number(taxRaw))) : 0;
    const lineType = inferLineTypeFromUnitLabel(unitLabel);
    const nowIso = new Date().toISOString();

    const { data: existing, error: selErr } = await supabase
      .from('saved_line_items')
      .select('id, description, usage_count, archived_at')
      .eq('business_id', businessId)
      .eq('normalized_name', normalizedName)
      .eq('unit_label', unitLabel)
      .eq('currency', cur)
      .maybeSingle();

    if (selErr) {
      if (selErr.code === '42P01' || /saved_line_items/i.test(selErr.message)) {
        return;
      }
      console.warn('[saved-line-items] select', selErr.message);
      continue;
    }

    if (existing?.id) {
      const prevDesc = existing.description != null ? String(existing.description) : '';
      const mergedDesc = newDesc ? newDesc : prevDesc;
      const { error: upErr } = await supabase
        .from('saved_line_items')
        .update({
          name,
          description: mergedDesc || null,
          unit_price: unitPrice,
          tax_percent: taxPercent,
          line_type: lineType,
          usage_count: Number(existing.usage_count ?? 0) + 1,
          last_used_at: nowIso,
          updated_at: nowIso,
          archived_at: null,
        })
        .eq('id', existing.id);

      if (upErr) {
        console.warn('[saved-line-items] update', upErr.message);
        continue;
      }
    } else {
      const { error: insErr } = await supabase.from('saved_line_items').insert({
        business_id: businessId,
        name,
        normalized_name: normalizedName,
        description: newDesc || null,
        unit_label: unitLabel,
        unit_price: unitPrice,
        currency: cur,
        tax_percent: taxPercent,
        line_type: lineType,
        usage_count: 1,
        last_used_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
        archived_at: null,
      });
      if (insErr) {
        if (insErr.code === '42P01') return;
        // Unique race: retry as update
        if (insErr.code === '23505') {
          const { data: again } = await supabase
            .from('saved_line_items')
            .select('id, description, usage_count')
            .eq('business_id', businessId)
            .eq('normalized_name', normalizedName)
            .eq('unit_label', unitLabel)
            .eq('currency', cur)
            .maybeSingle();
          if (again?.id) {
            const mergedDesc = newDesc ? newDesc : String(again.description ?? '');
            await supabase
              .from('saved_line_items')
              .update({
                name,
                description: mergedDesc || null,
                unit_price: unitPrice,
                tax_percent: taxPercent,
                line_type: lineType,
                usage_count: Number(again.usage_count ?? 0) + 1,
                last_used_at: nowIso,
                updated_at: nowIso,
                archived_at: null,
              })
              .eq('id', again.id);
          }
          continue;
        }
        console.warn('[saved-line-items] insert', insErr.message);
        continue;
      }
    }
  }
  if (invoiceSaveTimingEnabled() && _t0) {
    const totalMs = Math.round(performance.now() - _t0);
    console.log(
      `[invoice-save] server:sync_saved_line_items total +${totalMs}ms lineCount=${items.length} (sequential awaits per line)`
    );
  }
}
