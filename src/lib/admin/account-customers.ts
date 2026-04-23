import type { SupabaseClient } from '@supabase/supabase-js';

export type AccountCustomerSort =
  | 'created_at_desc'
  | 'created_at_asc'
  | 'name_asc'
  | 'name_desc';

export type AccountCustomerListItem = {
  id: string;
  name: string;
  email: string | null;
  status: 'active' | 'archived' | 'anonymized';
  created_at: string;
  last_activity_at: string | null;
};

export type AccountCustomerDetail = {
  id: string;
  account_id: string;
  name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: 'active' | 'archived' | 'anonymized';
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  account_number: string | null;
  preferred_currency_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  country_code: string | null;
  notes: string | null;
  archived_at: string | null;
  anonymized_at: string | null;
};

export type ListAccountCustomersParams = {
  accountId: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: AccountCustomerSort;
};

export type ListAccountCustomersResult = {
  account_id: string;
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  customers: AccountCustomerListItem[];
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function normalizeSort(sort: string | null | undefined): AccountCustomerSort {
  const raw = String(sort ?? '').trim().toLowerCase();
  if (raw === 'created_at_asc') return 'created_at_asc';
  if (raw === 'name_asc') return 'name_asc';
  if (raw === 'name_desc') return 'name_desc';
  return 'created_at_desc';
}

export function normalizeAccountCustomersPagination(params: {
  page?: string | null;
  pageSize?: string | null;
}): { page: number; pageSize: number } {
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(params.pageSize ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize };
}

function deriveCustomerStatus(row: {
  archived_at?: string | null;
  anonymized_at?: string | null;
}): 'active' | 'archived' | 'anonymized' {
  if (row.anonymized_at) return 'anonymized';
  if (row.archived_at) return 'archived';
  return 'active';
}

function latestIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

async function loadLastActivityByCustomerId(
  admin: SupabaseClient,
  accountId: string,
  customerIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (customerIds.length === 0) return result;

  const { data: auditRows, error: auditErr } = await admin
    .from('audit_logs')
    .select('entity_id, created_at')
    .eq('business_id', accountId)
    .eq('entity_type', 'customer')
    .in('entity_id', customerIds)
    .order('created_at', { ascending: false })
    .limit(Math.max(customerIds.length * 5, 50));
  if (auditErr) throw new Error(auditErr.message);

  for (const row of auditRows ?? []) {
    const key = String(row.entity_id ?? '');
    const ts = row.created_at ? String(row.created_at) : '';
    if (!key || !ts || result.has(key)) continue;
    result.set(key, ts);
  }
  return result;
}

export async function listAccountCustomers(
  admin: SupabaseClient,
  params: ListAccountCustomersParams
): Promise<ListAccountCustomersResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const search = String(params.search ?? '').trim();
  const sort = normalizeSort(params.sort);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from('customers')
    .select(
      'id, name, email, company, account_number, created_at, updated_at, archived_at, anonymized_at',
      { count: 'exact' }
    )
    .eq('business_id', params.accountId);

  if (search) {
    const escaped = search.replace(/'/g, "''");
    const pattern = `'%${escaped}%'`;
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`);
  }

  if (sort === 'name_asc' || sort === 'name_desc') {
    query = query.order('name', { ascending: sort === 'name_asc' });
  } else {
    query = query.order('created_at', { ascending: sort === 'created_at_asc' });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const ids = rows.map((row) => String(row.id));

  const auditLastByCustomer = await loadLastActivityByCustomerId(admin, params.accountId, ids);

  const customers: AccountCustomerListItem[] = rows.map((row) => {
    const id = String(row.id);
    const displayName = String(row.company ?? '').trim() || String(row.name ?? '').trim() || 'Unnamed customer';
    const updatedAt = row.updated_at ? String(row.updated_at) : null;
    const lastAuditAt = auditLastByCustomer.get(id) ?? null;
    return {
      id,
      name: displayName,
      email: row.email ? String(row.email) : null,
      status: deriveCustomerStatus(row),
      created_at: String(row.created_at),
      last_activity_at: latestIso(updatedAt, lastAuditAt),
    };
  });

  const totalCount = Number(count ?? 0);
  return {
    account_id: params.accountId,
    total_count: totalCount,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(totalCount / pageSize)),
    customers,
  };
}

export async function getAccountCustomerDetail(
  admin: SupabaseClient,
  params: { accountId: string; customerId: string }
): Promise<AccountCustomerDetail | null> {
  const { data: row, error } = await admin
    .from('customers')
    .select(
      'id, business_id, account_number, name, email, company, preferred_currency_code, address_line1, address_line2, city, state, postal_code, country, country_code, phone, notes, archived_at, anonymized_at, created_at, updated_at'
    )
    .eq('id', params.customerId)
    .eq('business_id', params.accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;

  const auditLastByCustomer = await loadLastActivityByCustomerId(admin, params.accountId, [params.customerId]);
  const updatedAt = row.updated_at ? String(row.updated_at) : null;
  const lastAuditAt = auditLastByCustomer.get(params.customerId) ?? null;
  const fullName = String(row.name ?? '').trim();
  const company = row.company ? String(row.company) : null;

  return {
    id: String(row.id),
    account_id: String(row.business_id),
    name: company || fullName || 'Unnamed customer',
    full_name: fullName || '—',
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    company,
    status: deriveCustomerStatus(row),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_activity_at: latestIso(updatedAt, lastAuditAt),
    account_number: row.account_number ? String(row.account_number) : null,
    preferred_currency_code: row.preferred_currency_code ? String(row.preferred_currency_code) : null,
    address_line1: row.address_line1 ? String(row.address_line1) : null,
    address_line2: row.address_line2 ? String(row.address_line2) : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    postal_code: row.postal_code ? String(row.postal_code) : null,
    country: row.country ? String(row.country) : null,
    country_code: row.country_code ? String(row.country_code) : null,
    notes: row.notes ? String(row.notes) : null,
    archived_at: row.archived_at ? String(row.archived_at) : null,
    anonymized_at: row.anonymized_at ? String(row.anonymized_at) : null,
  };
}
