import type { SupabaseClient } from '@supabase/supabase-js';
import { countryDisplayNameFromIso } from '@/lib/location/resolve-country-input';
import { normalizeCountryCode } from '@/lib/location/normalizeCountryCode';

const MS_DAY = 86_400_000;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 15;
const MAX_RANGE_DAYS = 365;
const PAID_PLANS = new Set(['growth', 'professional', 'enterprise']);
const PAID_SUBSCRIPTION_STATUSES = new Set(['active']);

type GeoSortByInternal =
  | 'visitors_count'
  | 'registered_count'
  | 'paid_count'
  | 'revenue_total'
  | 'visitor_to_registered_rate'
  | 'registered_to_paid_rate';

type CountryBucket = {
  country_code: string | null;
  country_name: string;
  visitors_count: number;
  registered_count: number;
  paid_count: number;
  revenue_total: number;
  plan_counts: Map<string, number>;
  industry_counts: Map<string, number>;
};

type BusinessSnapshot = {
  id: string;
  owner_id: string;
  country: string | null;
  industry_label: string | null;
  industry_key: string | null;
  created_at: string;
};

type ProfileSnapshot = {
  id: string;
  billing_plan: string | null;
  subscription_status: string | null;
  plan_selection_status: string | null;
};

export type GeoConversionRow = {
  country_code: string | null;
  country_name: string;
  visitors_count: number;
  registered_count: number;
  paid_count: number;
  revenue_total: number;
  visitor_to_registered_rate: number;
  registered_to_paid_rate: number;
  top_subscription_plan: string;
  top_industry: string;
};

export type GeoConversionResponse = {
  period: {
    start_date: string;
    end_date: string;
    days: number;
    label: string;
  };
  sort: {
    sort_by: GeoSortByInternal;
    sort_order: 'asc' | 'desc';
    limit: number;
  };
  definitions: {
    visitors: string;
    registered: string;
    paid_customers: string;
  };
  rows: GeoConversionRow[];
};

