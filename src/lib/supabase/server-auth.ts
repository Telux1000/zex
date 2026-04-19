import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getBusinessBaseCurrency } from '@/lib/business/base-currency';

/** Dedupes Supabase client + auth lookup within a single RSC request (layout + page). */
export const getServerSupabaseUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user: user ?? null };
});

const PRIMARY_BUSINESS_SELECT =
  'id, owner_id, name, currency, logo_url, address_line1, address_line2, city, state, postal_code, country, email, phone, tax_id, timezone, invoice_settings';

export type PrimaryBusinessRow = {
  id: string;
  /** Paying subscriber for workspace billing / trial (auth.users id). */
  ownerId: string;
  name: string;
  currency: string;
  logo_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  timezone: string | null;
};

type RawPrimaryBusinessRow = {
  id: string;
  owner_id?: string | null;
  name: string | null;
  currency: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  logo_url: string | null;
  timezone?: string | null;
  invoice_settings?: { default_currency?: string | null } | null;
};

function mapPrimaryBusinessRow(row: RawPrimaryBusinessRow): PrimaryBusinessRow {
  return {
    id: row.id,
    ownerId: String(row.owner_id ?? ''),
    /** Raw empty name allowed; UI and validation treat unset names explicitly (no display default). */
    name: String(row.name ?? '').trim(),
    currency: getBusinessBaseCurrency({
      currency: row.currency,
      invoice_settings: row.invoice_settings,
    }),
    logo_url: row.logo_url ?? null,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    country: row.country,
    email: row.email,
    phone: row.phone,
    tax_id: row.tax_id,
    timezone: row.timezone ?? null,
  };
}

async function loadPrimaryBusinessForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PrimaryBusinessRow | null> {
  const { data: businesses, error } = await supabase
    .from('businesses')
    .select(PRIMARY_BUSINESS_SELECT)
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return null;
  const owned = businesses?.[0] as RawPrimaryBusinessRow | undefined;
  if (owned?.id) return mapPrimaryBusinessRow(owned);

  const { data, error: memberError } = await supabase
    .from('business_members')
    .select(`businesses (${PRIMARY_BUSINESS_SELECT})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError || !data) return null;
  const b = (data as { businesses: unknown }).businesses;
  if (!b || typeof b !== 'object') return null;
  const row = b as RawPrimaryBusinessRow;
  if (!row.id) return null;
  return mapPrimaryBusinessRow(row);
}

/** Dedupes primary business row for an owner across layout + pages in one request. */
export const getPrimaryBusinessForOwner = cache(
  async (ownerId: string): Promise<PrimaryBusinessRow | null> => {
    const supabase = await createClient();
    const { data: businesses, error } = await supabase
      .from('businesses')
      .select(PRIMARY_BUSINESS_SELECT)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) return null;
    const row = businesses?.[0] as RawPrimaryBusinessRow | undefined;
    if (!row?.id) return null;
    return mapPrimaryBusinessRow(row);
  }
);

/** Primary business: owned first, otherwise first business membership. */
export const getPrimaryBusinessForUser = cache(async (userId: string): Promise<PrimaryBusinessRow | null> => {
  const supabase = await createClient();
  return loadPrimaryBusinessForUser(supabase, userId);
});

/**
 * Fresh read from the database, not memoized with React `cache()`.
 * Use after a business write (e.g. currency save) before evaluating onboarding completion.
 */
export async function getPrimaryBusinessForUserFresh(userId: string): Promise<PrimaryBusinessRow | null> {
  const supabase = await createClient();
  return loadPrimaryBusinessForUser(supabase, userId);
}
