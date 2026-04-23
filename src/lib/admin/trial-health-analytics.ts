import type { SupabaseClient } from '@supabase/supabase-js';

const MS_DAY = 86_400_000;
const MAX_RANGE_DAYS = 365;
const PAID_PLANS = new Set(['growth', 'professional', 'enterprise']);

export type TrialHealthPayload = {
  period: {
    start_date: string;
    end_date: string;
    days: number;
    label: string;
  };
  definitions: {
    active_trials: string;
    trials_started: string;
    trials_converted: string;
    conversion_rate: string;
    average_time_to_convert_days: string;
  };
  active_trials_count: number;
  trials_started_count: number;
  trials_converted_count: number;
  trial_to_paid_conversion_rate: number;
  average_time_to_convert_days: number | null;
};

export type ComputeTrialHealthInput = {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
};

type ProfileTrialRow = {
  id: string;
  created_at: string;
  selected_plan_at: string | null;
  subscription_status: string | null;
  billing_plan: string | null;
  plan_selection_status: string | null;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getPeriod(input: ComputeTrialHealthInput): { start: Date; end: Date; days: number } {
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

function isTrialingNow(row: ProfileTrialRow): boolean {
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  return status === 'trialing';
}

function isTrialStart(row: ProfileTrialRow): boolean {
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const selection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  return status === 'trialing' || selection === 'TRIAL_SELECTED';
}

function isPaid(row: ProfileTrialRow): boolean {
  const plan = String(row.billing_plan ?? '').trim().toLowerCase();
  const status = String(row.subscription_status ?? '').trim().toLowerCase();
  const selection = String(row.plan_selection_status ?? '').trim().toUpperCase();
  if (selection === 'PAID_ACTIVE') return true;
  return PAID_PLANS.has(plan) && status === 'active';
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function inRange(isoTimestamp: string, startIso: string, endIso: string): boolean {
  return isoTimestamp >= startIso && isoTimestamp < endIso;
}

/**
 * Cohort rule:
 * - Trials Started = profiles created in period with trial signal.
 * - Trials Converted = subset of those started-trial profiles that are paid now.
 * - Avg Time to Convert = created_at (trial start proxy) -> selected_plan_at for converted profiles with valid timestamps.
 */
export async function computeTrialHealthAnalytics(
  admin: SupabaseClient,
  input: ComputeTrialHealthInput
): Promise<TrialHealthPayload> {
  const period = getPeriod(input);
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();

  let activeTrials = 0;
  let trialsStarted = 0;
  let trialsConverted = 0;
  const conversionDurationsDays: number[] = [];

  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, created_at, selected_plan_at, subscription_status, billing_plan, plan_selection_status')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data as ProfileTrialRow[]) {
      if (isTrialingNow(row)) activeTrials += 1;

      const createdAt = String(row.created_at ?? '');
      if (!createdAt || !inRange(createdAt, startIso, endIso)) continue;
      if (!isTrialStart(row)) continue;

      trialsStarted += 1;
      if (!isPaid(row)) continue;
      trialsConverted += 1;

      const paidAtRaw = String(row.selected_plan_at ?? '');
      if (!paidAtRaw) continue;
      const createdMs = new Date(createdAt).getTime();
      const paidMs = new Date(paidAtRaw).getTime();
      if (!Number.isFinite(createdMs) || !Number.isFinite(paidMs) || paidMs < createdMs) continue;
      conversionDurationsDays.push((paidMs - createdMs) / MS_DAY);
    }

    if (data.length < pageSize) break;
    from += pageSize;
    if (from > 500_000) break;
  }

  const avgConvertDays =
    conversionDurationsDays.length > 0
      ? Number(
          (
            conversionDurationsDays.reduce((sum, value) => sum + value, 0) /
            conversionDurationsDays.length
          ).toFixed(1)
        )
      : null;

  return {
    period: {
      start_date: startIso,
      end_date: endIso,
      days: period.days,
      label: `Last ${period.days} days`,
    },
    definitions: {
      active_trials: 'Profiles currently in active trial state.',
      trials_started: 'Profiles created in the selected period with trial-start signal.',
      trials_converted: 'Started-trial profiles from this period that are now paid-active.',
      conversion_rate: 'Trials converted / trials started (selected period cohort).',
      average_time_to_convert_days:
        'Average days from profile creation (trial start proxy) to paid activation for converted trials.',
    },
    active_trials_count: activeTrials,
    trials_started_count: trialsStarted,
    trials_converted_count: trialsConverted,
    trial_to_paid_conversion_rate: rate(trialsConverted, trialsStarted),
    average_time_to_convert_days: avgConvertDays,
  };
}
