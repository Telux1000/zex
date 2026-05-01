import type { InvoiceSettings } from '@/lib/database.types';

/** Inline invoice / PDF footer (customer-facing document). */
export const ZENZEX_INVOICE_FOOTER_LINE = 'Powered by Zenzex';

/** Transactional email footer (distinct from document line for tone). */
export const ZENZEX_EMAIL_FOOTER_LINE = 'Sent with Zenzex';

/**
 * When `show_zenzex_branding` is absent or true, show subtle Zenzex footer on
 * invoices and related emails. Set to false to hide (reserved for future tiers).
 */
export function resolveShowZenzexBrandingOnInvoice(settings?: InvoiceSettings | null): boolean {
  if (settings == null) return true;
  return settings.show_zenzex_branding !== false;
}

export function appendZenzexEmailBrandingHtml(
  html: string,
  invoiceSettings?: InvoiceSettings | null
): string {
  if (!resolveShowZenzexBrandingOnInvoice(invoiceSettings)) return html;
  const footer = `<p style="margin:20px 0 0 0;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.4;color:#94a3b8;">${ZENZEX_EMAIL_FOOTER_LINE}</p>`;
  return `${html}${footer}`;
}

export function appendZenzexEmailBrandingText(
  text: string,
  invoiceSettings?: InvoiceSettings | null
): string {
  if (!resolveShowZenzexBrandingOnInvoice(invoiceSettings)) return text;
  return `${text}\n\n${ZENZEX_EMAIL_FOOTER_LINE}`;
}

export function zenzexEmailBrandingTemplateModel(invoiceSettings?: InvoiceSettings | null) {
  const show = resolveShowZenzexBrandingOnInvoice(invoiceSettings);
  const line = show ? ZENZEX_EMAIL_FOOTER_LINE : '';
  return {
    brandingFooter: line,
    /** Alias for Postmark / Handlebars templates that prefer snake_case. */
    branding_footer: line,
    showZenzexBranding: show,
    show_zenzex_branding: show,
  } as const;
}
