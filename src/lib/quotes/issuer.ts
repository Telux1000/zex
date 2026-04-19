import type { PrimaryBusinessRow } from '@/lib/supabase/server-auth';

export type QuoteIssuerInfo = {
  name: string;
  logo_url?: string | null;
  email?: string | null;
  phone?: string | null;
  tax_id?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

export function primaryBusinessToQuoteIssuer(b: PrimaryBusinessRow): QuoteIssuerInfo {
  return {
    name: b.name,
    logo_url: b.logo_url ?? null,
    email: b.email,
    phone: b.phone,
    tax_id: b.tax_id,
    address_line1: b.address_line1,
    address_line2: b.address_line2,
    city: b.city,
    state: b.state,
    postal_code: b.postal_code,
    country: b.country,
  };
}

export const getQuoteIssuerInfo = primaryBusinessToQuoteIssuer;
