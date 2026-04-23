import type { SupabaseClient } from '@supabase/supabase-js';
import { getPricingPlan, normalizeBillingPlan, type BillingPlan } from '@/lib/billing/plans';

const MS_DAY = 86_400_000;
const MAX_RANGE_DAYS = 365;
const PLAN_KEYS: BillingPlan[] = ['starter', 'growth', 'professional', 'enterprise'];

export type PlanPerformanceSortBy =
  | 'plan_name'
  | 'paid_customers_count'
  | 'revenue_total'
  | 'trial_to_paid_conversion_rate';

export type PlanPerformanceRow = {
  plan_key: BillingPlan;
  plan_name: string;
  paid_customers_count: number;
  revenue_total: number;
  trial_to_paid_conversion_rate: number;
};

export type PlanPerformancePayload = {
  period: {
    start_date: string;
    end_date: string;
    days: number;
    label: string;
  };
  sort: {
    sort_by: PlanPerformanceSortBy;
    sort_order: 'asc' | 'desc';
  };
  definitions: {
    paid_customers: string;
    revenue: string;
    trial_to_paid_conversion_rate: string;
  };
  plans: PlanPerformanceRow[];
};

export type ComputePlanPerformanceInput = {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
  sortBy?: string | null;
  sortOrder?: string | null;
};

type ProfileRow = {
  created_at: string;
  billing_plan: string | null;
  subscription_status: string | null;
  plan_selection_status: string | null;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getPeriod(input: ComputePlanPerformanceInput): { start: Date; end: Date; days: number } {
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

function normalizeSortBy(value: string | null | undefined): PlanPerformanceSortBy {
  const v = String(value ?? '').trim();
  if (v === 'plan_name') return v;
  if (v === 'paid_customers_count') return v;
  if (v === 'trial_to_paid_conversion_rate') return v;
  return 'revenue_total';
}

function normalizeSortOrder(value: string | null | undefined): 'asc' | 'desc' {
  return String(value ?? '').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function isPaidActive(row: ProfileRow): boolean {
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const planSelection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  const plan = normalizeBillingPlan(row.billing_plan);
  return planSelection === 'PAID_ACTIVE' || (plan !== 'starter' && status === 'active');
}

function isTrialStartSignal(row: ProfileRow): boolean {
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const planSelection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  return status === 'trialing' || planSelection === 'TRIAL_SELECTED';
}

function inPeriod(createdAt: string, startIso: string, endIso: string): boolean {
  return createdAt >= startIso && createdAt < endIso;
}

/**
 * Centralized plan performance aggregation:
 * - Paid customers = currently paid-active profiles on each plan.
 * - Revenue = estimated MRR from paid customer count * plan list monthly price.
 * - Trial→Paid = started-trial cohort in period that is now paid-active, grouped by current normalized plan.
 */
export async function computePlanPerformanceAnalytics(
  admin: SupabaseClient,
  input: ComputePlanPerformanceInput
): Promise<PlanPerformancePayload> {
  const period = getPeriod(input);
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();
  const sortBy = normalizeSortBy(input.sortBy);
  const sortOrder = normalizeSortOrder(input.sortOrder);

  const paidCounts = new Map<BillingPlan, number>(PLAN_KEYS.map((k) => [k, 0]));
  const trialStarts = new Map<BillingPlan, number>(PLAN_KEYS.map((k) => [k, 0]));
  const trialConverted = new Map<BillingPlan, number>(PLAN_KEYS.map((k) => [k, 0]));

  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('profiles')
      .select('created_at, billing_plan, subscription_status, plan_selection_status')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data as ProfileRow[]) {
      const plan = normalizeBillingPlan(row.billing_plan);
      if (isPaidActive(row)) {
        paidCounts.set(plan, (paidCounts.get(plan) ?? 0) + 1);
      }
      if (!row.created_at || !inPeriod(String(row.created_at), startIso, endIso)) continue;
      if (!isTrialStartSignal(row)) continue;
      trialStarts.set(plan, (trialStarts.get(plan) ?? 0) + 1);
      if (isPaidActive(row)) {
        trialConverted.set(plan, (trialConverted.get(plan) ?? 0) + 1);
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 500_000) break;
  }

  const plans: PlanPerformanceRow[] = PLAN_KEYS.map((planKey) => {
    const paidCount = paidCounts.get(planKey) ?? 0;
    const trialStartCount = trialStarts.get(planKey) ?? 0;
    const convertedCount = trialConverted.get(planKey) ?? 0;
    const monthlyCents = getPricingPlan(planKey).priceMonthlyCents;
    const revenueTotal = Number(((paidCount * monthlyCents) / 100).toFixed(2));
    return {
      plan_key: planKey,
      plan_name: getPricingPlan(planKey).name,
      paid_customers_count: paidCount,
      revenue_total: revenueTotal,
      trial_to_paid_conversion_rate: rate(convertedCount, trialStartCount),
    };
  });

  const direction = sortOrder === 'asc' ? 1 : -1;
  plans.sort((a, b) => {
    if (sortBy === 'plan_name') return a.plan_name.localeCompare(b.plan_name) * direction;
    const diff = (a[sortBy] as number) - (b[sortBy] as number);
    if (diff !== 0) return diff * direction;
    return a.plan_name.localeCompare(b.plan_name);
  });

  return {
    period: {
      start_date: startIso,
      end_date: endIso,
      days: period.days,
      label: `Last ${period.days} days`,
    },
    sort: {
      sort_by: sortBy,
      sort_order: sortOrder,
    },
    definitions: {
      paid_customers: 'Current paid-active customers on each normalized plan.',
      revenue: 'Estimated MRR by plan from paid customers × plan monthly list price.',
      trial_to_paid_conversion_rate: 'Converted trial starts / trial starts for the selected period cohort.',
    },
    plans,
  };
}
