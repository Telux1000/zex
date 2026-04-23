import type { SupabaseClient } from '@supabase/supabase-js';

const PAID_PLANS = new Set(['growth', 'professional', 'enterprise']);
const DEFAULT_PLAN = 'starter';

export type SubscriptionMixItem = {
  plan_key: string;
  plan_name: string;
  count: number;
  percentage: number;
};

export type SubscriptionMixAnalytics = {
  trial_mix: SubscriptionMixItem[];
  paid_mix: SubscriptionMixItem[];
};

type ProfileLite = {
  billing_plan: string | null;
  subscription_status: string | null;
  plan_selection_status: string | null;
  created_at: string;
};

function normalizePlanKey(raw: string | null | undefined): string {
  const key = String(raw ?? '').trim().toLowerCase();
  return key || DEFAULT_PLAN;
}

function planDisplayName(planKey: string): string {
  switch (planKey) {
    case 'starter':
      return 'Starter';
    case 'growth':
      return 'Growth';
    case 'professional':
      return 'Professional';
    case 'enterprise':
      return 'Enterprise';
    default:
      return planKey.charAt(0).toUpperCase() + planKey.slice(1);
  }
}

function inWindow(createdAt: string, startIso: string, endIso: string): boolean {
  const ts = new Date(createdAt).toISOString();
  return ts >= startIso && ts < endIso;
}

function buildMixRows(counts: Map<string, number>): SubscriptionMixItem[] {
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  return Array.from(counts.entries())
    .map(([planKey, count]) => ({
      plan_key: planKey,
      plan_name: planDisplayName(planKey),
      count,
      percentage: Math.round((count / total) * 10_000) / 100,
    }))
    .sort((a, b) => b.count - a.count || a.plan_name.localeCompare(b.plan_name));
}

function isTrialProfile(row: ProfileLite): boolean {
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const selection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  return status === 'trialing' || selection === 'TRIAL_SELECTED';
}

function isPaidProfile(row: ProfileLite): boolean {
  const plan = normalizePlanKey(row.billing_plan);
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const selection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  if (selection === 'PAID_ACTIVE') return true;
  return PAID_PLANS.has(plan) && status === 'active';
}

export async function loadSubscriptionMixAnalytics(
  admin: SupabaseClient,
  startIso: string,
  endIso: string
): Promise<SubscriptionMixAnalytics> {
  const trialCounts = new Map<string, number>();
  const paidCounts = new Map<string, number>();
  let offset = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await admin
      .from('profiles')
      .select('billing_plan, subscription_status, plan_selection_status, created_at')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data as ProfileLite[]) {
      if (!inWindow(row.created_at, startIso, endIso)) continue;
      const planKey = normalizePlanKey(row.billing_plan);
      if (isTrialProfile(row)) {
        trialCounts.set(planKey, (trialCounts.get(planKey) ?? 0) + 1);
      }
      if (isPaidProfile(row)) {
        paidCounts.set(planKey, (paidCounts.get(planKey) ?? 0) + 1);
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
    if (offset > 500_000) break;
  }

  return {
    trial_mix: buildMixRows(trialCounts),
    paid_mix: buildMixRows(paidCounts),
  };
}
