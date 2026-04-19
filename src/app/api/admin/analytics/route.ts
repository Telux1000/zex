import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { PAGE_SECTION_KEYS, PAGE_SECTION_LABELS } from '@/lib/product-usage/allowed-keys';

const PLAN_MRR: Record<string, number> = {
  starter: 0,
  growth: 49,
  professional: 129,
  enterprise: 399,
};

const PLAN_ORDER = ['starter', 'growth', 'professional', 'enterprise'] as const;

const MS_DAY = 86_400_000;
const INACTIVE_THRESHOLD_DAYS = 30;
const TRIAL_ENDING_SOON_DAYS = 7;

function iso(d: Date): string {
  return d.toISOString();
}

/** `YYYY-MM-DD` in UTC (for snapshot keys). */
function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Distinct business IDs with at least one activity event in [start, end). Paginates until window exhausted. */
async function distinctBusinessIdsInWindow(
  admin: SupabaseClient,
  startIso: string,
  endIso: string,
  maxRows: number
): Promise<{ ids: string[]; capped: boolean }> {
  const set = new Set<string>();
  let from = 0;
  const pageSize = 1000;
  let capped = false;
  for (;;) {
    const { data, error } = await admin
      .from('activity_events')
      .select('business_id')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      if (row.business_id) set.add(String(row.business_id));
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from >= maxRows) {
      capped = true;
      break;
    }
  }
  return { ids: Array.from(set), capped };
}

async function countUsersOnBusinesses(admin: SupabaseClient, businessIds: string[]): Promise<number> {
  if (businessIds.length === 0) return 0;
  const userIds = new Set<string>();
  for (const ids of chunk(businessIds, 80)) {
    const [{ data: businesses, error: e1 }, { data: members, error: e2 }] = await Promise.all([
      admin.from('businesses').select('owner_id').in('id', ids),
      admin.from('business_members').select('user_id').in('business_id', ids),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    for (const b of businesses ?? []) {
      if (b.owner_id) userIds.add(String(b.owner_id));
    }
    for (const m of members ?? []) {
      if (m.user_id) userIds.add(String(m.user_id));
    }
  }
  return userIds.size;
}

async function loadSubscriptionMix(admin: SupabaseClient): Promise<{
  subscription_counts: Record<string, number>;
  mrr: number;
}> {
  const subscription_counts: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;
  let mrr = 0;
  for (;;) {
    const { data, error } = await admin
      .from('profiles')
      .select('billing_plan')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const plan = String(row.billing_plan ?? 'starter').toLowerCase();
      subscription_counts[plan] = (subscription_counts[plan] ?? 0) + 1;
      mrr += PLAN_MRR[plan] ?? 0;
    }
    if (data.length < pageSize) break;
    offset += pageSize;
    if (offset > 500_000) break;
  }
  return { subscription_counts, mrr };
}

/** Distinct businesses that have ever logged product activity (for “no usage” signal). */
async function distinctBusinessIdsWithAnyActivity(admin: SupabaseClient, maxRows: number): Promise<{ size: number; capped: boolean }> {
  const set = new Set<string>();
  let from = 0;
  const pageSize = 1000;
  let capped = false;
  for (;;) {
    const { data, error } = await admin
      .from('activity_events')
      .select('business_id')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      if (row.business_id) set.add(String(row.business_id));
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from >= maxRows) {
      capped = true;
      break;
    }
  }
  return { size: set.size, capped };
}

type PageViewAgg = { visits: number; users: Set<string> };

