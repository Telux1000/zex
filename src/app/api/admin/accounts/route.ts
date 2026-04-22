import { NextResponse } from 'next/server';
import {
  deriveAccountOnboardingDaysStuck,
  deriveAccountOnboardingStage,
  deriveAccountOnboardingStuckReason,
  type AccountOnboardingStage,
} from '@/lib/admin/account-onboarding';
import { deriveAccountLifecycleStatus, canManageSubscriberLifecycle } from '@/lib/admin/account-lifecycle';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import {
  computeDerivedTrialEndsAt,
  isSubscriptionCancelled,
  isSubscriptionTrialing,
  isTrialEndInFuture,
  normalizeSubscriptionStatus,
  pickLatestSubscriptionByBusiness,
} from '@/lib/admin/billing-subscription-status';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { maskEmail, maskText } from '@/lib/admin/privacy';

const ACCOUNTS_LIMIT = 250;
const DAY_MS = 1000 * 60 * 60 * 24;
const ONBOARDING_STAGE_VALUES: AccountOnboardingStage[] = [
  'ACCOUNT_CREATED',
  'SIGNUP_UNVERIFIED',
  'VERIFIED_NO_LOGIN',
  'LOGIN_NO_ONBOARDING',
  'ONBOARDING_IN_PROGRESS',
  'ONBOARDING_COMPLETED',
];

type OnboardingFilterStage = 'ALL_INCOMPLETE' | AccountOnboardingStage;
type OnboardingSortField = 'created_at' | 'days_stuck' | 'last_activity_at';

function parseOnboardingStage(raw: string | null): OnboardingFilterStage {
  if (raw === 'ALL_INCOMPLETE') return raw;
  if (raw && ONBOARDING_STAGE_VALUES.includes(raw as AccountOnboardingStage)) return raw as AccountOnboardingStage;
  return 'ALL_INCOMPLETE';
}

function parseOnboardingSort(raw: string | null): OnboardingSortField {
  if (raw === 'days_stuck' || raw === 'last_activity_at' || raw === 'created_at') return raw;
  return 'days_stuck';
}

function parseSortDirection(raw: string | null): 'asc' | 'desc' {
  return raw === 'asc' ? 'asc' : 'desc';
}

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

async function loadSubscriptionRows(admin: NonNullable<ReturnType<typeof getSupabaseServiceAdmin>>) {
  const candidates = ['subscriptions', 'billing_subscriptions'];
  for (const table of candidates) {
    const res = await admin.from(table).select('*').limit(5000);
    if (res.error) {
      if (res.error.code === '42P01') continue;
      return { table, rows: [] as Record<string, unknown>[] };
    }
    return { table, rows: (res.data as Record<string, unknown>[] | null) ?? [] };
  }
  return { table: null as string | null, rows: [] as Record<string, unknown>[] };
}