export type ComputeGeoConversionInput = {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
  limit?: number | null;
  sortBy?: string | null;
  sortOrder?: string | null;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function clampLimit(value: number | null | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

function normalizeSortBy(value: string | null | undefined): GeoSortByInternal {
  const key = String(value ?? '').trim();
  if (key === 'visitors_count') return key;
  if (key === 'registered_count') return key;
  if (key === 'revenue_total') return key;
  if (key === 'visitor_to_registered_rate') return key;
  if (key === 'registered_to_paid_rate') return key;
  return 'paid_count';
}

function normalizeSortOrder(value: string | null | undefined): 'asc' | 'desc' {
  return String(value ?? '').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
}

function normalizePlanLabel(planRaw: string | null | undefined): string {
  const normalized = String(planRaw ?? '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  if (normalized === 'starter') return 'Starter';
  if (normalized === 'growth') return 'Growth';
  if (normalized === 'professional') return 'Professional';
  if (normalized === 'enterprise') return 'Enterprise';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeIndustryLabel(industryLabel: string | null | undefined, industryKey: string | null | undefined): string {
  const label = String(industryLabel ?? '').trim();
  if (label) return label;
  const key = String(industryKey ?? '').trim();
  if (!key) return 'Unknown';
  return key
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function pickTopValue(counts: Map<string, number>, emptyFallback: string): string {
  if (counts.size === 0) return emptyFallback;
  let bestLabel = '';
  let bestCount = -1;
  for (const [label, count] of counts.entries()) {
    if (count > bestCount) {
      bestLabel = label;
      bestCount = count;
    }
  }
  return bestLabel || emptyFallback;
}

function normalizeCountry(countryRaw: string | null | undefined): { country_code: string | null; country_name: string; key: string } {
  const trimmed = String(countryRaw ?? '').trim();
  if (!trimmed) {
    return { country_code: null, country_name: 'Unknown', key: 'unknown' };
  }
  const iso = normalizeCountryCode(trimmed);
  if (iso) {
    return {
      country_code: iso,
      country_name: countryDisplayNameFromIso(iso) ?? iso,
      key: `iso:${iso}`,
    };
  }
  return { country_code: null, country_name: trimmed, key: `raw:${trimmed.toLowerCase()}` };
}

function isBusinessPaid(profile: ProfileSnapshot | null | undefined): boolean {
  if (!profile) return false;
  const plan = String(profile.billing_plan ?? '').trim().toLowerCase();
  const status = String(profile.subscription_status ?? '').trim().toLowerCase();
  const planSelection = String(profile.plan_selection_status ?? '').trim().toUpperCase();
  if (planSelection === 'PAID_ACTIVE') return true;
  return PAID_PLANS.has(plan) && PAID_SUBSCRIPTION_STATUSES.has(status);
}

async function loadBusinesses(admin: SupabaseClient): Promise<BusinessSnapshot[]> {
  const rows: BusinessSnapshot[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('businesses')
      .select('id, owner_id, country, industry_label, industry_key, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      rows.push({
        id: String(row.id),
        owner_id: String(row.owner_id),
        country: row.country ? String(row.country) : null,
        industry_label: row.industry_label ? String(row.industry_label) : null,
        industry_key: row.industry_key ? String(row.industry_key) : null,
        created_at: String(row.created_at),
      });
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 300_000) break;
  }
  return rows;
}

async function loadProfilesByIds(admin: SupabaseClient, ids: string[]): Promise<Map<string, ProfileSnapshot>> {
  const out = new Map<string, ProfileSnapshot>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { data, error } = await admin
      .from('profiles')
      .select('id, billing_plan, subscription_status, plan_selection_status')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      out.set(String(row.id), {
        id: String(row.id),
        billing_plan: row.billing_plan ? String(row.billing_plan) : null,
        subscription_status: row.subscription_status ? String(row.subscription_status) : null,
        plan_selection_status: row.plan_selection_status ? String(row.plan_selection_status) : null,
      });
    }
  }
  return out;
}

async function loadVisitorBusinessIds(admin: SupabaseClient, startIso: string, endIso: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('product_usage_events')
      .select('business_id')
      .eq('kind', 'page_view')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) return ids;
      throw new Error(error.message);
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.business_id) ids.add(String(row.business_id));
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 300_000) break;
  }
  return ids;
}

async function loadRevenueByBusinessId(
  admin: SupabaseClient,
  startIso: string,
  endIso: string
): Promise<Map<string, number>> {
  const revenue = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('payments')
      .select('business_id, amount, status, created_at')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) return revenue;
      throw new Error(error.message);
    }
    if (!data?.length) break;
    for (const row of data) {
      const businessId = row.business_id ? String(row.business_id) : '';
      if (!businessId) continue;
      const status = String(row.status ?? 'succeeded').trim().toLowerCase();
      if (status && status !== 'succeeded') continue;
      const amountRaw = typeof row.amount === 'number' ? row.amount : Number(row.amount ?? 0);
      if (!Number.isFinite(amountRaw) || amountRaw <= 0) continue;
      revenue.set(businessId, (revenue.get(businessId) ?? 0) + amountRaw);
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 500_000) break;
  }
  return revenue;
}

function getPeriod(input: ComputeGeoConversionInput): { start: Date; end: Date; days: number } {
  const end = parseIsoDate(input.endDate) ?? new Date();
  const startParsed = parseIsoDate(input.startDate);
  if (startParsed) {
    const rawDays = Math.max(1, Math.ceil((end.getTime() - startParsed.getTime()) / MS_DAY));
    return {
      start: startParsed,
      end,
      days: Math.min(MAX_RANGE_DAYS, rawDays),
    };
  }
  const days = Math.min(MAX_RANGE_DAYS, Math.max(1, Math.floor(input.days ?? 30)));
  return {
    start: new Date(end.getTime() - days * MS_DAY),
    end,
    days,
  };
}

