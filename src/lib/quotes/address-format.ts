import type { AddressParts } from '@/lib/addresses/address-block-format';
import {
  formatAddressBlock,
  formatAddressBlockLines,
} from '@/lib/addresses/address-block-format';

export type { AddressParts };
export { formatAddressBlock, formatAddressBlockLines };

export type CustomerSnapshotInput = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  address?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  use_delivery_address?: boolean | null;
  delivery_address_line1?: string | null;
  delivery_address_line2?: string | null;
  delivery_city?: string | null;
  delivery_state?: string | null;
  delivery_postal_code?: string | null;
  delivery_country?: string | null;
};

export function formatCustomerSnapshotToLines(snapshot: CustomerSnapshotInput | null | undefined): string[] {
  if (!snapshot) return [];
  const hasStructured =
    !!snapshot.address_line1?.trim() ||
    !!snapshot.address_line2?.trim() ||
    !!snapshot.city?.trim() ||
    !!snapshot.state?.trim() ||
    !!snapshot.postal_code?.trim() ||
    !!snapshot.country?.trim();
  if (hasStructured) {
    return formatAddressBlockLines({
      line1: snapshot.address_line1,
      line2: snapshot.address_line2,
      city: snapshot.city,
      state: snapshot.state,
      postal_code: snapshot.postal_code,
      country: snapshot.country,
    });
  }
  const legacy = snapshot.address?.trim();
  if (!legacy) return [];
  return legacy
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatCustomerDeliverySnapshotToLines(
  snapshot: CustomerSnapshotInput | null | undefined
): string[] {
  if (!snapshot || !snapshot.use_delivery_address) return [];
  return formatAddressBlockLines({
    line1: snapshot.delivery_address_line1,
    line2: snapshot.delivery_address_line2,
    city: snapshot.delivery_city,
    state: snapshot.delivery_state,
    postal_code: snapshot.delivery_postal_code,
    country: snapshot.delivery_country,
  });
}

export function formatIssuerContactLines(snapshot: {
  email?: string | null;
  phone?: string | null;
  tax_id?: string | null;
}): string[] {
  const out: string[] = [];
  const e = snapshot.email?.trim();
  const p = snapshot.phone?.trim();
  const t = snapshot.tax_id?.trim();
  if (e) out.push(e);
  if (p) out.push(p);
  if (t) out.push(`Tax ID: ${t}`);
  return out;
}
