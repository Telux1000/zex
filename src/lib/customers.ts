import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Derive 3-letter uppercase prefix from the owner's business name (not the customer's).
 * Used for Customer Account Numbers: [OWNER BUSINESS PREFIX][SEQUENTIAL NUMBER]
 * Example: "Bright Solutions" → "BRI"
 */
export function accountNumberPrefixFromBusinessName(businessName: string | null | undefined): string {
  const source = (businessName ?? '').trim();
  const letters = source.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3) return letters.slice(0, 3).toUpperCase();
  if (letters.length > 0) return letters.toUpperCase().padEnd(3, '0');
  return 'BUS';
}

/**
 * Generate next account_number for a business and prefix.
 * Format: PREFIX + 4-digit zero-padded sequence (e.g. BRI0001). No dashes.
 */
export async function generateNextAccountNumber(
  supabase: SupabaseClient,
  businessId: string,
  prefix: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('customers')
    .select('account_number')
    .eq('business_id', businessId)
    .like('account_number', `${prefix}%`);

  let nextNum = 1;
  if (existing && existing.length > 0) {
    for (const row of existing) {
      const numPart = (row.account_number || '').replace(/^[A-Za-z]+/, '');
      const n = parseInt(numPart, 10);
      if (!Number.isNaN(n) && n >= nextNum) nextNum = n + 1;
    }
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export interface InvoiceCustomerData {
  name: string;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

/**
 * Find existing customer by email, company, or exact account_number (if provided).
 * Returns customer id if found, null otherwise.
 */
export async function findExistingCustomer(
  supabase: SupabaseClient,
  businessId: string,
  data: InvoiceCustomerData & { account_number?: string | null }
): Promise<{ id: string; account_number: string | null } | null> {
  const email = (data.email ?? '').trim().toLowerCase();
  const company = (data.company ?? '').trim().toLowerCase();
  const name = (data.name ?? '').trim().toLowerCase();

  if (data.account_number) {
    const { data: byAccount } = await supabase
      .from('customers')
      .select('id, account_number')
      .eq('business_id', businessId)
      .eq('account_number', data.account_number)
      .maybeSingle();
    if (byAccount) return byAccount;
  }

  if (email) {
    const { data: byEmail } = await supabase
      .from('customers')
      .select('id, account_number')
      .eq('business_id', businessId)
      .ilike('email', email)
      .maybeSingle();
    if (byEmail) return byEmail;
  }

  if (company) {
    const { data: byCompany } = await supabase
      .from('customers')
      .select('id, account_number')
      .eq('business_id', businessId)
      .ilike('company', company)
      .maybeSingle();
    if (byCompany) return byCompany;
  }

  if (name) {
    const { data: byName } = await supabase
      .from('customers')
      .select('id, account_number')
      .eq('business_id', businessId)
      .ilike('name', name)
      .maybeSingle();
    if (byName) return byName;
  }

  if (company) {
    const { data: fromInvoicesByCompany } = await supabase
      .from('invoices')
      .select('customer_id')
      .eq('business_id', businessId)
      .ilike('customer_name', company)
      .not('customer_id', 'is', null)
      .limit(1);

    const cid = fromInvoicesByCompany?.[0]?.customer_id as string | null | undefined;
    if (cid) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, account_number')
        .eq('id', cid)
        .maybeSingle();
      if (customer) return customer;
    }
  }

  if (name) {
    const { data: fromInvoices } = await supabase
      .from('invoices')
      .select('customer_id')
      .eq('business_id', businessId)
      .ilike('customer_name', name)
      .not('customer_id', 'is', null)
      .limit(1);

    const customerId = fromInvoices?.[0]?.customer_id as string | null | undefined;
    if (customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, account_number')
        .eq('id', customerId)
        .maybeSingle();
      if (customer) return customer;
    }
  }

  return null;
}

/**
 * Find existing customer or create one from invoice data. Returns customer id and account_number.
 * Uses the owner business name for the account number prefix (not the customer's company).
 */
export async function findOrCreateCustomerFromInvoice(
  supabase: SupabaseClient,
  businessId: string,
  data: InvoiceCustomerData
): Promise<{ id: string; account_number: string | null }> {
  const existing = await findExistingCustomer(supabase, businessId, data);
  if (existing) return existing;

  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single();
  const prefix = accountNumberPrefixFromBusinessName(business?.name ?? null);
  const account_number = await generateNextAccountNumber(supabase, businessId, prefix);

  const companyVal = (data.company ?? '').trim() || null;
  const nameVal = (data.name ?? '').trim() || '';
  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      business_id: businessId,
      account_number,
      name: nameVal,
      email: (data.email ?? '').trim() || null,
      company: companyVal,
      phone: (data.phone ?? '').trim() || null,
      address_line1: (data.address_line1 ?? '').trim() || null,
      address_line2: (data.address_line2 ?? '').trim() || null,
      city: (data.city ?? '').trim() || null,
      state: (data.state ?? '').trim() || null,
      postal_code: (data.postal_code ?? '').trim() || null,
      country: (data.country ?? '').trim() || null,
    })
    .select('id, account_number')
    .single();

  if (error || !customer) throw new Error(error?.message ?? 'Failed to create customer');
  return { id: customer.id, account_number: customer.account_number };
}