export async function GET(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const { supabase, user, adminRole } = gate;
  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  const url = new URL(req.url);

  if (url.searchParams.get('view') === 'onboarding') {
    const page = parsePositiveInt(url.searchParams.get('page'), 1, 1, 100_000);
    const pageSize = parsePositiveInt(url.searchParams.get('page_size'), 25, 1, 100);
    const stageFilter = parseOnboardingStage(url.searchParams.get('stage'));
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const sortBy = parseOnboardingSort(url.searchParams.get('sort'));
    const sortDir = parseSortDirection(url.searchParams.get('dir'));

    const businessesRes = await admin
      .from('businesses')
      .select('id, name, owner_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (businessesRes.error) return NextResponse.json({ error: businessesRes.error.message }, { status: 500 });
    const businesses = businessesRes.data ?? [];

    const ownerIds = Array.from(new Set(businesses.map((b) => String(b.owner_id)).filter(Boolean)));
    const [profilesRes, activityRes] = await Promise.all([
      ownerIds.length === 0
        ? Promise.resolve({
            data: [] as {
              id: string;
              full_name: string | null;
              email: string | null;
              onboarding_completed_at: string | null;
              onboarding_pricing_completed_at: string | null;
            }[],
            error: null,
          })
        : admin
            .from('profiles')
            .select('id, full_name, email, onboarding_completed_at, onboarding_pricing_completed_at')
            .in('id', ownerIds),
      admin
        .from('activity_events')
        .select('business_id, created_at')
        .gte('created_at', new Date(Date.now() - 180 * DAY_MS).toISOString())
        .order('created_at', { ascending: false })
        .limit(50_000),
    ]);
    if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
    if (activityRes.error) return NextResponse.json({ error: activityRes.error.message }, { status: 500 });

    const authByOwner = new Map<
      string,
      { created_at: string | null; last_sign_in_at: string | null; email_confirmed_at: string | null; email: string | null }
    >();
    const AUTH_CHUNK = 30;
    for (let i = 0; i < ownerIds.length; i += AUTH_CHUNK) {
      const chunk = ownerIds.slice(i, i + AUTH_CHUNK);
      const results = await Promise.all(chunk.map((id) => admin.auth.admin.getUserById(id)));
      for (let j = 0; j < chunk.length; j += 1) {
        const authUser = results[j].data?.user;
        authByOwner.set(chunk[j], {
          created_at: authUser?.created_at ?? null,
          last_sign_in_at: authUser?.last_sign_in_at ?? null,
          email_confirmed_at: authUser?.email_confirmed_at ?? null,
          email: authUser?.email ?? null,
        });
      }
    }

    const profileByOwner = new Map((profilesRes.data ?? []).map((p) => [String(p.id), p]));
    const lastActivityByBusiness = new Map<string, string>();
    for (const event of activityRes.data ?? []) {
      const businessId = String(event.business_id ?? '');
      if (!businessId || lastActivityByBusiness.has(businessId)) continue;
      lastActivityByBusiness.set(businessId, String(event.created_at));
    }

    const onboardingRows = businesses.map((business) => {
      const ownerId = String(business.owner_id);
      const profile = profileByOwner.get(ownerId);
      const auth = authByOwner.get(ownerId);
      const createdAt = auth?.created_at ?? business.created_at ?? null;
      const emailVerifiedAt = auth?.email_confirmed_at ?? null;
      const firstSignedInAt = auth?.last_sign_in_at ?? null;
      const onboardingStartedAt = profile?.onboarding_pricing_completed_at ?? null;
      const onboardingCompletedAt = profile?.onboarding_completed_at ?? null;
      const onboardingStage = deriveAccountOnboardingStage({
        created_at: createdAt,
        email_verified_at: emailVerifiedAt,
        first_signed_in_at: firstSignedInAt,
        onboarding_started_at: onboardingStartedAt,
        onboarding_completed_at: onboardingCompletedAt,
      });
      const stuckReason = deriveAccountOnboardingStuckReason(onboardingStage);
      const daysStuck = deriveAccountOnboardingDaysStuck(onboardingStage, {
        created_at: createdAt,
        email_verified_at: emailVerifiedAt,
        first_signed_in_at: firstSignedInAt,
        onboarding_started_at: onboardingStartedAt,
        onboarding_completed_at: onboardingCompletedAt,
      });
      const name = (profile?.full_name ?? '').trim() || business.name || '—';
      const email = (profile?.email ?? auth?.email ?? '').trim();
      const lastActivityAt = lastActivityByBusiness.get(String(business.id)) ?? firstSignedInAt ?? null;

      return {
        id: String(business.id),
        name,
        email,
        created_at: createdAt ?? business.created_at,
        email_verified_at: emailVerifiedAt,
        first_signed_in_at: firstSignedInAt,
        onboarding_started_at: onboardingStartedAt,
        onboarding_completed_at: onboardingCompletedAt,
        last_activity_at: lastActivityAt,
        onboarding_stage: onboardingStage,
        stuck_reason: stuckReason,
        days_stuck: daysStuck,
      };
    });

    const filtered = onboardingRows
      .filter((row) => {
        if (stageFilter === 'ALL_INCOMPLETE') return row.onboarding_stage !== 'ONBOARDING_COMPLETED';
        return row.onboarding_stage === stageFilter;
      })
      .filter((row) => {
        if (!search) return true;
        return row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search);
      });

    filtered.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'created_at') {
        return (
          (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir ||
          a.name.localeCompare(b.name)
        );
      }
      if (sortBy === 'last_activity_at') {
        const av = a.last_activity_at ? new Date(a.last_activity_at).getTime() : -1;
        const bv = b.last_activity_at ? new Date(b.last_activity_at).getTime() : -1;
        return (av - bv) * dir || a.name.localeCompare(b.name);
      }
      const av = a.days_stuck ?? -1;
      const bv = b.days_stuck ?? -1;
      return (av - bv) * dir || a.name.localeCompare(b.name);
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const accounts = filtered.slice(start, start + pageSize);

    await logAdminAuditEvent({
      supabase,
      actorUserId: user.id,
      actorRole: adminRole,
      action: 'admin_view_accounts',
      metadata: {
        view: 'onboarding',
        total,
        stage: stageFilter,
      },
    });

    return NextResponse.json({
      actor: { canManageLifecycle: canManageSubscriberLifecycle(adminRole) },
      view: 'onboarding',
      accounts,
      pagination: {
        page: safePage,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
    });
  }

  /**
   * Source of truth for Zenzex subscriber workspaces is `public.businesses`.
   * The user-scoped Supabase client is subject to RLS (`business_can_see`), so internal admins
   * only see tenants they belong to — often zero rows. Service role reads are required here.
   */
  const businessRes = await admin
    .from('businesses')
    .select('id, name, owner_id, created_at, admin_suspended_at, admin_deactivated_at')
    .order('created_at', { ascending: false })
    .limit(ACCOUNTS_LIMIT);

  if (businessRes.error) return NextResponse.json({ error: businessRes.error.message }, { status: 500 });

  const businesses = businessRes.data ?? [];
  const ownerIdList = Array.from(new Set(businesses.map((b) => String(b.owner_id))));

  const ownerProfilesRes =
    ownerIdList.length === 0
      ? {
          data: [] as {
            id: string;
            full_name: string | null;
            email: string | null;
            billing_plan: string | null;
            created_at: string | null;
            subscriber_admin_suspended_at?: string | null;
            subscriber_admin_deactivated_at?: string | null;
          }[],
          error: null,
        }
      : await admin
          .from('profiles')
          .select(
            'id, full_name, email, billing_plan, created_at, subscriber_admin_suspended_at, subscriber_admin_deactivated_at'
          )
          .in('id', ownerIdList);
  const subscriptionsProbe = await loadSubscriptionRows(admin);

  if (ownerProfilesRes.error) return NextResponse.json({ error: ownerProfilesRes.error.message }, { status: 500 });

  const [invoiceRes, activityRes, aiRes, reminderRes, membersRes] = await Promise.all([
    admin
      .from('invoices')
      .select('id, business_id, created_at, scheduled_send_at')
      .gte('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString())
      .limit(10000),
    admin
      .from('activity_events')
      .select('business_id, created_at')
      .gte('created_at', new Date(Date.now() - 60 * DAY_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(20000),
    admin
      .from('activity_events')
      .select('business_id, created_at')
      .eq('type', 'ai_insight_generated')
      .gte('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString())
      .limit(10000),
    admin
      .from('audit_logs')
      .select('business_id')
      .eq('action', 'reminder_sent')
      .gte('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString())
      .limit(10000),
    admin.from('business_members').select('business_id, user_id').limit(10000),
  ]);

  if (invoiceRes.error) return NextResponse.json({ error: invoiceRes.error.message }, { status: 500 });
  if (activityRes.error) return NextResponse.json({ error: activityRes.error.message }, { status: 500 });
  if (aiRes.error) return NextResponse.json({ error: aiRes.error.message }, { status: 500 });
  if (reminderRes.error) return NextResponse.json({ error: reminderRes.error.message }, { status: 500 });
  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 });

  const owners = new Map((ownerProfilesRes.data ?? []).map((p) => [String(p.id), p]));
  const businessByOwnerId = new Map<string, string>();
  for (const b of businesses) {
    const ownerId = String(b.owner_id);
    if (!businessByOwnerId.has(ownerId)) businessByOwnerId.set(ownerId, String(b.id));
  }
  const subscriptionsByBusiness = pickLatestSubscriptionByBusiness(
    subscriptionsProbe.rows,
    (row) => {
      const direct =
        (typeof row.business_id === 'string' && row.business_id) ||
        (typeof row.account_id === 'string' && row.account_id) ||
        (typeof row.workspace_id === 'string' && row.workspace_id) ||
        (typeof row.tenant_id === 'string' && row.tenant_id) ||
        (typeof row.company_id === 'string' && row.company_id) ||
        null;
      if (direct) return direct;
      const ownerLike =
        (typeof row.owner_id === 'string' && row.owner_id) ||
        (typeof row.user_id === 'string' && row.user_id) ||
        (typeof row.profile_id === 'string' && row.profile_id) ||
        null;
      if (!ownerLike) return null;
      return businessByOwnerId.get(ownerLike) ?? null;
    }
  );

  const invoicesByBusiness = new Map<string, number>();
  const scheduledByBusiness = new Map<string, number>();
  for (const inv of invoiceRes.data ?? []) {
    const businessId = String(inv.business_id ?? '');
    if (!businessId) continue;
    invoicesByBusiness.set(businessId, (invoicesByBusiness.get(businessId) ?? 0) + 1);
    if (inv.scheduled_send_at) {
      scheduledByBusiness.set(businessId, (scheduledByBusiness.get(businessId) ?? 0) + 1);
    }
  }

  const memberCountByBusiness = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    const businessId = String(m.business_id ?? '');
    if (!businessId) continue;
    memberCountByBusiness.set(businessId, (memberCountByBusiness.get(businessId) ?? 0) + 1);
  }

  const lastActiveByBusiness = new Map<string, string>();
  for (const event of activityRes.data ?? []) {
    const businessId = String(event.business_id ?? '');
    if (!businessId || lastActiveByBusiness.has(businessId)) continue;
    lastActiveByBusiness.set(businessId, String(event.created_at));
  }

  const aiByBusiness = new Map<string, number>();
  for (const event of aiRes.data ?? []) {
    const businessId = String(event.business_id ?? '');
    if (!businessId) continue;
    aiByBusiness.set(businessId, (aiByBusiness.get(businessId) ?? 0) + 1);
  }

  const remindersByBusiness = new Map<string, number>();
  for (const row of reminderRes.data ?? []) {
    const businessId = String(row.business_id ?? '');
    if (!businessId) continue;
    remindersByBusiness.set(businessId, (remindersByBusiness.get(businessId) ?? 0) + 1);
  }

  const accounts = businesses.map((business) => {
    const owner = owners.get(String(business.owner_id));
    const plan = owner?.billing_plan ?? 'starter';
    const lifecycle = deriveAccountLifecycleStatus({
      admin_suspended_at: business.admin_suspended_at,
      admin_deactivated_at: business.admin_deactivated_at,
    });
    const totalUsers = (memberCountByBusiness.get(String(business.id)) ?? 0) + 1;
    const subscriptionSnapshot = subscriptionsByBusiness.get(String(business.id)) ?? null;
    const cancelled = Boolean(
      business.admin_deactivated_at ||
        owner?.subscriber_admin_deactivated_at ||
        (subscriptionSnapshot ? isSubscriptionCancelled(subscriptionSnapshot) : false)
    );
    const suspended = Boolean(business.admin_suspended_at || owner?.subscriber_admin_suspended_at);
    const trialEnd = subscriptionSnapshot?.trialEndIso ?? computeDerivedTrialEndsAt(owner?.created_at ?? business.created_at);
    const trialFromDate = isTrialEndInFuture(trialEnd);
    const trialFromStatus = normalizeSubscriptionStatus(subscriptionSnapshot?.status ?? null) === 'trialing';
    const trialFromSubscription =
      !cancelled &&
      !suspended &&
      (trialFromDate ||
        trialFromStatus ||
        (subscriptionSnapshot ? isSubscriptionTrialing(subscriptionSnapshot) : false));
    return {
      id: business.id,
      name: business.name,
      owner_name: maskText(owner?.full_name ?? '—'),
      owner_email: maskEmail(owner?.email ?? ''),
      current_plan: plan,
      subscription_status: lifecycle,
      trial_status: trialFromSubscription ? 'in_trial' : 'trial_ended',
      created_at: business.created_at,
      last_active_at: lastActiveByBusiness.get(String(business.id)) ?? null,
      users_count: totalUsers,
      usage_summary: {
        invoices_30d: invoicesByBusiness.get(String(business.id)) ?? 0,
        ai_usage_30d: aiByBusiness.get(String(business.id)) ?? 0,
        reminders_30d: remindersByBusiness.get(String(business.id)) ?? 0,
        scheduled_sends_30d: scheduledByBusiness.get(String(business.id)) ?? 0,
      },
    };
  });

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_accounts',
    metadata: { count: accounts.length },
  });

  return NextResponse.json({
    actor: { canManageLifecycle: canManageSubscriberLifecycle(adminRole) },
    accounts,
  });
}
