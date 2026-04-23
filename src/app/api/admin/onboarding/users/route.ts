import { NextResponse } from 'next/server';
import {
  deriveAccountOnboardingDaysStuck,
  deriveAccountOnboardingStuckReason,
  type AccountOnboardingStage,
} from '@/lib/admin/account-onboarding';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { listOnboardingSnapshots } from '@/lib/admin/onboarding-follow-ups';

type OnboardingFilterStage = 'ALL_INCOMPLETE' | AccountOnboardingStage;
type OnboardingSortField = 'created_at' | 'days_stuck' | 'last_activity_at';

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function parseOnboardingSort(raw: string | null): OnboardingSortField {
  if (raw === 'days_stuck' || raw === 'last_activity_at' || raw === 'created_at') return raw;
  return 'days_stuck';
}

function parseSortDirection(raw: string | null): 'asc' | 'desc' {
  return raw === 'asc' ? 'asc' : 'desc';
}

/** Stored `template_id` is the env var name; show Postmark alias from env or a readable fallback. */
function onboardingTemplateDisplay(envKey: string): string {
  const key = String(envKey ?? '').trim();
  if (!key) return '—';
  const resolved = String(process.env[key] ?? '').trim();
  if (resolved) return resolved;
  if (key.startsWith('POSTMARK_TEMPLATE_')) {
    return key.slice('POSTMARK_TEMPLATE_'.length).replace(/_/g, '-').toLowerCase();
  }
  return key;
}

function parseOnboardingStage(raw: string | null): OnboardingFilterStage {
  if (
    raw === 'ALL_INCOMPLETE' ||
    raw === 'ACCOUNT_CREATED' ||
    raw === 'SIGNUP_UNVERIFIED' ||
    raw === 'VERIFIED_NO_LOGIN' ||
    raw === 'LOGIN_NO_ONBOARDING' ||
    raw === 'ONBOARDING_IN_PROGRESS' ||
    raw === 'ONBOARDING_COMPLETED'
  ) {
    return raw;
  }
  return 'ALL_INCOMPLETE';
}

export async function GET(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;
  const { supabase, user, adminRole } = gate;
  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const url = new URL(req.url);
  const page = parsePositiveInt(url.searchParams.get('page'), 1, 1, 100_000);
  const pageSize = parsePositiveInt(url.searchParams.get('page_size'), 25, 1, 100);
  const stageFilter = parseOnboardingStage(url.searchParams.get('stage'));
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const sortBy = parseOnboardingSort(url.searchParams.get('sort'));
  const sortDir = parseSortDirection(url.searchParams.get('dir'));

  const snapshots = await listOnboardingSnapshots();
  const userIds = snapshots.map((s) => s.user_id);
  const businessesRes =
    userIds.length === 0
      ? { data: [] as { id: string; owner_id: string }[], error: null }
      : await admin.from('businesses').select('id, owner_id').in('owner_id', userIds);
  if (businessesRes.error) return NextResponse.json({ error: businessesRes.error.message }, { status: 500 });
  const businessByOwner = new Map<string, string>();
  for (const b of businessesRes.data ?? []) {
    const ownerId = String(b.owner_id ?? '');
    if (!ownerId || businessByOwner.has(ownerId)) continue;
    businessByOwner.set(ownerId, String(b.id));
  }

  const followUpsRes =
    userIds.length === 0
      ? { data: [] as any[], error: null }
      : await admin
          .from('onboarding_follow_ups')
          .select('user_id, status, template_id, scheduled_for, updated_at')
          .in('user_id', userIds)
          .order('scheduled_for', { ascending: true });
  if (followUpsRes.error) return NextResponse.json({ error: followUpsRes.error.message }, { status: 500 });
  const followUpsByUser = new Map<string, any[]>();
  for (const row of followUpsRes.data ?? []) {
    const userId = String(row.user_id ?? '');
    if (!userId) continue;
    const list = followUpsByUser.get(userId) ?? [];
    list.push(row);
    followUpsByUser.set(userId, list);
  }

  const rows = snapshots
    .map((snapshot) => {
      const followUps = followUpsByUser.get(snapshot.user_id) ?? [];
      const sent = followUps
        .filter((row) => String(row.status) === 'SENT')
        .sort((a, b) => new Date(String(b.updated_at)).getTime() - new Date(String(a.updated_at)).getTime());
      const pending = followUps
        .filter((row) => String(row.status) === 'PENDING')
        .sort((a, b) => new Date(String(a.scheduled_for)).getTime() - new Date(String(b.scheduled_for)).getTime());
      const lastSent = sent[0] ?? null;
      const nextPending = pending[0] ?? null;
      const stuckReason = deriveAccountOnboardingStuckReason(snapshot.onboarding_stage);
      const daysStuck = deriveAccountOnboardingDaysStuck(snapshot.onboarding_stage, {
        created_at: snapshot.created_at,
        email_verified_at: snapshot.email_verified_at,
        first_signed_in_at: snapshot.first_signed_in_at,
        onboarding_started_at: snapshot.onboarding_started_at,
        onboarding_completed_at: snapshot.onboarding_completed_at,
      });
      const accountId = businessByOwner.get(snapshot.user_id) ?? null;

      return {
        id: snapshot.user_id,
        account_id: accountId,
        name: (snapshot.full_name ?? '').trim() || '—',
        email: (snapshot.email ?? '').trim(),
        created_at: snapshot.created_at ?? new Date(0).toISOString(),
        email_verified_at: snapshot.email_verified_at,
        first_signed_in_at: snapshot.first_signed_in_at,
        onboarding_started_at: snapshot.onboarding_started_at,
        onboarding_completed_at: snapshot.onboarding_completed_at,
        last_activity_at: snapshot.first_signed_in_at,
        onboarding_stage: snapshot.onboarding_stage,
        stuck_reason: stuckReason,
        days_stuck: daysStuck,
        follow_up_status: snapshot.follow_ups_canceled_at
          ? 'cancelled'
          : snapshot.follow_ups_paused_at
            ? 'paused'
            : 'active',
        last_follow_up: lastSent
          ? {
              sent_at: String(lastSent.updated_at),
              template_id: String(lastSent.template_id),
              template_display: onboardingTemplateDisplay(String(lastSent.template_id)),
            }
          : null,
        next_follow_up: nextPending
          ? {
              scheduled_for: String(nextPending.scheduled_for),
              template_id: String(nextPending.template_id),
              template_display: onboardingTemplateDisplay(String(nextPending.template_id)),
            }
          : null,
      };
    })
    .filter((row) => {
      if (stageFilter === 'ALL_INCOMPLETE') return row.onboarding_stage !== 'ONBOARDING_COMPLETED';
      return row.onboarding_stage === stageFilter;
    })
    .filter((row) => {
      if (!search) return true;
      return row.name.toLowerCase().includes(search) || row.email.toLowerCase().includes(search);
    });

  rows.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'created_at') {
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir || a.name.localeCompare(b.name);
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

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const accounts = rows.slice(start, start + pageSize);

  await logAdminAuditEvent({
    supabase,
    actorUserId: user.id,
    actorRole: adminRole,
    action: 'admin_view_accounts',
    metadata: {
      view: 'onboarding_users',
      total,
      stage: stageFilter,
    },
  });

  return NextResponse.json({
    view: 'onboarding_users',
    accounts,
    pagination: {
      page: safePage,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
  });
}
