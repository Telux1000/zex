/**
 * Canonical business base / reporting currency (ISO 4217).
 * Source of truth: `businesses.currency`. Falls back to legacy `invoice_settings.default_currency` for unmigrated rows.
 */
export function getBusinessBaseCurrency(business: {
  currency?: string | null;
  /** Accepts `InvoiceSettings` and legacy rows where default lived under invoice_settings. */
  invoice_settings?: unknown;
}): string {
  const col = String(business.currency ?? '').trim();
  if (col) return col.toUpperCase();
  const legacySettings = business.invoice_settings as { default_currency?: string | null } | null | undefined;
  const legacy =
    legacySettings && typeof legacySettings.default_currency === 'string'
      ? legacySettings.default_currency.trim()
      : '';
  return (legacy || 'USD').toUpperCase();
}
