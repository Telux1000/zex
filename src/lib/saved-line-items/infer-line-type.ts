import { normalizeInvoiceUnitLabel, type InvoiceStandardUnit } from '@/lib/invoices/invoice-line-units';

export type SavedLineItemType = 'service' | 'product' | 'custom';

const SERVICE_UNITS: readonly InvoiceStandardUnit[] = ['hour', 'day', 'week', 'month', 'session', 'project'];

/**
 * Heuristic for library / analytics — not shown as a separate catalog tree.
 */
export function inferLineTypeFromUnitLabel(unit: string | null | undefined): SavedLineItemType {
  const u = normalizeInvoiceUnitLabel(unit);
  if (u === 'item') return 'product';
  if (SERVICE_UNITS.includes(u as InvoiceStandardUnit)) return 'service';
  return 'custom';
}
