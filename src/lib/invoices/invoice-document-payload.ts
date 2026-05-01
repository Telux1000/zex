import { countries as locationCountries, getStates } from '@/lib/location';
import type { PaymentSettings } from '@/lib/database.types';
import { resolveShowZenzexBrandingOnInvoice } from '@/lib/invoices/zenzex-invoice-branding';
import { isValid, parseISO } from 'date-fns';
import { formatDisplayDate } from '@/lib/utils/date';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { getInvoicePreviewCurrency } from '@/lib/invoices/currency-edit';
import type { SavedBusiness, SavedInvoice, SavedInvoiceItem } from '@/types/invoice-preview';
import { formatAddressBlockLines } from '@/lib/addresses/address-block-format';
import { formatQuantityWithUnit, formatRateWithUnit } from '@/lib/invoices/invoice-line-units';
import {
  buildInvoiceTimeSummaryDoc,
  type InvoiceTimeSummaryDoc,
} from '@/lib/invoices/invoice-time-summary';

export type InvoiceDocTextLine = {
  variant: 'section' | 'strong' | 'muted' | 'normal';
  text: string;
  preWrap?: boolean;
};

export type InvoiceDocumentPayload = {
  previewCurrency: string;
  voided: boolean;
  company: {
    name: string;
    logoUrl: string | null;
    addressLines: string[];
    taxIdLine: string | null;
  };
  billTo: {
    useDeliveryAddress: boolean;
    billing: { lines: InvoiceDocTextLine[] };
    delivery: { lines: InvoiceDocTextLine[] } | null;
  };
  invoiceMeta: {
    invoiceNumber: string;
    sourceQuoteNumber: string | null;
    referencePo: string | null;
    issueDateFormatted: string;
    dueDateFormatted: string;
    status: string;
    currency: string;
    /** Display line for fully paid invoices (calendar date). */
    paidAtFormatted: string | null;
  };
  lineItems: Array<{
    name: string;
    description: string | null;
    /** Raw quantity for compatibility; use quantityDisplay in tables. */
    quantity: string;
    /** Quantity plus billing unit (e.g. "2 hrs", "1 item") for read-only views. */
    quantityDisplay: string;
    unitPriceDisplay: string;
    taxPercentDisplay: string;
    lineTotalDisplay: string;
  }>;
  totals: {
    subtotal: string;
    discountLine: { label: string; amount: string } | null;
    taxLine: { label: string; amount: string };
    total: string;
    paid: string;
    /** Shown when total_refunded &gt; 0 (gross captured − refunds = net). */
    refunded: string | null;
    balanceDue: string;
    earlyPayment: {
      originalTotal: string;
      discountLabel: string;
      discountAmount: string;
      payableAmount: string;
      footnote: string;
    } | null;
  };
  schedule: Array<{
    description: string;
    amount: string;
    dueDate: string;
    status: string;
  }> | null;
  notesTerms: { notes: string | null; terms: string | null } | null;
  /** Derived from hour lines + assignee when `invoice.show_time_summary`; read-only. */
  timeSummary: InvoiceTimeSummaryDoc | null;
  paymentMethods: {
    bankTransfer: {
      title: 'Bank Transfer';
      fields: Array<{ label: string; value: string }>;
    } | null;
    internationalBankTransfer: {
      title: 'International Bank Transfer';
      fields: Array<{ label: string; value: string }>;
    } | null;
    additionalBlocks: Array<{ title: string; lines: string[] }>;
  } | null;
  /** When true, render subtle “Powered by Zenzex” at document footer (HTML/PDF). */
  showZenzexBranding: boolean;
};

function getCountryNameFromCode(code: string | null | undefined) {
  return code ? locationCountries.find((c) => c.code === code)?.name ?? code : '';
}

function safeFormatDisplayDate(iso: string): string | null {
  const raw = String(iso).trim();
  if (!raw) return null;
  const d = parseISO(raw.length <= 10 ? `${raw.slice(0, 10)}T12:00:00` : raw);
  if (!isValid(d)) return null;
  return formatDisplayDate(d);
}