async function aggregatePageViews(
  admin: SupabaseClient,
  startIso: string,
  endIso: string,
  maxRows: number
): Promise<{ bySection: Map<string, PageViewAgg>; capped: boolean; missingTable: boolean }> {
  const bySection = new Map<string, PageViewAgg>();
  let from = 0;
  const pageSize = 1000;
  let capped = false;
  for (;;) {
    const { data, error } = await admin
      .from('product_usage_events')
      .select('target_key, user_id')
      .eq('kind', 'page_view')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) {
        return { bySection: new Map(), capped: false, missingTable: true };
      }
      throw new Error(error.message);
    }
    if (!data?.length) break;
    for (const row of data) {
      const key = String(row.target_key ?? '');
      const uid = String(row.user_id ?? '');
      if (!key) continue;
      let a = bySection.get(key);
      if (!a) {
        a = { visits: 0, users: new Set<string>() };
        bySection.set(key, a);
      }
      a.visits += 1;
      if (uid) a.users.add(uid);
    }
    if (data.length < pageSize) break;
    from += pageSize;
    if (from >= maxRows) {
      capped = true;
      break;
    }
  }
  return { bySection, capped, missingTable: false };
}

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  const { supabase, user, adminRole } = gate;
  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const now = Date.now();
  const currentStart = new Date(now - INACTIVE_THRESHOLD_DAYS * MS_DAY);
  const currentEnd = new Date(now);
  const prevStart = new Date(now - 2 * INACTIVE_THRESHOLD_DAYS * MS_DAY);
  const prevEnd = currentStart;

  const currentStartIso = iso(currentStart);
  const currentEndIso = iso(currentEnd);
  const prevStartIso = iso(prevStart);
  const prevEndIso = iso(prevEnd);

  const trialEndSoonUntil = new Date(now + TRIAL_ENDING_SOON_DAYS * MS_DAY);

  try {
    const [
      usersCountRes,
      businessesCountRes,
      mix,
      curBiz,
      prevBiz,
      aiCurRes,
      aiPrevRes,
      remCurRes,
      remPrevRes,
      schCurRes,
      schPrevRes,
      invCurRes,
      invPrevRes,
      pastDueRes,
      trialSoonRes,
      everActivity,
    ] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('businesses').select('id', { count: 'exact', head: true }),
      loadSubscriptionMix(admin),
      distinctBusinessIdsInWindow(admin, currentStartIso, currentEndIso, 100_000),
      distinctBusinessIdsInWindow(admin, prevStartIso, prevEndIso, 100_000),
      admin
        .from('activity_events')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'ai_insight_generated')
        .gte('created_at', currentStartIso)
        .lt('created_at', currentEndIso),
      admin
        .from('activity_events')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'ai_insight_generated')
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso),
      admin
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'reminder_sent')
        .gte('created_at', currentStartIso)
        .lt('created_at', currentEndIso),
      admin
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'reminder_sent')
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso),
      admin
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .not('scheduled_send_at', 'is', null)
        .gte('created_at', currentStartIso)
        .lt('created_at', currentEndIso),
      admin
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .not('scheduled_send_at', 'is', null)
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso),
      admin
        .from('activity_events')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'invoice_created')
        .gte('created_at', currentStartIso)
        .lt('created_at', currentEndIso),
      admin
        .from('activity_events')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'invoice_created')
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso),
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_status', 'past_due'),
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_status', 'trialing')
        .not('trial_ends_at', 'is', null)
        .gt('trial_ends_at', iso(new Date(now)))
        .lte('trial_ends_at', iso(trialEndSoonUntil)),
      distinctBusinessIdsWithAnyActivity(admin, 200_000),
    ]);

    if (aiCurRes.error) throw new Error(aiCurRes.error.message);
    if (aiPrevRes.error) throw new Error(aiPrevRes.error.message);
    if (remCurRes.error) throw new Error(remCurRes.error.message);
    if (remPrevRes.error) throw new Error(remPrevRes.error.message);
    if (schCurRes.error) throw new Error(schCurRes.error.message);
    if (schPrevRes.error) throw new Error(schPrevRes.error.message);
    if (invCurRes.error) throw new Error(invCurRes.error.message);
    if (invPrevRes.error) throw new Error(invPrevRes.error.message);

    const aiCur = aiCurRes.count ?? 0;
    const aiPrev = aiPrevRes.count ?? 0;
    const remCur = remCurRes.count ?? 0;
    const remPrev = remPrevRes.count ?? 0;
    const schCur = schCurRes.count ?? 0;
    const schPrev = schPrevRes.count ?? 0;
    const invCur = invCurRes.count ?? 0;
    const invPrev = invPrevRes.count ?? 0;

    if (usersCountRes.error) throw new Error(usersCountRes.error.message);
    if (businessesCountRes.error) throw new Error(businessesCountRes.error.message);
    if (pastDueRes.error) throw new Error(pastDueRes.error.message);
    if (trialSoonRes.error) throw new Error(trialSoonRes.error.message);

    const total_users = usersCountRes.count ?? 0;
    const total_accounts = businessesCountRes.count ?? 0;

    const active_accounts_current = curBiz.ids.length;
    const active_accounts_previous = prevBiz.ids.length;

    const [active_users_current, active_users_previous] = await Promise.all([
      countUsersOnBusinesses(admin, curBiz.ids),
      countUsersOnBusinesses(admin, prevBiz.ids),
    ]);

    const accounts_inactive_30d = Math.max(0, total_accounts - active_accounts_current);
    const accounts_no_usage_ever = Math.max(0, total_accounts - everActivity.size);

    const subscription_mix: Record<string, number> = {};
    for (const key of PLAN_ORDER) {
      subscription_mix[key] = mix.subscription_counts[key] ?? 0;
    }
    for (const [k, v] of Object.entries(mix.subscription_counts)) {
      if (!PLAN_ORDER.includes(k as (typeof PLAN_ORDER)[number])) {
        subscription_mix[k] = v;
      }
    }

    const mrr = Number(mix.mrr.toFixed(2));
    const arr = Number((mix.mrr * 12).toFixed(2));

    const [pvCur, pvPrev] = await Promise.all([
      aggregatePageViews(admin, currentStartIso, currentEndIso, 150_000),
      aggregatePageViews(admin, prevStartIso, prevEndIso, 150_000),
    ]);

    const productUsageSections = PAGE_SECTION_KEYS.map((key) => {
      const cur = pvCur.bySection.get(key);
      const prev = pvPrev.bySection.get(key);
      const visits = cur?.visits ?? 0;
      const visits_previous = prev?.visits ?? 0;
      const distinct_users = cur?.users.size ?? 0;
      const pct =
        total_users > 0 ? Math.round((distinct_users / total_users) * 1000) / 10 : null;
      return {
        key,
        label: PAGE_SECTION_LABELS[key],
        visits,
        visits_previous,
        delta: visits - visits_previous,
        distinct_users,
        pct_of_profiles: pct,
      };
    }).sort((a, b) => b.visits - a.visits);

    const productUsageFeatures = [
      {
        key: 'ai_assistant',
        label: 'AI assistant (insights generated)',
        count: aiCur,
        previous: aiPrev,
        delta: aiCur - aiPrev,
      },
      {
        key: 'reminders',
        label: 'Reminders sent',
        count: remCur,
        previous: remPrev,
        delta: remCur - remPrev,
      },
      {
        key: 'scheduled_send',
        label: 'Scheduled invoice sends',
        count: schCur,
        previous: schPrev,
        delta: schCur - schPrev,
      },
      {
        key: 'invoice_create',
        label: 'Invoices created (activity)',
        count: invCur,
        previous: invPrev,
        delta: invCur - invPrev,
      },
    ];

    const nowDate = new Date();
    const todayUtc = utcDateString(nowDate);
    const baselineDayUtc = utcDateString(addUtcDays(nowDate, -INACTIVE_THRESHOLD_DAYS));

    let mrrDelta: number | null = null;
    let arrDelta: number | null = null;
    let mrrPrevious: number | null = null;
    let arrPrevious: number | null = null;

    const { data: baselineRows, error: baselineErr } = await admin
      .from('admin_analytics_snapshots')
      .select('mrr_est, arr_est, day_utc')
      .lte('day_utc', baselineDayUtc)
      .order('day_utc', { ascending: false })
      .limit(1);

    const baselineRow = baselineRows?.[0];
    let baselineUsedDayUtc = baselineDayUtc;

    if (!baselineErr && baselineRow) {
      baselineUsedDayUtc = String(baselineRow.day_utc ?? baselineDayUtc).slice(0, 10);
      mrrPrevious = Number(baselineRow.mrr_est);
      arrPrevious = Number(baselineRow.arr_est);
      if (Number.isFinite(mrrPrevious)) mrrDelta = Number((mrr - mrrPrevious).toFixed(2));
      if (Number.isFinite(arrPrevious)) arrDelta = Number((arr - arrPrevious).toFixed(2));
    } else if (baselineErr && baselineErr.code !== '42P01' && baselineErr.code !== 'PGRST205') {
      console.warn('admin_analytics_snapshots baseline read:', baselineErr.message);
    }

    const { error: snapshotErr } = await admin.from('admin_analytics_snapshots').upsert(
      {
        day_utc: todayUtc,
        mrr_est: mrr,
        arr_est: arr,
        updated_at: iso(nowDate),
      },
      { onConflict: 'day_utc' }
    );
    if (snapshotErr && snapshotErr.code !== '42P01') {
      console.warn('admin_analytics_snapshots upsert:', snapshotErr.message);
    }

    await logAdminAuditEvent({
      supabase,
      actorUserId: user.id,
      actorRole: adminRole,
      action: 'admin_view_analytics',
    });

    return NextResponse.json({
      period: {
        label: `Last ${INACTIVE_THRESHOLD_DAYS} days`,
        days: INACTIVE_THRESHOLD_DAYS,
        compare_label: `vs previous ${INACTIVE_THRESHOLD_DAYS} days`,
      },
      definitions: {
        active_accounts: `Workspaces with at least one product activity event in the period.`,
        active_users: `Distinct people (owners and team) on those workspaces — aligned with active workspaces, not sign-ins alone.`,
        mrr: `List-price MRR from billing_plan × plan rate (not Stripe cash). Δ vs the latest UTC daily snapshot on or before the ~${INACTIVE_THRESHOLD_DAYS}d lookback date.`,
      },
      meta: {
        activity_sample_capped: curBiz.capped || prevBiz.capped,
        ever_activity_sample_capped: everActivity.capped,
        mrr_trend_available: mrrDelta !== null,
        mrr_trend_baseline_day_utc: baselineUsedDayUtc,
        mrr_trend_lookback_day_utc: baselineDayUtc,
      },
      health: {
        active_accounts: {
          value: active_accounts_current,
          delta: active_accounts_current - active_accounts_previous,
          previous: active_accounts_previous,
        },
        active_users: {
          value: active_users_current,
          delta: active_users_current - active_users_previous,
          previous: active_users_previous,
        },
        mrr: { value: mrr, delta: mrrDelta, previous: mrrPrevious },
        arr: { value: arr, delta: arrDelta, previous: arrPrevious },
      },
      attention: {
        inactive_threshold_days: INACTIVE_THRESHOLD_DAYS,
        items: [
          {
            id: 'inactive_workspaces',
            label: `Workspaces with no activity (${INACTIVE_THRESHOLD_DAYS}d)`,
            description: 'No product events in the rolling window — churn or onboarding risk.',
            count: accounts_inactive_30d,
            severity: accounts_inactive_30d > 0 ? 'warning' : 'neutral',
          },
          {
            id: 'past_due',
            label: 'Profiles past due on subscription',
            description: 'subscription_status = past_due (failed renewal / payment action needed).',
            count: pastDueRes.count ?? 0,
            severity: (pastDueRes.count ?? 0) > 0 ? 'critical' : 'neutral',
          },
          {
            id: 'trials_ending_soon',
            label: `Trials ending in ${TRIAL_ENDING_SOON_DAYS} days`,
            description: 'Trialing accounts with trial_ends_at before the horizon.',
            count: trialSoonRes.count ?? 0,
            severity: (trialSoonRes.count ?? 0) > 0 ? 'warning' : 'neutral',
          },
          {
            id: 'no_usage_ever',
            label: 'Workspaces with no product usage (ever)',
            description: 'Never logged an activity event — onboarding or dead workspaces.',
            count: accounts_no_usage_ever,
            severity: accounts_no_usage_ever > 0 ? 'warning' : 'neutral',
          },
        ],
      },
      usage: {
        ai_usage_30d: {
          value: aiCur,
          delta: aiCur - aiPrev,
          previous: aiPrev,
        },
        reminder_usage_30d: {
          value: remCur,
          delta: remCur - remPrev,
          previous: remPrev,
        },
        scheduled_send_30d: {
          value: schCur,
          delta: schCur - schPrev,
          previous: schPrev,
        },
      },
      revenue: {
        total_accounts,
        total_users,
        subscription_mix,
        mrr,
        arr,
      },
      product_usage: {
        sections: productUsageSections,
        features: productUsageFeatures,
        meta: {
          page_views_capped: pvCur.capped || pvPrev.capped,
          page_views_missing_table: pvCur.missingTable || pvPrev.missingTable,
          profiles_denominator: total_users,
          feature_source:
            'Feature counts are aggregated from product activity (activity_events, audit_logs, invoices)—not billing.',
        },
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to compute analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
