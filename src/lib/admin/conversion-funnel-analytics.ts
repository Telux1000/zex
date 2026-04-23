import type { SupabaseClient } from '@supabase/supabase-js';

const MS_DAY = 86_400_000;
const MAX_RANGE_DAYS = 365;
const PAID_PLANS = new Set(['growth', 'professional', 'enterprise']);

export type ConversionFunnelPayload = {
  period: {
    start_date: string;
    end_date: string;
    days: number;
    label: string;
  };
  definitions: {
    visitors: string;
    signups: string;
    trial: string;
    paid: string;
  };
  visitors_count: number;
  signups_count: number;
  trial_count: number;
  paid_count: number;
  visitor_to_signup_rate: number;
  signup_to_trial_rate: number;
  trial_to_paid_rate: number;
  visitor_to_paid_rate: number;
};

export type ComputeConversionFunnelInput = {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getPeriod(input: ComputeConversionFunnelInput): { start: Date; end: Date; days: number } {
  const end = parseIsoDate(input.endDate) ?? new Date();
  const explicitStart = parseIsoDate(input.startDate);
  if (explicitStart) {
    const days = Math.max(1, Math.min(MAX_RANGE_DAYS, Math.ceil((end.getTime() - explicitStart.getTime()) / MS_DAY)));
    return { start: explicitStart, end, days };
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

function isPaidProfile(row: {
  billing_plan?: string | null;
  subscription_status?: string | null;
  plan_selection_status?: string | null;
}): boolean {
  const plan = String(row.billing_plan ?? '').trim().toLowerCase();
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const selection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  if (selection === 'PAID_ACTIVE') return true;
  return PAID_PLANS.has(plan) && status === 'active';
}

function isTrialProfile(row: {
  subscription_status?: string | null;
  plan_selection_status?: string | null;
}): boolean {
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const selection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  return status === 'trialing' || selection === 'TRIAL_SELECTED';
}

async function loadVisitorsCount(admin: SupabaseClient, startIso: string, endIso: string): Promise<number> {
  const businessIds = new Set<string>();
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
      if (error.code === '42P01' || /does not exist/i.test(error.message)) return 0;
      throw new Error(error.message);
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.business_id) businessIds.add(String(row.business_id));
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 300_000) break;
  }
  return businessIds.size;
}

export async function computeConversionFunnelAnalytics(
  admin: SupabaseClient,
  input: ComputeConversionFunnelInput
): Promise<ConversionFunnelPayload> {
  const period = getPeriod(input);
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();

  const visitorsPromise = loadVisitorsCount(admin, startIso, endIso);
  const signupsPromise = admin
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  const profilesPromise = admin
    .from('profiles')
    .select('created_at, selected_plan_at, subscription_status, billing_plan, plan_selection_status')
    .or(`and(selected_plan_at.gte.${startIso},selected_plan_at.lt.${endIso}),and(created_at.gte.${startIso},created_at.lt.${endIso})`);

  const [visitorsCount, signupsRes, profilesRes] = await Promise.all([
    visitorsPromise,
    signupsPromise,
    profilesPromise,
  ]);

  if (signupsRes.error) throw new Error(signupsRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);

  let trialCount = 0;
  let paidCount = 0;
  for (const row of profilesRes.data ?? []) {
    const selectedAt = row.selected_plan_at ? new Date(String(row.selected_plan_at)) : null;
    const createdAt = row.created_at ? new Date(String(row.created_at)) : null;
    const anchor = selectedAt && !Number.isNaN(selectedAt.getTime()) ? selectedAt : createdAt;
    if (!anchor || Number.isNaN(anchor.getTime())) continue;
    const inRange = anchor.toISOString() >= startIso && anchor.toISOString() < endIso;
    if (!inRange) continue;
    if (isTrialProfile(row)) trialCount += 1;
    if (isPaidProfile(row)) paidCount += 1;
  }

  const signupsCount = signupsRes.count ?? 0;

  return {
    period: {
      start_date: startIso,
      end_date: endIso,
      days: period.days,
      label: `Last ${period.days} days`,
    },
    definitions: {
      visitors: 'Distinct workspaces with at least one product page-view event in the selected period.',
      signups: 'Workspaces created in the selected period.',
      trial: 'Profiles that started trial selection in the selected period.',
      paid: 'Profiles with paid activation in the selected period.',
    },
    visitors_count: visitorsCount,
    signups_count: signupsCount,
    trial_count: trialCount,
    paid_count: paidCount,
    visitor_to_signup_rate: rate(signupsCount, visitorsCount),
    signup_to_trial_rate: rate(trialCount, signupsCount),
    trial_to_paid_rate: rate(paidCount, trialCount),
    visitor_to_paid_rate: rate(paidCount, visitorsCount),
  };
}