export async function computeGeoConversionAnalytics(
  admin: SupabaseClient,
  input: ComputeGeoConversionInput
): Promise<GeoConversionResponse> {
  const period = getPeriod(input);
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();
  const limit = clampLimit(input.limit);
  const sortBy = normalizeSortBy(input.sortBy);
  const sortOrder = normalizeSortOrder(input.sortOrder);

  const [businesses, visitorBusinessIds, revenueByBusinessId] = await Promise.all([
    loadBusinesses(admin),
    loadVisitorBusinessIds(admin, startIso, endIso),
    loadRevenueByBusinessId(admin, startIso, endIso),
  ]);

  const ownerIds = Array.from(new Set(businesses.map((biz) => biz.owner_id)));
  const profilesByOwnerId = await loadProfilesByIds(admin, ownerIds);
  const buckets = new Map<string, CountryBucket>();

  const ensureBucket = (countryRaw: string | null): CountryBucket => {
    const normalized = normalizeCountry(countryRaw);
    let bucket = buckets.get(normalized.key);
    if (!bucket) {
      bucket = {
        country_code: normalized.country_code,
        country_name: normalized.country_name,
        visitors_count: 0,
        registered_count: 0,
        paid_count: 0,
        revenue_total: 0,
        plan_counts: new Map<string, number>(),
        industry_counts: new Map<string, number>(),
      };
      buckets.set(normalized.key, bucket);
    }
    return bucket;
  };

  for (const biz of businesses) {
    const bucket = ensureBucket(biz.country);
    const profile = profilesByOwnerId.get(biz.owner_id);
    const createdAtMs = new Date(biz.created_at).getTime();
    const inRange = createdAtMs >= period.start.getTime() && createdAtMs < period.end.getTime();
    const paid = isBusinessPaid(profile);
    if (visitorBusinessIds.has(biz.id)) {
      bucket.visitors_count += 1;
    }
    if (inRange) {
      bucket.registered_count += 1;
      const industry = normalizeIndustryLabel(biz.industry_label, biz.industry_key);
      bucket.industry_counts.set(industry, (bucket.industry_counts.get(industry) ?? 0) + 1);
    }
    if (paid) {
      bucket.paid_count += 1;
      const plan = normalizePlanLabel(profile?.billing_plan);
      bucket.plan_counts.set(plan, (bucket.plan_counts.get(plan) ?? 0) + 1);
    }
    bucket.revenue_total += revenueByBusinessId.get(biz.id) ?? 0;
  }

  const rows: GeoConversionRow[] = Array.from(buckets.values()).map((bucket) => ({
    country_code: bucket.country_code,
    country_name: bucket.country_name,
    visitors_count: bucket.visitors_count,
    registered_count: bucket.registered_count,
    paid_count: bucket.paid_count,
    revenue_total: Number(bucket.revenue_total.toFixed(2)),
    visitor_to_registered_rate: rate(bucket.registered_count, bucket.visitors_count),
    registered_to_paid_rate: rate(bucket.paid_count, bucket.registered_count),
    top_subscription_plan: pickTopValue(bucket.plan_counts, 'No paid customers'),
    top_industry: pickTopValue(bucket.industry_counts, 'Unknown'),
  }));

  const direction = sortOrder === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const diff = (a[sortBy] as number) - (b[sortBy] as number);
    if (diff !== 0) return diff * direction;
    return a.country_name.localeCompare(b.country_name);
  });

  return {
    period: {
      start_date: period.start.toISOString(),
      end_date: period.end.toISOString(),
      days: period.days,
      label: `Last ${period.days} days`,
    },
    sort: { sort_by: sortBy, sort_order: sortOrder, limit },
    definitions: {
      visitors: 'Distinct workspaces with at least one product page view event in the selected period.',
      registered: 'New workspace registrations (business rows created) in the selected period.',
      paid_customers:
        'Workspaces with active paid subscription signals (plan_selection_status = PAID_ACTIVE, or paid billing_plan with active subscription_status).',
    },
    rows: rows.slice(0, limit),
  };
}
