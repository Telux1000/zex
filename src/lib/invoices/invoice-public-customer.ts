import { formatAddressBlockLines } from '@/lib/addresses/address-block-format';
import { countries as locationCountries, getStates } from '@/lib/location';
import type { InvoiceCustomerSnapshot } from '@/lib/invoices/customer-snapshot';

export type PublicInvoiceCustomerSnapshot = {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

function trimOrNull(v: unknown): string | null {
  const t = String(v ?? '').trim();
  return t || null;
}

function getCountryNameFromCode(code: string | null | undefined) {
  return code ? locationCountries.find((c) => c.code === code)?.name ?? code : '';
}

function getStateDisplay(countryCode: string | null | undefined, stateCode: string | null | undefined) {
  if (!stateCode?.trim()) return '';
  if (!countryCode?.trim()) return stateCode.trim();
  return getStates(countryCode).find((s) => s.code === stateCode)?.name ?? stateCode;
}

/** Canonical camelCase snapshot stored on invoice.metadata.customerSnapshot */
export function invoiceCustomerSnapshotToPublic(
  snap: InvoiceCustomerSnapshot | null,
  resolvedName: string,
  email: string | null
): PublicInvoiceCustomerSnapshot {
  return {
    name: String(resolvedName ?? '').trim(),
    email: email ? String(email).trim() : null,
    phone: snap?.billing_phone ?? null,
    company: snap?.company ?? null,
    addressLine1: snap?.billing_address_line1 ?? null,
    addressLine2: snap?.billing_address_line2 ?? null,
    city: snap?.billing_city ?? null,
    state: snap?.billing_state ?? null,
    postalCode: snap?.billing_postal_code ?? null,
    country: snap?.billing_country ?? null,
  };
}

function normalizeEmbeddedSnapshot(
  raw: unknown,
  customerName: string,
  customerEmail: string | null
): PublicInvoiceCustomerSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    name: trimOrNull(o.name) ?? String(customerName ?? '').trim(),
    email: o.email !== undefined ? trimOrNull(o.email) : customerEmail,
    phone: trimOrNull(o.phone),
    company: trimOrNull(o.company),
    addressLine1: trimOrNull(o.addressLine1),
    addressLine2: trimOrNull(o.addressLine2),
    city: trimOrNull(o.city),
    state: trimOrNull(o.state),
    postalCode: trimOrNull(o.postalCode),
    country: trimOrNull(o.country),
  };
}

/** Build public snapshot from invoice row + metadata (billing_* + embedded customerSnapshot). */
export function buildPublicCustomerSnapshotFromInvoiceRow(invoice: {
  customer_name?: string | null;
  customer_email?: string | null;
  metadata?: unknown;
}): PublicInvoiceCustomerSnapshot {
  const customerName = String(invoice.customer_name ?? '').trim();
  const customerEmail =
    invoice.customer_email != null && String(invoice.customer_email).trim()
      ? String(invoice.customer_email).trim()
      : null;
  const meta = (invoice.metadata as Record<string, unknown> | null) ?? null;
  const fromMeta: PublicInvoiceCustomerSnapshot = {
    name: customerName,
    email: customerEmail,
    phone: meta ? trimOrNull(meta.billing_phone) : null,
    company: meta ? trimOrNull(meta.company) : null,
    addressLine1: meta ? trimOrNull(meta.billing_address_line1) : null,
    addressLine2: meta ? trimOrNull(meta.billing_address_line2) : null,
    city: meta ? trimOrNull(meta.billing_city) : null,
    state: meta ? trimOrNull(meta.billing_state) : null,
    postalCode: meta ? trimOrNull(meta.billing_postal_code) : null,
    country: meta ? trimOrNull(meta.billing_country) : null,
  };
  const embedded = normalizeEmbeddedSnapshot(meta?.customerSnapshot, customerName, customerEmail);
  if (!embedded) return fromMeta;
  return {
    name: embedded.name?.trim() ? embedded.name : fromMeta.name,
    email: embedded.email ?? fromMeta.email,
    phone: embedded.phone ?? fromMeta.phone,
    company: embedded.company ?? fromMeta.company,
    addressLine1: embedded.addressLine1 ?? fromMeta.addressLine1,
    addressLine2: embedded.addressLine2 ?? fromMeta.addressLine2,
    city: embedded.city ?? fromMeta.city,
    state: embedded.state ?? fromMeta.state,
    postalCode: embedded.postalCode ?? fromMeta.postalCode,
    country: embedded.country ?? fromMeta.country,
  };
}

export function formatPublicInvoiceBillToLines(
  snapshot: PublicInvoiceCustomerSnapshot,
  meta: Record<string, unknown> | null | undefined
): string[] {
  const lines: string[] = [];
  const primary = snapshot.name?.trim();
  const company = snapshot.company?.trim();
  if (primary) lines.push(primary);
  if (company && company.toLowerCase() !== (primary ?? '').toLowerCase()) {
    lines.push(company);
  }

  let line1 = snapshot.addressLine1?.trim();
  let line2 = snapshot.addressLine2?.trim();
  if (!line1 && !line2 && meta?.billing_address) {
    const legacy = String(meta.billing_address).trim();
    if (legacy) {
      const parts = legacy.split(/\n/).map((s) => s.trim()).filter(Boolean);
      line1 = parts[0] ?? '';
      line2 = parts.slice(1).join('\n') || undefined;
    }
  }
  const countryResolved = getCountryNameFromCode(snapshot.country) || String(snapshot.country ?? '').trim();
  const addrLines = formatAddressBlockLines({
    line1: line1 || undefined,
    line2: line2 || undefined,
    city: snapshot.city,
    state: getStateDisplay(snapshot.country, snapshot.state),
    postal_code: snapshot.postalCode,
    country: countryResolved,
  });
  lines.push(...addrLines);

  const email = snapshot.email?.trim();
  if (email) lines.push(email);
  const phone = snapshot.phone?.trim();
  if (phone) lines.push(phone);

  const contact = meta?.contact_person ? String(meta.contact_person).trim() : '';
  if (contact) lines.push(`Contact: ${contact}`);

  return lines.filter(Boolean);
}

/** Merge into metadata; keeps billing_* and sets customerSnapshot for API/UI/PDF alignment. */
export function withSyncedPublicCustomerSnapshot(
  meta: Record<string, unknown> | null | undefined,
  customerName: string,
  customerEmail: string | null
): Record<string, unknown> {
  const base = { ...(meta ?? {}) };
  const snap = buildPublicCustomerSnapshotFromInvoiceRow({
    customer_name: customerName,
    customer_email: customerEmail,
    metadata: base,
  });
  return {
    ...base,
    customerSnapshot: snap,
  };
}
