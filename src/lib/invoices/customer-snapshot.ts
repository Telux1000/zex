export type InvoiceCustomerSnapshot = {
  contact_person: string | null;
  company: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  billing_phone: string | null;
  use_delivery_address: boolean;
};

export type CustomerSnapshotSource = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

const clean = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text || null;
};

export function buildInvoiceCustomerSnapshot(
  customer: CustomerSnapshotSource | null | undefined
): InvoiceCustomerSnapshot | null {
  if (!customer) return null;
  const billingLine1 = clean(customer.address_line1);
  const billingLine2 = clean(customer.address_line2);
  const combinedFromLines = [billingLine1, billingLine2].filter(Boolean).join(', ').trim();
  const billingAddress = clean(customer.address) ?? clean(combinedFromLines);

  return {
    contact_person: clean(customer.name),
    company: clean(customer.company),
    billing_address_line1: billingLine1,
    billing_address_line2: billingLine2,
    billing_address: billingAddress,
    billing_city: clean(customer.city),
    billing_state: clean(customer.state),
    billing_postal_code: clean(customer.postal_code),
    billing_country: clean(customer.country),
    billing_phone: clean(customer.phone),
    use_delivery_address: false,
  };
}

export function mergeInvoiceCustomerSnapshots(
  primary: InvoiceCustomerSnapshot | null | undefined,
  fallback: InvoiceCustomerSnapshot | null | undefined
): InvoiceCustomerSnapshot | null {
  if (!primary && !fallback) return null;
  const p = primary ?? null;
  const f = fallback ?? null;
  return {
    contact_person: p?.contact_person ?? f?.contact_person ?? null,
    company: p?.company ?? f?.company ?? null,
    billing_address_line1: p?.billing_address_line1 ?? f?.billing_address_line1 ?? null,
    billing_address_line2: p?.billing_address_line2 ?? f?.billing_address_line2 ?? null,
    billing_address: p?.billing_address ?? f?.billing_address ?? null,
    billing_city: p?.billing_city ?? f?.billing_city ?? null,
    billing_state: p?.billing_state ?? f?.billing_state ?? null,
    billing_postal_code: p?.billing_postal_code ?? f?.billing_postal_code ?? null,
    billing_country: p?.billing_country ?? f?.billing_country ?? null,
    billing_phone: p?.billing_phone ?? f?.billing_phone ?? null,
    use_delivery_address: false,
  };
}
