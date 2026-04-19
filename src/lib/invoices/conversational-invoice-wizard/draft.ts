import type { ParsedInvoice } from '@/lib/validations/invoice';
import { normalizeInvoiceUnitLabel } from '@/lib/invoices/invoice-line-units';
import { normalizeWizardDueDateToIso } from '@/lib/utils/date';
import { normalizeCountryCode } from '@/lib/location';
import { finalizeWizardNewCustomerExtractFields } from '@/lib/invoices/conversational-invoice-wizard/new-customer-onboarding';
import type { InvoiceWizardDraft, InvoiceWizardLineItem } from './types';
import type { WizardAiExtract } from './wizard-ai-extract';

function lineItemDedupeKey(i: InvoiceWizardLineItem): string {
  return `${String(i.name).trim().toLowerCase()}|${i.quantity}|${i.unit_price}`;
}

/** When appending extracted lines, skip rows identical to an existing line (name + qty + price). */
function dedupeIncomingLineItems(
  existing: InvoiceWizardLineItem[],
  incoming: InvoiceWizardLineItem[]
): InvoiceWizardLineItem[] {
  const seen = new Set(existing.map(lineItemDedupeKey));
  const out: InvoiceWizardLineItem[] = [];
  for (const row of incoming) {
    const k = lineItemDedupeKey(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

export function isEmptyWizardDraft(d: InvoiceWizardDraft): boolean {
  return (
    !d.customerId &&
    !d.customerName.trim() &&
    !d.customerEmail.trim() &&
    !d.customerPhone?.trim() &&
    !d.customerContactName?.trim() &&
    !d.customerAddress?.trim() &&
    !d.customerAddressLine1?.trim() &&
    !d.customerCity?.trim() &&
    !d.customerState?.trim() &&
    !d.customerPostalCode?.trim() &&
    !d.customerCountry?.trim() &&
    !d.newCustomerOnboardSubstep &&
    !d.newCustomerOptionalStepDone &&
    d.items.length === 0 &&
    !d.dueDate?.trim() &&
    !d.notes?.trim() &&
    !d.currency?.trim() &&
    d.taxPercent == null &&
    d.discountPercent == null &&
    d.discountAmount == null &&
    !d.isNewCustomer &&
    !d.usePaymentSchedule
  );
}

export function emptyInvoiceWizardDraft(): InvoiceWizardDraft {
  return {
    customerId: null,
    isNewCustomer: false,
    customerName: '',
    customerEmail: '',
    customerPhone: null,
    customerContactName: null,
    customerAddress: null,
    customerAddressLine1: null,
    customerAddressLine2: null,
    customerCity: null,
    customerState: null,
    customerPostalCode: null,
    customerCountry: null,
    newCustomerOnboardSubstep: null,
    newCustomerOptionalStepDone: false,
    newCustomerAddressCollectSlot: undefined,
    newCustomerAddressSkips: undefined,
    awaitingPostCreateCustomerChoice: undefined,
    pendingCountryCandidates: undefined,
    countryModalRecommended: undefined,
    items: [],
    dueDate: null,
    notes: null,
    currency: null,
    taxPercent: null,
    discountPercent: null,
    discountAmount: null,
    usePaymentSchedule: false,
  };
}

/**
 * System-owned merge: apply AI extraction to the draft without letting the model choose flow.
 * Non-destructive for locked customer when customerId already set (explicit select wins).
 */
export function mergeParsedInvoiceIntoDraft(
  draft: InvoiceWizardDraft,
  parsed: ParsedInvoice,
  opts?: { preserveLockedCustomer?: boolean }
): InvoiceWizardDraft {
  const preserveCustomer = opts?.preserveLockedCustomer && draft.customerId != null;
  const next: InvoiceWizardDraft = { ...draft };

  if (!preserveCustomer) {
    const name = String(parsed.customer_name ?? '').trim();
    if (name) next.customerName = name;
    const email = String(parsed.customer_email ?? '').trim();
    if (email) next.customerEmail = email;
  }

  if (parsed.items?.length) {
    const mapped: InvoiceWizardLineItem[] = parsed.items.map((i) => ({
      name: i.name,
      description: i.description ?? null,
      quantity: i.quantity,
      unit_price: i.unit_price,
      unit_label: i.unit_label ?? 'item',
    }));
    next.items = mapped;
  }

  if (parsed.due_date != null && String(parsed.due_date).trim()) {
    next.dueDate = String(parsed.due_date).trim();
  }
  if (parsed.notes != null && String(parsed.notes).trim()) {
    next.notes = String(parsed.notes).trim();
  }
  if (parsed.currency != null && String(parsed.currency).trim()) {
    next.currency = String(parsed.currency).trim().toUpperCase();
  }
  if (parsed.tax_percent != null) next.taxPercent = parsed.tax_percent;
  if (parsed.discount_percent != null) next.discountPercent = parsed.discount_percent;
  if (parsed.discount_amount != null) next.discountAmount = parsed.discount_amount;
  if (parsed.use_payment_schedule != null) next.usePaymentSchedule = !!parsed.use_payment_schedule;

  return next;
}

/**
 * Apply wizard-only AI extraction (lenient). Empty `items` from the model leaves existing lines unchanged.
 *
 * When `draft.customerId` is unset, only customer-identity fields are merged — not line items, due date,
 * or other invoice payload — so extraction cannot advance the flow before customer resolution.
 */
export function mergeWizardAiExtractIntoDraft(
  draft: InvoiceWizardDraft,
  extracted: WizardAiExtract,
  opts?: { preserveLockedCustomer?: boolean; ignoreCustomerFields?: boolean }
): InvoiceWizardDraft {
  const preserveCustomer =
    (opts?.preserveLockedCustomer && draft.customerId != null) || opts?.ignoreCustomerFields === true;
  const next: InvoiceWizardDraft = { ...draft };
  const customerLinked = draft.customerId != null;

  if (!preserveCustomer) {
    const name = String(extracted.customer_name ?? '').trim();
    if (name) next.customerName = name;
    const email = String(extracted.customer_email ?? '').trim();
    if (email) next.customerEmail = email;
    const phone = String(extracted.customer_phone ?? '').trim();
    if (phone) next.customerPhone = phone;
    const contact = String(extracted.customer_contact_name ?? '').trim();
    if (contact) next.customerContactName = contact;
    const a1 = String(extracted.customer_address_line1 ?? '').trim();
    if (a1) next.customerAddressLine1 = a1;
    const a2 = String(extracted.customer_address_line2 ?? '').trim();
    if (a2) next.customerAddressLine2 = a2;
    const city = String(extracted.customer_city ?? '').trim();
    if (city) next.customerCity = city;
    const st = String(extracted.customer_state ?? '').trim();
    if (st) next.customerState = st;
    const zip = String(extracted.customer_postal_code ?? '').trim();
    if (zip) next.customerPostalCode = zip;
    const ctry = String(extracted.customer_country ?? '').trim();
    if (ctry) {
      const norm = normalizeCountryCode(ctry);
      if (norm) next.customerCountry = norm;
    }
    const addr = String(extracted.customer_address ?? '').trim();
    if (addr) {
      next.customerAddress = addr;
      if (!next.customerAddressLine1?.trim()) next.customerAddressLine1 = addr;
    }
    if (next.isNewCustomer && !next.customerId) {
      Object.assign(next, finalizeWizardNewCustomerExtractFields(next));
    }
  }

  if (customerLinked) {
    const rawItems = extracted.items ?? [];
    const mapped: InvoiceWizardLineItem[] = rawItems
      .filter((i) => String(i.name ?? '').trim().length > 0)
      .map((i) => {
        const q = i.quantity;
        const hasQty = q != null && Number.isFinite(q) && q > 0;
        const rawUnit = i.unit_price ?? i.price ?? i.rate;
        const hasPrice = rawUnit != null && Number.isFinite(rawUnit) && rawUnit > 0;
        const name = String(i.name).trim();
        let quantity = hasQty ? (q as number) : 0;
        let unit_price = hasPrice ? Math.max(0, rawUnit as number) : 0;
        if (hasPrice && !hasQty) {
          quantity = 1;
          unit_price = Math.max(0, rawUnit as number);
        }
        return {
          name,
          description: i.description ?? null,
          quantity,
          unit_price,
          unit_label: normalizeInvoiceUnitLabel(
            i.unit_label != null && String(i.unit_label).trim() ? String(i.unit_label) : 'item'
          ),
        };
      });

    if (mapped.length > 0) {
      /** Append new lines from this extraction; do not replace an existing multi-line draft. */
      const appended = dedupeIncomingLineItems(draft.items, mapped);
      next.items = [...draft.items, ...appended];
    }

    if (extracted.due_date != null && String(extracted.due_date).trim()) {
      const norm = normalizeWizardDueDateToIso(String(extracted.due_date).trim());
      if (norm) next.dueDate = norm;
    }
    if (extracted.notes != null && String(extracted.notes).trim()) {
      next.notes = String(extracted.notes).trim();
    }
    if (extracted.currency != null && String(extracted.currency).trim()) {
      next.currency = String(extracted.currency).trim().toUpperCase();
    }
    if (extracted.tax_percent != null) next.taxPercent = extracted.tax_percent;
    if (extracted.discount_percent != null) next.discountPercent = extracted.discount_percent;
    if (extracted.discount_amount != null) next.discountAmount = extracted.discount_amount;
    if (extracted.use_payment_schedule != null) next.usePaymentSchedule = !!extracted.use_payment_schedule;
  }

  return next;
}
