import type { SupabaseClient } from '@supabase/supabase-js';

const MS_DAY = 86_400_000;
const MAX_RANGE_DAYS = 365;
const PAID_PLANS = new Set(['growth', 'professional', 'enterprise']);

export type RetentionChurnPayload = {
  period: {
    start_date: string;
    end_date: string;
    days: number;
    label: string;
  };
  definitions: {
    active_customers: string;
    churned_customers: string;
    churn_rate: string;
    retention_rate: string;
  };
  active_customers_count: number;
  churned_customers_count: number;
  churn_rate: number;
  retention_rate: number;
};

export type ComputeRetentionChurnInput = {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
};

type ProfileRetentionRow = {
  billing_plan: string | null;
  subscription_status: string | null;
  plan_selection_status: string | null;
  subscriber_admin_deactivated_at: string | null;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getPeriod(input: ComputeRetentionChurnInput): { start: Date; end: Date; days: number } {
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

function isPaidActiveProfile(row: ProfileRetentionRow, nowIso: string): boolean {
  const plan = String(row.billing_plan ?? '').trim().toLowerCase();
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const selection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  const deactivatedAt = String(row.subscriber_admin_deactivated_at ?? '').trim();
  const notDeactivated = !deactivatedAt || deactivatedAt > nowIso;
  if (!notDeactivated) return false;
  if (selection === 'PAID_ACTIVE') return true;
  return PAID_PLANS.has(plan) && status === 'active';
}

function isPaidAtPeriodStart(row: ProfileRetentionRow, startIso: string): boolean {
  const plan = String(row.billing_plan ?? '').trim().toLowerCase();
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const selection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  const deactivatedAt = String(row.subscriber_admin_deactivated_at ?? '').trim();
  const wasActiveThroughStart = !deactivatedAt || deactivatedAt >= startIso;
  if (!wasActiveThroughStart) return false;
  if (selection === 'PAID_ACTIVE') return true;
  return PAID_PLANS.has(plan) && (status === 'active' || status === 'past_due' || status === 'trialing');
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

/**
 * Churn formula (subscription-customer based):
 * - baseline = customers paid-active at period start
 * - churned = baseline customers with subscriber_admin_deactivated_at within the period
 * - churn rate = churned / baseline
 * - retention rate = 1 - churn rate
 */
export async function computeRetentionChurnAnalytics(
  admin: SupabaseClient,
  input: ComputeRetentionChurnInput
): Promise<RetentionChurnPayload> {
  const period = getPeriod(input);
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();
  const nowIso = new Date().toISOString();

  let activeCustomersCount = 0;
  let baselineCustomers = 0;
  let churnedCustomers = 0;

  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('profiles')
      .select('billing_plan, subscription_status, plan_selection_status, subscriber_admin_deactivated_at')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data as ProfileRetentionRow[]) {
      if (isPaidActiveProfile(row, nowIso)) activeCustomersCount += 1;
      if (!isPaidAtPeriodStart(row, startIso)) continue;
      baselineCustomers += 1;
      const deactivatedAt = String(row.subscriber_admin_deactivated_at ?? '').trim();
      if (deactivatedAt && deactivatedAt >= startIso && deactivatedAt < endIso) churnedCustomers += 1;
    }

    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 500_000) break;
  }

  const churnRate = rate(churnedCustomers, baselineCustomers);
  const retentionRate = Number((100 - churnRate).toFixed(2));

  return {
    period: {
      start_date: startIso,
      end_date: endIso,
      days: period.days,
      label: `Last ${period.days} days`,
    },
    definitions: {
      active_customers: 'Customers currently in active paid subscription state.',
      churned_customers: 'Paid customers active at period start who deactivated during the selected period.',
      churn_rate: 'Churned customers / customers active at period start.',
      retention_rate: '100% - churn rate for the same baseline.',
    },
    active_customers_count: activeCustomersCount,
    churned_customers_count: churnedCustomers,
    churn_rate: churnRate,
    retention_rate: retentionRate,
  };
}