/** Latest meaningful paid timestamp for display when invoice is fully paid. */
export function resolveInvoicePaidAtFormatted(invoice: SavedInvoice): string | null {
  if (invoice.paid_at != null && String(invoice.paid_at).trim() !== '') {
    const f = safeFormatDisplayDate(String(invoice.paid_at));
    if (f) return f;
  }
  if (!invoice.payment_schedule?.length) return null;
  let bestMs = -Infinity;
  let bestRaw: string | null = null;
  for (const r of invoice.payment_schedule) {
    if (r.status !== 'paid' || !r.paid_at) continue;
    const raw = String(r.paid_at).trim();
    if (!raw) continue;
    const d = parseISO(raw.length <= 10 ? `${raw.slice(0, 10)}T12:00:00` : raw);
    const ms = isValid(d) ? d.getTime() : NaN;
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      bestRaw = raw;
    }
  }
  return bestRaw ? safeFormatDisplayDate(bestRaw) : null;
}

function getScheduleStatusText(
  row: {
    status: 'pending' | 'paid' | 'refund';
    due_date: string;
    paid_at?: string | null;
  },
  isOverdue: boolean
) {
  if (row.status === 'refund') {
    const refDate = row.paid_at || row.due_date;
    return refDate ? `Refunded ${formatDisplayDate(String(refDate))}` : 'Refunded';
  }
  if (row.status === 'paid') {
    const paidDate = row.paid_at || row.due_date;
    return paidDate ? `Paid ${formatDisplayDate(String(paidDate))}` : 'Paid';
  }
  if (isOverdue) return 'Past due';
  return row.due_date ? `Due ${formatDisplayDate(String(row.due_date))}` : 'Due —';
}

export function buildPaymentMethodsPayload(
  settings: PaymentSettings | null | undefined,
  invoiceNumber: string,
  stripeChargesEnabled?: boolean
): InvoiceDocumentPayload['paymentMethods'] {
  const s = (settings || {}) as PaymentSettings;

  const hasBank =
    s.enable_bank_transfer &&
    Boolean(
      s.bank_name ||
        s.bank_account_name ||
        s.bank_account_number ||
        s.bank_sort_code ||
        s.bank_swift_bic ||
        s.bank_address
    );

  const hasIntl =
    s.enable_international_bank_transfer &&
    Boolean(
      s.intl_account_name ||
        s.intl_iban ||
        s.intl_swift_bic ||
        s.intl_bank_name ||
        s.intl_bank_address
    );

  const hasPaypal = s.enable_paypal && Boolean(s.paypal_email);
  const hasStripe =
    s.enable_stripe_card &&
    (stripeChargesEnabled !== undefined
      ? stripeChargesEnabled
      : s.stripe_connect_status === 'connected' || s.stripe_connected === true);
  const hasInstructions = Boolean(s.payment_instructions);

  if (!hasBank && !hasIntl && !hasPaypal && !hasStripe && !hasInstructions) {
    return null;
  }

  const bankTransfer = hasBank
    ? {
        title: 'Bank Transfer' as const,
        fields: [
          { label: 'Account Name', value: String(s.bank_account_name ?? '').trim() },
          { label: 'Account Number', value: String(s.bank_account_number ?? '').trim() },
          { label: 'Bank Name', value: String(s.bank_name ?? '').trim() },
          { label: 'SWIFT / BIC', value: String(s.bank_swift_bic ?? '').trim() },
          { label: 'Reference', value: invoiceNumber },
        ].filter((f) => f.value),
      }
    : null;

  const internationalBankTransfer = hasIntl
    ? {
        title: 'International Bank Transfer' as const,
        fields: [
          { label: 'Account Name', value: String(s.intl_account_name ?? '').trim() },
          { label: 'IBAN', value: String(s.intl_iban ?? '').trim() },
          { label: 'Bank Name', value: String(s.intl_bank_name ?? '').trim() },
          { label: 'SWIFT / BIC', value: String(s.intl_swift_bic ?? '').trim() },
          { label: 'Reference', value: invoiceNumber },
        ].filter((f) => f.value),
      }
    : null;

  const additionalBlocks: Array<{ title: string; lines: string[] }> = [];

  if (hasPaypal) {
    additionalBlocks.push({
      title: 'PayPal',
      lines: [`Send payments to: ${s.paypal_email}`],
    });
  }

  if (hasStripe) {
    additionalBlocks.push({
      title: 'Card payment (Stripe)',
      lines: [
        'Pay securely online with card via Stripe. Use the payment button or link provided with this invoice.',
      ],
    });
  }

  if (hasInstructions) {
    additionalBlocks.push({
      title: 'Additional instructions',
      lines: [String(s.payment_instructions)],
    });
  }

  return {
    bankTransfer,
    internationalBankTransfer,
    additionalBlocks,
  };
}

