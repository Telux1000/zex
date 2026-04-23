import type { SupabaseClient } from '@supabase/supabase-js';

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;
const MAX_RANGE_DAYS = 365;

export type ActivationTimeToValuePayload = {
  period: {
    start_date: string;
    end_date: string;
    days: number;
    label: string;
  };
  definitions: {
    new_signups: string;
    onboarding_completed: string;
    activated_users: string;
    activation_rate: string;
    average_time_to_value_hours: string;
  };
  new_signups_count: number;
  onboarding_completed_count: number;
  activated_users_count: number;
  activation_rate: number;
  average_time_to_value_hours: number | null;
};

export type ComputeActivationInput = {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
};

type SignupRow = {
  id: string;
  created_at: string;
  onboarding_completed_at: string | null;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getPeriod(input: ComputeActivationInput): { start: Date; end: Date; days: number } {
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

function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

async function loadEarliestActionByBusiness(
  admin: SupabaseClient,
  table: 'customers' | 'invoices',
  businessIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (businessIds.length === 0) return out;

  for (let i = 0; i < businessIds.length; i += 150) {
    const chunk = businessIds.slice(i, i + 150);
    const { data, error } = await admin
      .from(table)
      .select('business_id, created_at')
      .in('business_id', chunk)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const businessId = row.business_id ? String(row.business_id) : '';
      const createdAt = row.created_at ? String(row.created_at) : '';
      if (!businessId || !createdAt) continue;
      const existing = out.get(businessId) ?? null;
      out.set(businessId, minIso(existing, createdAt) ?? createdAt);
    }
  }
  return out;
}

/**
 * Activation definition (centralized):
 * - Signup cohort: profiles created in selected period.
 * - Onboarding completed: cohort users with onboarding_completed_at set.
 * - Activated user: cohort user whose owned business reaches first key action:
 *   first customer created OR first invoice created.
 * - Time to value: signup created_at -> earliest key action timestamp.
 */
export async function computeActivationTimeToValueAnalytics(
  admin: SupabaseClient,
  input: ComputeActivationInput
): Promise<ActivationTimeToValuePayload> {
  const period = getPeriod(input);
  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();

  const { data: signups, error: signupsErr } = await admin
    .from('profiles')
    .select('id, created_at, onboarding_completed_at')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });
  if (signupsErr) throw new Error(signupsErr.message);

  const signupRows = (signups ?? []) as SignupRow[];
  const signupCount = signupRows.length;
  if (signupCount === 0) {
    return {
      period: {
        start_date: startIso,
        end_date: endIso,
        days: period.days,
        label: `Last ${period.days} days`,
      },
      definitions: {
        new_signups: 'Profiles created in the selected period.',
        onboarding_completed: 'Signup cohort users with onboarding completion recorded.',
        activated_users: 'Signup cohort users who created first customer or first invoice.',
        activation_rate: 'Activated users / new signups.',
        average_time_to_value_hours: 'Average hours from signup to first key action (activated users only).',
      },
      new_signups_count: 0,
      onboarding_completed_count: 0,
      activated_users_count: 0,
      activation_rate: 0,
      average_time_to_value_hours: null,
    };
  }

  const signupById = new Map<string, SignupRow>();
  for (const row of signupRows) signupById.set(String(row.id), row);

  const userIds = Array.from(signupById.keys());
  const ownerToBusinessIds = new Map<string, string[]>();
  for (let i = 0; i < userIds.length; i += 150) {
    const chunk = userIds.slice(i, i + 150);
    const { data, error } = await admin
      .from('businesses')
      .select('id, owner_id')
      .in('owner_id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const ownerId = String(row.owner_id ?? '');
      const businessId = String(row.id ?? '');
      if (!ownerId || !businessId) continue;
      const arr = ownerToBusinessIds.get(ownerId) ?? [];
      arr.push(businessId);
      ownerToBusinessIds.set(ownerId, arr);
    }
  }

  const allBusinessIds = Array.from(new Set(Array.from(ownerToBusinessIds.values()).flat()));
  const [firstCustomerByBiz, firstInvoiceByBiz] = await Promise.all([
    loadEarliestActionByBusiness(admin, 'customers', allBusinessIds),
    loadEarliestActionByBusiness(admin, 'invoices', allBusinessIds),
  ]);

  let onboardingCompletedCount = 0;
  let activatedUsersCount = 0;
  const timeToValueHours: number[] = [];

  for (const signup of signupRows) {
    const userId = String(signup.id);
    if (signup.onboarding_completed_at) onboardingCompletedCount += 1;

    const businessIds = ownerToBusinessIds.get(userId) ?? [];
    let firstActivationAt: string | null = null;
    for (const businessId of businessIds) {
      firstActivationAt = minIso(firstActivationAt, firstCustomerByBiz.get(businessId) ?? null);
      firstActivationAt = minIso(firstActivationAt, firstInvoiceByBiz.get(businessId) ?? null);
    }
    if (!firstActivationAt) continue;

    const signupMs = new Date(signup.created_at).getTime();
    const activationMs = new Date(firstActivationAt).getTime();
    if (!Number.isFinite(signupMs) || !Number.isFinite(activationMs) || activationMs < signupMs) continue;

    activatedUsersCount += 1;
    timeToValueHours.push((activationMs - signupMs) / MS_HOUR);
  }

  const avgHours =
    timeToValueHours.length > 0
      ? Number((timeToValueHours.reduce((sum, value) => sum + value, 0) / timeToValueHours.length).toFixed(1))
      : null;

  return {
    period: {
      start_date: startIso,
      end_date: endIso,
      days: period.days,
      label: `Last ${period.days} days`,
    },
    definitions: {
      new_signups: 'Profiles created in the selected period.',
      onboarding_completed: 'Signup cohort users with onboarding completion recorded.',
      activated_users: 'Signup cohort users who created first customer or first invoice.',
      activation_rate: 'Activated users / new signups.',
      average_time_to_value_hours: 'Average hours from signup to first key action (activated users only).',
    },
    new_signups_count: signupCount,
    onboarding_completed_count: onboardingCompletedCount,
    activated_users_count: activatedUsersCount,
    activation_rate: rate(activatedUsersCount, signupCount),
    average_time_to_value_hours: avgHours,
  };
}
