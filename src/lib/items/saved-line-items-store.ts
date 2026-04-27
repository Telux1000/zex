/**
 * @deprecated Local line-item storage was replaced by server-side `saved_line_items`.
 * Re-exports kept for compatibility; persistence APIs are no-ops.
 */

export {
  normalizeLineItemName,
  normalizeItemNameKey,
} from '@/lib/saved-line-items/names';

export const SAVED_LINE_ITEMS_CHANGED_EVENT = 'zenzex-saved-line-items-changed';

/** No-op: learning runs on the server when invoices/quotes are saved. */
export function persistSavedLineItemsFromSave(
  _businessId: string,
  _items: Array<{
    name: string;
    unitPrice: number;
    description?: string | null;
    taxPercent?: number | null;
  }>
): void {}

/** No-op: learning runs on the server when AI creates an invoice. */
export function persistSavedLineItemsFromAiParsed(
  _businessId: string,
  _parsed: {
    items: Array<{
      name: string;
      description?: string | null;
      unit_price: number;
      tax_percent?: number | null;
    }>;
    tax_percent?: number | null;
  } | null
): void {}

export function savedLineItemsLocalStorageKey(_businessId: string): string {
  return '';
}

export function upsertSavedLineItem(
  _businessId: string,
  _row: {
    name: string;
    unitPrice: number;
    description?: string | null;
    taxPercent?: number | null;
  }
): void {}