export function buildInvoiceDocumentPayload(input: {
  business: SavedBusiness;
  invoice: SavedInvoice;
  items: SavedInvoiceItem[];
}): InvoiceDocumentPayload {
  const { business, invoice, items } = input;
  const previewCurrency = getInvoicePreviewCurrency(invoice, business.currency);
  const meta = invoice.metadata ?? null;
  const amountPaidGross = Number(invoice.amount_paid ?? 0);
  const totalRefunded = Math.max(0, Number((invoice as { total_refunded?: number | null }).total_refunded ?? 0));
  const netPaid = Math.max(0, amountPaidGross - totalRefunded);
  /**
   * Preview totals display `Paid` as net paid and keeps `Refunded` separate.
   * To avoid double-counting refunds in the preview balance line, compute:
   * balance = total - netPaid - refunded (= total - grossPaid), clamped to [0, total].
   */
  const balanceDue = Math.min(
    Math.max(0, Number(invoice.total ?? 0)),
    Math.max(0, Number(invoice.total ?? 0) - netPaid - totalRefunded)
  );
  const epd = computeEarlyPaymentDiscount({
    settings: business.payment_settings ?? null,
    issue_date: invoice.issue_date ?? null,
    now: new Date(),
    balance_due: balanceDue,
  });

  const billingStateName =
    meta?.billing_country && meta?.billing_state
      ? getStates(meta.billing_country).find((s) => s.code === meta.billing_state)?.name ?? meta.billing_state
      : meta?.billing_state ?? '';
  const deliveryStateName =
    meta?.delivery_country && meta?.delivery_state
      ? getStates(meta.delivery_country).find((s) => s.code === meta.delivery_state)?.name ?? meta.delivery_state
      : meta?.delivery_state ?? '';

  const hasDeliveryCompanyKey = meta ? Object.prototype.hasOwnProperty.call(meta, 'delivery_company') : false;
  const legacyDeliveryContactAsCompany = !hasDeliveryCompanyKey && !!meta?.delivery_contact_person;
  const deliveryCompanyText = legacyDeliveryContactAsCompany ? meta?.delivery_contact_person ?? '' : meta?.delivery_company ?? '';
  const deliveryContactText = legacyDeliveryContactAsCompany ? '' : meta?.delivery_contact_person ?? '';

  const companyStateLabel =
    business.country && business.state
      ? getStates(business.country).find((s) => s.code === business.state)?.name ?? business.state
      : business.state ?? '';
  const companyCountryResolved = getCountryNameFromCode(business.country) || String(business.country ?? '').trim();
  const companyAddressLines = formatAddressBlockLines({
    line1: business.address_line1,
    line2: business.address_line2,
    city: business.city,
    state: companyStateLabel,
    postal_code: business.postal_code,
    country: companyCountryResolved,
  });

  function buildBillingLines(): InvoiceDocTextLine[] {
    const lines: InvoiceDocTextLine[] = [];
    const customerNameNormalized = String(invoice.customer_name ?? '').trim().toLowerCase();
    const companyNormalized = String(meta?.company ?? '').trim().toLowerCase();
    const shouldSkipAddressLine = (value: string) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (!normalized) return true;
      if (normalized === customerNameNormalized) return true;
      if (companyNormalized && normalized === companyNormalized) return true;
      return false;
    };
    let b1 = String(meta?.billing_address_line1 ?? '').trim();
    let b2 = String(meta?.billing_address_line2 ?? '').trim();
    if (shouldSkipAddressLine(b1)) b1 = '';
    if (shouldSkipAddressLine(b2)) b2 = '';
    if (!b1 && !b2 && meta?.billing_address) {
      const legacy = String(meta.billing_address).trim();
      if (legacy && !shouldSkipAddressLine(legacy)) {
        const p = legacy.split(/\n/).map((s) => s.trim()).filter(Boolean);
        b1 = p[0] ?? '';
        b2 = p.slice(1).join('\n') || '';
      }
    }
    const billingCountryResolved =
      getCountryNameFromCode(meta?.billing_country) || String(meta?.billing_country ?? '').trim();
    const hasBillingAddrBlock =
      b1 ||
      b2 ||
      meta?.billing_city ||
      meta?.billing_state ||
      meta?.billing_postal_code ||
      meta?.billing_country;
    const billingBlockLines = hasBillingAddrBlock
      ? formatAddressBlockLines({
          line1: b1 || undefined,
          line2: b2 || undefined,
          city: meta?.billing_city,
          state: (billingStateName || meta?.billing_state) as string,
          postal_code: meta?.billing_postal_code,
          country: billingCountryResolved,
        })
      : [];
    lines.push({ variant: 'section', text: 'Billing Address' });
    lines.push({ variant: 'strong', text: invoice.customer_name });
    if (meta?.company && String(meta.company).trim().toLowerCase() !== customerNameNormalized) {
      lines.push({ variant: 'normal', text: meta.company });
    }
    if (billingBlockLines.length) {
      lines.push({ variant: 'normal', text: billingBlockLines.join('\n'), preWrap: true });
    }
    if (invoice.customer_email) lines.push({ variant: 'muted', text: invoice.customer_email });
    if (meta?.billing_phone) lines.push({ variant: 'muted', text: `Phone: ${meta.billing_phone}` });
    if (meta?.contact_person) lines.push({ variant: 'muted', text: `Contact: ${meta.contact_person}` });
    return lines;
  }

  function buildDeliveryLines(): InvoiceDocTextLine[] {
    const lines: InvoiceDocTextLine[] = [];
    lines.push({ variant: 'section', text: 'Delivery Address' });
    if (deliveryCompanyText) lines.push({ variant: 'strong', text: deliveryCompanyText });
    if (meta?.delivery_address || meta?.delivery_city || meta?.delivery_state || meta?.delivery_postal_code || meta?.delivery_country) {
      const rawDel = String(meta?.delivery_address ?? '').trim();
      const delParts = rawDel
        ? rawDel
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const d1 = delParts[0];
      const d2 = delParts.length > 1 ? delParts.slice(1).join('\n') : undefined;
      const delCountry =
        getCountryNameFromCode(meta?.delivery_country) || String(meta?.delivery_country ?? '').trim();
      const dLines = formatAddressBlockLines({
        line1: d1,
        line2: d2,
        city: meta?.delivery_city,
        state: (deliveryStateName || meta?.delivery_state) as string,
        postal_code: meta?.delivery_postal_code,
        country: delCountry,
      });
      lines.push({ variant: 'normal', text: dLines.join('\n'), preWrap: true });
    }
    if (meta?.delivery_email) lines.push({ variant: 'muted', text: meta.delivery_email });
    if (meta?.delivery_phone) lines.push({ variant: 'muted', text: `Phone: ${meta.delivery_phone}` });
    if (deliveryContactText) lines.push({ variant: 'muted', text: `Contact: ${deliveryContactText}` });
    return lines;
  }

  const billTo =
    meta?.use_delivery_address === true
      ? {
          useDeliveryAddress: true as const,
          billing: { lines: buildBillingLines() },
          delivery: { lines: buildDeliveryLines() },
        }
      : {
          useDeliveryAddress: false as const,
          billing: { lines: buildBillingLines() },
          delivery: null,
        };

  const lineItems = items.map((item) => {
    const lineTotal = Number(item.amount);
    const taxPct = item.tax_percent ?? 0;
    const lineTax = lineTotal * (taxPct / 100);
    const lineTotalWithTax = lineTotal + lineTax;
    const unitRaw = (item as SavedInvoiceItem).unit_label;
    return {
      name: item.name || '—',
      description: item.description && String(item.description).trim() ? item.description : null,
      quantity: String(item.quantity),
      quantityDisplay: formatQuantityWithUnit(Number(item.quantity), unitRaw),
      unitPriceDisplay: formatRateWithUnit(Number(item.unit_price), previewCurrency, unitRaw),
      taxPercentDisplay: taxPct ? `${taxPct}%` : '—',
      lineTotalDisplay: `${previewCurrency} ${lineTotalWithTax.toFixed(2)}`,
    };
  });

  const discountLine =
    (invoice.discount_amount ?? 0) > 0
      ? {
          label:
            invoice.discount_percent != null && invoice.discount_percent > 0
              ? `Discount (${invoice.discount_percent}%)`
              : 'Discount',
          amount: `−${previewCurrency} ${Number(invoice.discount_amount).toFixed(2)}`,
        }
      : null;

  const taxLine = {
    label:
      invoice.tax_percent != null && invoice.tax_percent > 0 ? `Tax (${invoice.tax_percent}%)` : 'Tax',
    amount: `${previewCurrency} ${Number(invoice.tax_amount).toFixed(2)}`,
  };

  const scheduleRows =
    invoice.payment_schedule && invoice.payment_schedule.length > 0
      ? invoice.payment_schedule.map((r) => {
          const st = r.status === 'paid' ? 'paid' : r.status === 'refund' ? 'refund' : 'pending';
          const isOverdue =
            st !== 'paid' &&
            st !== 'refund' &&
            Boolean(r.due_date) &&
            new Date(String(r.due_date)) < new Date(new Date().toISOString().slice(0, 10));
          const statusText = getScheduleStatusText(
            { status: st, due_date: String(r.due_date), paid_at: r.paid_at ?? null },
            isOverdue
          );
          return {
            description: r.description,
            amount: `${previewCurrency} ${Number(r.amount).toFixed(2)}`,
            dueDate: formatDisplayDate(String(r.due_date)),
            status: statusText,
          };
        })
      : null;

  const notesTerms =
    invoice.notes || invoice.terms
      ? { notes: invoice.notes ?? null, terms: invoice.terms ?? null }
      : null;

  const timeSummary = buildInvoiceTimeSummaryDoc(
    items.map((item) => ({
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      amount: Number(item.amount),
      unit_label: item.unit_label,
      tax_percent: item.tax_percent,
      assignee: item.assignee,
    })),
    {
      show: !!(invoice as { show_time_summary?: boolean | null }).show_time_summary,
      currencyCode: previewCurrency,
      formatMoney: (amount, code) => `${code} ${amount.toFixed(2)}`,
    }
  );

  return {
    previewCurrency,
    voided: invoice.status === 'voided',
    company: {
      name: business.name,
      logoUrl: business.logo_url ?? null,
      addressLines: companyAddressLines,
      taxIdLine: business.tax_id ? `Tax ID: ${business.tax_id}` : null,
    },
    billTo,
    invoiceMeta: {
      invoiceNumber: invoice.invoice_number,
      sourceQuoteNumber: invoice.sourceQuoteNumber ?? null,
      referencePo: invoice.reference_po ?? null,
      issueDateFormatted: invoice.issue_date ? formatDisplayDate(invoice.issue_date) : '—',
      dueDateFormatted: invoice.due_date ? formatDisplayDate(invoice.due_date) : '—',
      status: invoice.status,
      currency: previewCurrency,
      paidAtFormatted: resolveInvoicePaidAtFormatted(invoice),
    },
    lineItems,
    totals: {
      subtotal: `${previewCurrency} ${Number(invoice.subtotal).toFixed(2)}`,
      discountLine,
      taxLine,
      total: `${previewCurrency} ${Number(invoice.total).toFixed(2)}`,
      paid: `${previewCurrency} ${netPaid.toFixed(2)}`,
      refunded:
        totalRefunded > 0.0001 ? `${previewCurrency} ${totalRefunded.toFixed(2)}` : null,
      balanceDue: `${previewCurrency} ${balanceDue.toFixed(2)}`,
      earlyPayment:
        epd.enabled
          ? {
              originalTotal: `${previewCurrency} ${Number(invoice.total).toFixed(2)}`,
              discountLabel: `Early payment discount (${epd.percent}% · expires ${epd.expires_on ?? '—'})`,
              discountAmount: `−${previewCurrency} ${(epd.eligible ? epd.discount_amount : 0).toFixed(2)}`,
              payableAmount: `${previewCurrency} ${(epd.eligible ? epd.payable_now : epd.original_due).toFixed(2)}`,
              footnote: epd.eligible ? 'Valid only if paid before expiry.' : 'Discount not available (expired).',
            }
          : null,
    },
    schedule: scheduleRows,
    notesTerms,
    timeSummary,
    paymentMethods: buildPaymentMethodsPayload(
      business.payment_settings ?? null,
      invoice.invoice_number,
      business.stripe_charges_enabled
    ),
    showZenzexBranding: resolveShowZenzexBrandingOnInvoice(business.invoice_settings),
  };
}
