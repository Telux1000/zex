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

  let auditLastByCustomer = new Map<string, string>();
  if (ids.length > 0) {
    const { data: auditRows, error: auditErr } = await admin
      .from('audit_logs')
      .select('entity_id, created_at')
      .eq('business_id', params.accountId)
      .eq('entity_type', 'customer')
      .in('entity_id', ids)
      .order('created_at', { ascending: false })
      .limit(Math.max(pageSize * 5, 50));
    if (auditErr) throw new Error(auditErr.message);
    for (const row of auditRows ?? []) {
      const key = String(row.entity_id ?? '');
      const ts = row.created_at ? String(row.created_at) : '';
      if (!key || !ts || auditLastByCustomer.has(key)) continue;
      auditLastByCustomer.set(key, ts);
    }
  }

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
