import type { SupabaseClient } from '@supabase/supabase-js';

const MS_DAY = 86_400_000;
const MAX_RANGE_DAYS = 365;
const ENGAGED_EVENTS_THRESHOLD = 5;
const ENGAGED_DAYS_THRESHOLD = 3;
const KEY_ACTIVITY_TYPES = [
  'invoice_created',
  'invoice_sent',
  'invoice_paid',
  'payment_received',
  'customer_created',
  'customer_added',
  'quote_created',
  'expense_created',
  'ai_insight_generated',
] as const;

type CustomerEngagementInput = {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
};

type BusinessActivityAgg = {
  events: number;
  dayKeys: Set<string>;
};

export type CustomerEngagementPayload = {
  period: {
    start_date: string;
    end_date: string;
    days: number;
    label: string;
  };
  definitions: {
    active_customers: string;
    highly_engaged_customers: string;
    at_risk_customers: string;
    average_engagement_frequency: string;
    repeat_usage_rate: string;
  };
  active_customers_count: number;
  highly_engaged_customers_count: number;
  at_risk_customers_count: number;
  average_engagement_frequency: number;
  repeat_usage_rate: number;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getPeriod(input: CustomerEngagementInput): { start: Date; end: Date; days: number } {
  const end = parseIsoDate(input.endDate) ?? new Date();
  const startParsed = parseIsoDate(input.startDate);
  if (startParsed) {
    const days = Math.max(1, Math.min(MAX_RANGE_DAYS, Math.ceil((end.getTime() - startParsed.getTime()) / MS_DAY)));
    return { start: startParsed, end, days };
  }
  const days = Math.max(1, Math.min(MAX_RANGE_DAYS, Math.floor(input.days ?? 30)));
  return {
    start: new Date(end.getTime() - days * MS_DAY),
    end,
    days,
  };
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

async function loadEngagedEverBusinessIds(admin: SupabaseClient): Promise<Set<string>> {
  const set = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('activity_events')
      .select('business_id')
      .in('type', [...KEY_ACTIVITY_TYPES])
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      if (row.business_id) set.add(String(row.business_id));
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 500_000) break;
  }
  return set;
}

async function loadPeriodActivityByBusiness(
  admin: SupabaseClient,
  startIso: string,
  endIso: string
): Promise<Map<string, BusinessActivityAgg>> {
  const map = new Map<string, BusinessActivityAgg>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('activity_events')
      .select('business_id, created_at')
      .in('type', [...KEY_ACTIVITY_TYPES])
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const businessId = row.business_id ? String(row.business_id) : '';
      const createdAt = row.created_at ? String(row.created_at) : '';
      if (!businessId || !createdAt) continue;
      const dayKey = createdAt.slice(0, 10);
      let agg = map.get(businessId);
      if (!agg) {
        agg = { events: 0, dayKeys: new Set<string>() };
        map.set(businessId, agg);
      }
      agg.events += 1;
      agg.dayKeys.add(dayKey);
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 500_000) break;
  }
  return map;
}

/**
 * Engagement segmentation (centralized):
 * - Active = account with >=1 key activity event in period.
 * - Highly engaged = active and (>=5 key events OR activity on >=3 distinct days).
 * - At risk = account has historical key activity but zero key activity in selected period.
 */
export async function computeCustomerEngagementAnalytics(
  admin: SupabaseClient,
  input: CustomerEngagementInput
): Promise<CustomerEngagementPayload> {
  const period = getPeriod(input);
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();

  const [engagedEverIds, periodAgg] = await Promise.all([
    loadEngagedEverBusinessIds(admin),
    loadPeriodActivityByBusiness(admin, startIso, endIso),
  ]);

  let activeCustomers = 0;
  let highlyEngaged = 0;
  let repeatUsers = 0;
  let totalEvents = 0;
  for (const agg of periodAgg.values()) {
    if (agg.events <= 0) continue;
    activeCustomers += 1;
    totalEvents += agg.events;
    if (agg.events >= 2) repeatUsers += 1;
    if (agg.events >= ENGAGED_EVENTS_THRESHOLD || agg.dayKeys.size >= ENGAGED_DAYS_THRESHOLD) {
      highlyEngaged += 1;
    }
  }

  let atRisk = 0;
  for (const businessId of engagedEverIds) {
    if (!periodAgg.has(businessId)) atRisk += 1;
  }

  return {
    period: {
      start_date: startIso,
      end_date: endIso,
      days: period.days,
      label: `Last ${period.days} days`,
    },
    definitions: {
      active_customers: 'Accounts with at least one meaningful product action in the selected period.',
      highly_engaged_customers: 'Active accounts with strong usage intensity (>=5 key actions or >=3 active days).',
      at_risk_customers: 'Previously engaged accounts with no meaningful activity in the selected period.',
      average_engagement_frequency: 'Average key actions per active account in the selected period.',
      repeat_usage_rate: 'Active accounts with 2+ key actions / active accounts.',
    },
    active_customers_count: activeCustomers,
    highly_engaged_customers_count: highlyEngaged,
    at_risk_customers_count: atRisk,
    average_engagement_frequency: activeCustomers > 0 ? Number((totalEvents / activeCustomers).toFixed(2)) : 0,
    repeat_usage_rate: rate(repeatUsers, activeCustomers),
  };
}
