type GenericRow = Record<string, unknown>;

const DAY_MS = 86_400_000;

export type NormalizedSubscriptionSnapshot = {
  businessId: string;
  status: string | null;
  trialEndIso: string | null;
  currentPeriodEndIso: string | null;
  cancelledAtIso: string | null;
  isTrialFlag: boolean;
  updatedAtIso: string | null;
  raw: GenericRow;
};

/** Full calendar days remaining until the instant (ceil); 0 on/after end; null if unknown. */
export function ceilingDaysLeftUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const diffMs = end - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / DAY_MS);
}

export type ResolveBusinessIdFn = (row: GenericRow) => string | null;

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function firstString(row: GenericRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(row[key]);
    if (value) return value;
  }
  return null;
}

function firstDateString(row: GenericRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) return value;
    if (typeof value === 'number') {
      const ms = value > 10_000_000_000 ? value : value * 1000;
      const iso = new Date(ms).toISOString();
      if (!Number.isNaN(new Date(iso).getTime())) return iso;
    }
  }
  return null;
}

function firstBoolean(row: GenericRow, keys: string[]): boolean {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.toLowerCase();
      if (v === 'true') return true;
      if (v === 'false') return false;
    }
    if (typeof value === 'number') return value !== 0;
  }
  return false;
}

export function normalizeSubscriptionStatus(status: string | null): string | null {
  if (!status) return null;
  return status.trim().toLowerCase();
}

export function computeDerivedTrialEndsAt(startedAtIso: string | null, trialDays = 14): string | null {
  if (!startedAtIso) return null;
  const started = new Date(startedAtIso);
  if (Number.isNaN(started.getTime())) return null;
  const trialEnd = new Date(started);
  trialEnd.setDate(trialEnd.getDate() + trialDays);
  return trialEnd.toISOString();
}

export function isTrialEndInFuture(trialEndIso: string | null): boolean {
  if (!trialEndIso) return false;
  const trialEnd = new Date(trialEndIso).getTime();
  return !Number.isNaN(trialEnd) && trialEnd > Date.now();
}

export function isSubscriptionCancelled(snapshot: {
  status: string | null;
  cancelledAtIso: string | null;
}): boolean {
  const status = normalizeSubscriptionStatus(snapshot.status);
  return Boolean(snapshot.cancelledAtIso) || status === 'canceled' || status === 'cancelled';
}

export function isSubscriptionTrialing(snapshot: {
  status: string | null;
  trialEndIso: string | null;
  cancelledAtIso: string | null;
  isTrialFlag: boolean;
}): boolean {
  if (isSubscriptionCancelled(snapshot)) return false;
  const status = normalizeSubscriptionStatus(snapshot.status);
  if (status === 'trialing') return true;
  if (snapshot.trialEndIso) {
    const trialEnd = new Date(snapshot.trialEndIso).getTime();
    if (!Number.isNaN(trialEnd) && trialEnd > Date.now()) return true;
  }
  return snapshot.isTrialFlag;
}

export function pickLatestSubscriptionByBusiness(
  rows: GenericRow[],
  resolveBusinessId?: ResolveBusinessIdFn
): Map<string, NormalizedSubscriptionSnapshot> {
  const byBusiness = new Map<string, NormalizedSubscriptionSnapshot>();

  for (const row of rows) {
    const businessId =
      resolveBusinessId?.(row) ??
      firstString(row, ['business_id', 'account_id', 'workspace_id', 'tenant_id', 'company_id']);
    if (!businessId) continue;

    const snapshot: NormalizedSubscriptionSnapshot = {
      businessId,
      status: firstString(row, ['status', 'subscription_status']),
      trialEndIso: firstDateString(row, ['trial_end', 'trial_ends_at', 'trial_end_at']),
      currentPeriodEndIso: firstDateString(row, ['current_period_end', 'current_period_ends_at', 'period_end', 'renews_at']),
      cancelledAtIso: firstDateString(row, ['canceled_at', 'cancelled_at', 'cancel_at', 'ended_at']),
      isTrialFlag: firstBoolean(row, ['is_trial', 'on_trial']),
      updatedAtIso: firstDateString(row, ['updated_at', 'created_at']),
      raw: row,
    };

    const prev = byBusiness.get(businessId);
    if (!prev) {
      byBusiness.set(businessId, snapshot);
      continue;
    }

    const prevTime = prev.updatedAtIso ? new Date(prev.updatedAtIso).getTime() : 0;
    const nextTime = snapshot.updatedAtIso ? new Date(snapshot.updatedAtIso).getTime() : 0;
    if (nextTime >= prevTime) byBusiness.set(businessId, snapshot);
  }

  return byBusiness;
}
