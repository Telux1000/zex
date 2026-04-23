import { resolvePostmarkTemplateFromEnv, sendTemplatedEmail } from '@/services/postmark';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  deriveAccountOnboardingAnchorAt,
  deriveAccountOnboardingStage,
  type AccountOnboardingStage,
  STUCK_ONBOARDING_STAGES,
} from '@/lib/admin/account-onboarding';

export type OnboardingFollowUpStatus = 'PENDING' | 'SENT' | 'CANCELED';
export type OnboardingFollowUpStepKey = '30m' | '2h' | '24h' | '72h' | 'manual';

export type OnboardingUserSnapshot = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  email_verified_at: string | null;
  first_signed_in_at: string | null;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  onboarding_stage: AccountOnboardingStage;
  anchor_at: string | null;
  follow_ups_paused_at: string | null;
};

type FollowUpSequenceStep = {
  stepKey: Exclude<OnboardingFollowUpStepKey, 'manual'>;
  delayMs: number;
  templateId: string;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const TEMPLATE_COOLDOWN_MS = 12 * HOUR_MS;
const MANUAL_SUPPRESSION_MS = 8 * HOUR_MS;
const MAX_AUTOMATED_PER_STAGE_CYCLE = 3;

const STUCK_STAGE_SET = new Set<AccountOnboardingStage>(STUCK_ONBOARDING_STAGES);

/** Merge fields for Postmark onboarding follow-up templates (alias e.g. `onboarding-signup-unverified-30m`). */
function buildOnboardingFollowUpTemplateModel(
  snapshot: OnboardingUserSnapshot,
  opts: { stage: AccountOnboardingStage; stepKey: string }
): Record<string, string> {
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const productName = String(process.env.NEXT_PUBLIC_APP_NAME ?? 'Zenzex').trim() || 'Zenzex';
  const year = String(new Date().getFullYear());
  const first = String(snapshot.full_name ?? '').trim();
  const greetingName = first || 'there';
  return {
    firstName: greetingName,
    first_name: greetingName,
    email: String(snapshot.email ?? '').trim(),
    onboardingStage: opts.stage,
    onboarding_stage: opts.stage,
    stepKey: opts.stepKey,
    step_key: opts.stepKey,
    app_url: appUrl,
    product_name: productName,
    year,
  };
}

const FOLLOW_UP_SEQUENCES: Record<
  Extract<AccountOnboardingStage, 'SIGNUP_UNVERIFIED' | 'VERIFIED_NO_LOGIN' | 'LOGIN_NO_ONBOARDING' | 'ONBOARDING_IN_PROGRESS'>,
  FollowUpSequenceStep[]
> = {
  SIGNUP_UNVERIFIED: [
    { stepKey: '30m', delayMs: 30 * MINUTE_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_SIGNUP_UNVERIFIED_30M' },
    { stepKey: '24h', delayMs: 24 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_SIGNUP_UNVERIFIED_24H' },
    { stepKey: '72h', delayMs: 72 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_SIGNUP_UNVERIFIED_72H' },
  ],
  VERIFIED_NO_LOGIN: [
    { stepKey: '24h', delayMs: 24 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_VERIFIED_NO_LOGIN_24H' },
    { stepKey: '72h', delayMs: 72 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_VERIFIED_NO_LOGIN_72H' },
  ],
  LOGIN_NO_ONBOARDING: [
    { stepKey: '2h', delayMs: 2 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_LOGIN_NO_ONBOARDING_2H' },
    { stepKey: '24h', delayMs: 24 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_LOGIN_NO_ONBOARDING_24H' },
    { stepKey: '72h', delayMs: 72 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_LOGIN_NO_ONBOARDING_72H' },
  ],
  ONBOARDING_IN_PROGRESS: [
    { stepKey: '30m', delayMs: 30 * MINUTE_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_IN_PROGRESS_30M' },
    { stepKey: '24h', delayMs: 24 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_IN_PROGRESS_24H' },
    { stepKey: '72h', delayMs: 72 * HOUR_MS, templateId: 'POSTMARK_TEMPLATE_ONBOARDING_IN_PROGRESS_72H' },
  ],
};

function addDelay(iso: string | null, delayMs: number) {
  const base = iso ? new Date(iso).getTime() : Date.now();
  return new Date(base + delayMs).toISOString();
}

function stageSequence(stage: AccountOnboardingStage): FollowUpSequenceStep[] {
  if (stage === 'SIGNUP_UNVERIFIED') return FOLLOW_UP_SEQUENCES.SIGNUP_UNVERIFIED;
  if (stage === 'VERIFIED_NO_LOGIN') return FOLLOW_UP_SEQUENCES.VERIFIED_NO_LOGIN;
  if (stage === 'LOGIN_NO_ONBOARDING') return FOLLOW_UP_SEQUENCES.LOGIN_NO_ONBOARDING;
  if (stage === 'ONBOARDING_IN_PROGRESS') return FOLLOW_UP_SEQUENCES.ONBOARDING_IN_PROGRESS;
  return [];
}

export function isStuckOnboardingStage(stage: AccountOnboardingStage): boolean {
  return STUCK_STAGE_SET.has(stage);
}

export async function listOnboardingSnapshots() {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return [] as OnboardingUserSnapshot[];

  const authUsers: {
    id: string;
    email: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    full_name: string | null;
  }[] = [];
  const perPage = 200;
  const maxUsers = 5000;
  for (let authPage = 1; authUsers.length < maxUsers; authPage += 1) {
    const authRes = await admin.auth.admin.listUsers({ page: authPage, perPage });
    if (authRes.error) break;
    const pageUsers = authRes.data?.users ?? [];
    for (const u of pageUsers) {
      const userMeta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const fullNameFromMeta =
        (typeof userMeta.full_name === 'string' ? userMeta.full_name : null) ??
        (typeof userMeta.name === 'string' ? userMeta.name : null);
      authUsers.push({
        id: String(u.id),
        email: u.email ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        full_name: fullNameFromMeta,
      });
      if (authUsers.length >= maxUsers) break;
    }
    if (pageUsers.length < perPage) break;
  }

  const authUserIds = authUsers.map((u) => u.id);
  const profileRows: {
    id: string;
    full_name: string | null;
    email: string | null;
    created_at: string | null;
    internal_admin_role: string | null;
    onboarding_completed_at: string | null;
    onboarding_pricing_completed_at: string | null;
    onboarding_follow_ups_paused_at: string | null;
  }[] = [];
  const chunk = 400;
  for (let i = 0; i < authUserIds.length; i += chunk) {
    const ids = authUserIds.slice(i, i + chunk);
    const profileRes = await admin
      .from('profiles')
      .select(
        'id, full_name, email, created_at, internal_admin_role, onboarding_completed_at, onboarding_pricing_completed_at, onboarding_follow_ups_paused_at'
      )
      .in('id', ids);
    if (profileRes.error) continue;
    profileRows.push(...(profileRes.data ?? []));
  }
  const profileById = new Map(profileRows.map((p) => [String(p.id), p]));

  return authUsers
    .map((auth): OnboardingUserSnapshot | null => {
      const profile = profileById.get(auth.id) ?? null;
      if (profile?.internal_admin_role) return null;
      const createdAt = auth.created_at ?? profile?.created_at ?? null;
      const emailVerifiedAt = auth.email_confirmed_at ?? null;
      const firstSignedInAt = auth.last_sign_in_at ?? null;
      const onboardingStartedAt = profile?.onboarding_pricing_completed_at ?? null;
      const onboardingCompletedAt = profile?.onboarding_completed_at ?? null;
      const stage = deriveAccountOnboardingStage({
        created_at: createdAt,
        email_verified_at: emailVerifiedAt,
        first_signed_in_at: firstSignedInAt,
        onboarding_started_at: onboardingStartedAt,
        onboarding_completed_at: onboardingCompletedAt,
      });
      return {
        user_id: auth.id,
        email: profile?.email ?? auth.email ?? null,
        full_name: profile?.full_name ?? auth.full_name ?? null,
        created_at: createdAt,
        email_verified_at: emailVerifiedAt,
        first_signed_in_at: firstSignedInAt,
        onboarding_started_at: onboardingStartedAt,
        onboarding_completed_at: onboardingCompletedAt,
        onboarding_stage: stage,
        anchor_at: deriveAccountOnboardingAnchorAt(stage, {
          created_at: createdAt,
          email_verified_at: emailVerifiedAt,
          first_signed_in_at: firstSignedInAt,
          onboarding_started_at: onboardingStartedAt,
          onboarding_completed_at: onboardingCompletedAt,
        }),
        follow_ups_paused_at: profile?.onboarding_follow_ups_paused_at ?? null,
      };
    })
    .filter((row): row is OnboardingUserSnapshot => row !== null);
}

export async function cancelPendingFollowUpsForUser(
  userId: string,
  reason: string,
  opts?: { stage?: AccountOnboardingStage }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return { ok: false, error: 'Server misconfigured' };
  let q = admin
    .from('onboarding_follow_ups')
    .update({
      status: 'CANCELED',
      canceled_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'PENDING');
  if (opts?.stage) q = q.eq('onboarding_stage_at_schedule', opts.stage);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reconcileFollowUpsForSnapshot(snapshot: OnboardingUserSnapshot) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return;
  const stage = snapshot.onboarding_stage;
  const isStuck = isStuckOnboardingStage(stage);
  if (!isStuck || stage === 'ONBOARDING_COMPLETED') {
    await cancelPendingFollowUpsForUser(snapshot.user_id, 'stage_not_stuck');
    return;
  }
  if (snapshot.follow_ups_paused_at) {
    await cancelPendingFollowUpsForUser(snapshot.user_id, 'paused_by_admin');
    return;
  }

  const { data: pending } = await admin
    .from('onboarding_follow_ups')
    .select('id, onboarding_stage_at_schedule, status')
    .eq('user_id', snapshot.user_id)
    .eq('status', 'PENDING');

  const pendingRows = pending ?? [];
  const stalePendingIds = pendingRows
    .filter((row) => String(row.onboarding_stage_at_schedule) !== stage)
    .map((row) => String(row.id));
  if (stalePendingIds.length > 0) {
    await admin
      .from('onboarding_follow_ups')
      .update({
        status: 'CANCELED',
        canceled_reason: 'stage_changed',
        updated_at: new Date().toISOString(),
      })
      .in('id', stalePendingIds);
  }

  const { data: cycleRows } = await admin
    .from('onboarding_follow_ups')
    .select('id, step_key, status, created_at')
    .eq('user_id', snapshot.user_id)
    .eq('onboarding_stage_at_schedule', stage)
    .gte('created_at', snapshot.anchor_at ?? new Date(Date.now() - 7 * 24 * HOUR_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(50);

  const stageRows = cycleRows ?? [];
  const autoRowsInCycle = stageRows.filter((row) => String(row.step_key) !== 'manual');
  if (autoRowsInCycle.length >= MAX_AUTOMATED_PER_STAGE_CYCLE) return;

  const existingStepKeys = new Set(autoRowsInCycle.map((row) => String(row.step_key)));
  const steps = stageSequence(stage);
  const rowsToInsert = steps
    .filter((step) => !existingStepKeys.has(step.stepKey))
    .slice(0, Math.max(0, MAX_AUTOMATED_PER_STAGE_CYCLE - autoRowsInCycle.length))
    .map((step) => ({
      user_id: snapshot.user_id,
      onboarding_stage_at_schedule: stage,
      template_id: step.templateId,
      scheduled_for: addDelay(snapshot.anchor_at, step.delayMs),
      status: 'PENDING' as OnboardingFollowUpStatus,
      step_key: step.stepKey,
    }));

  if (rowsToInsert.length > 0) {
    await admin.from('onboarding_follow_ups').insert(rowsToInsert);
  }
}

type FollowUpRow = {
  id: string;
  user_id: string;
  onboarding_stage_at_schedule: AccountOnboardingStage;
  template_id: string;
  step_key: string;
};

async function markFollowUpCanceled(rowId: string, reason: string) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return;
  await admin
    .from('onboarding_follow_ups')
    .update({ status: 'CANCELED', canceled_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', rowId);
}

async function markFollowUpSent(rowId: string) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return;
  await admin.from('onboarding_follow_ups').update({ status: 'SENT', updated_at: new Date().toISOString() }).eq('id', rowId);
}

async function templateInCooldown(userId: string, templateId: string, nowIso: string) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return false;
  const since = new Date(new Date(nowIso).getTime() - TEMPLATE_COOLDOWN_MS).toISOString();
  const { data } = await admin
    .from('onboarding_follow_ups')
    .select('id')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .eq('status', 'SENT')
    .gte('updated_at', since)
    .limit(1);
  return Boolean((data ?? []).length);
}

async function manualMessageRecentlySent(userId: string, nowIso: string) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return false;
  const since = new Date(new Date(nowIso).getTime() - MANUAL_SUPPRESSION_MS).toISOString();
  const { data } = await admin
    .from('onboarding_follow_ups')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'SENT')
    .eq('step_key', 'manual')
    .gte('updated_at', since)
    .limit(1);
  return Boolean((data ?? []).length);
}

async function sendFollowUpRow(row: FollowUpRow, snapshot: OnboardingUserSnapshot, nowIso: string) {
  if (!snapshot.email) {
    await markFollowUpCanceled(row.id, 'missing_email');
    return;
  }
  if (snapshot.onboarding_stage !== row.onboarding_stage_at_schedule || snapshot.onboarding_stage === 'ONBOARDING_COMPLETED') {
    await markFollowUpCanceled(row.id, 'stage_changed');
    return;
  }
  if (!isStuckOnboardingStage(snapshot.onboarding_stage)) {
    await markFollowUpCanceled(row.id, 'user_not_stuck');
    return;
  }
  if (snapshot.follow_ups_paused_at) {
    await markFollowUpCanceled(row.id, 'paused_by_admin');
    return;
  }
  if (await templateInCooldown(row.user_id, row.template_id, nowIso)) {
    await markFollowUpCanceled(row.id, 'template_cooldown');
    return;
  }
  if (await manualMessageRecentlySent(row.user_id, nowIso)) {
    await markFollowUpCanceled(row.id, 'manual_follow_up_recently_sent');
    return;
  }
  const tpl = resolvePostmarkTemplateFromEnv(row.template_id);
  if (!tpl.templateAlias && !tpl.templateId) {
    await markFollowUpCanceled(row.id, 'template_not_configured');
    return;
  }

  const sent = await sendTemplatedEmail({
    to: snapshot.email,
    templateAlias: tpl.templateAlias,
    templateId: tpl.templateId,
    templateModel: buildOnboardingFollowUpTemplateModel(snapshot, {
      stage: snapshot.onboarding_stage,
      stepKey: row.step_key,
    }),
    tag: 'onboarding_follow_up',
    metadata: {
      user_id: row.user_id,
      stage: snapshot.onboarding_stage,
      step_key: row.step_key,
    },
  });
  if (!sent.ok) {
    return;
  }
  await markFollowUpSent(row.id);
  const admin = getSupabaseServiceAdmin();
  if (!admin) return;
  await admin.from('admin_audit_logs').insert({
    actor_user_id: row.user_id,
    actor_role: 'support',
    action: 'admin_view_accounts',
    target_type: 'onboarding_follow_up',
    target_id: row.id,
    metadata: {
      source: 'automation',
      template_id: row.template_id,
      step_key: row.step_key,
      stage: snapshot.onboarding_stage,
      sent_at: nowIso,
    },
  });
}

export async function runOnboardingFollowUpProcessor() {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return { reconciled: 0, sent: 0, canceled: 0 };
  const snapshots = await listOnboardingSnapshots();
  const snapshotByUserId = new Map(snapshots.map((s) => [s.user_id, s]));

  for (const snapshot of snapshots) {
    await reconcileFollowUpsForSnapshot(snapshot);
  }

  const nowIso = new Date().toISOString();
  const { data: dueRows } = await admin
    .from('onboarding_follow_ups')
    .select('id, user_id, onboarding_stage_at_schedule, template_id, step_key')
    .eq('status', 'PENDING')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(200);

  const due = dueRows ?? [];
  const dueUserIds = [...new Set(due.map((r) => String(r.user_id)))].filter(Boolean);
  const followUpsPausedByUser = new Map<string, string | null>();
  if (dueUserIds.length > 0) {
    const { data: profPause } = await admin
      .from('profiles')
      .select('id, onboarding_follow_ups_paused_at')
      .in('id', dueUserIds);
    for (const p of profPause ?? []) {
      const row = p as { id: string; onboarding_follow_ups_paused_at: string | null };
      followUpsPausedByUser.set(String(row.id), row.onboarding_follow_ups_paused_at ?? null);
    }
  }

  let sent = 0;
  let canceled = 0;
  for (const raw of due) {
    const row: FollowUpRow = {
      id: String(raw.id),
      user_id: String(raw.user_id),
      onboarding_stage_at_schedule: raw.onboarding_stage_at_schedule as AccountOnboardingStage,
      template_id: String(raw.template_id),
      step_key: String(raw.step_key),
    };
    const followsPaused = Boolean(followUpsPausedByUser.get(row.user_id));
    if (followsPaused) {
      await markFollowUpCanceled(row.id, 'paused_by_admin');
      canceled += 1;
      continue;
    }
    const snapshot = snapshotByUserId.get(row.user_id);
    if (!snapshot) {
      await markFollowUpCanceled(row.id, 'user_not_found');
      canceled += 1;
      continue;
    }
    const before = await admin.from('onboarding_follow_ups').select('status').eq('id', row.id).maybeSingle();
    await sendFollowUpRow(row, snapshot, nowIso);
    const after = await admin.from('onboarding_follow_ups').select('status').eq('id', row.id).maybeSingle();
    const beforeStatus = String((before.data as { status?: string } | null)?.status ?? 'PENDING');
    const afterStatus = String((after.data as { status?: string } | null)?.status ?? 'PENDING');
    if (beforeStatus === 'PENDING' && afterStatus === 'SENT') sent += 1;
    if (beforeStatus === 'PENDING' && afterStatus === 'CANCELED') canceled += 1;
  }
  return { reconciled: snapshots.length, sent, canceled };
}

function fullNameFromAuthUserMetadata(user: { user_metadata?: Record<string, unknown> }): string | null {
  const m = user.user_metadata ?? {};
  return (
    (typeof m.full_name === 'string' ? m.full_name : null) ??
    (typeof m.name === 'string' ? m.name : null) ??
    null
  );
}

export async function setFollowUpsPaused(
  userId: string,
  paused: boolean,
  opts?: { pendingCancelReason?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return { ok: false, error: 'Server misconfigured' };
  const pausedAt = paused ? new Date().toISOString() : null;

  const { data: updatedRow, error: updateErr } = await admin
    .from('profiles')
    .update({ onboarding_follow_ups_paused_at: pausedAt })
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (updateErr) return { ok: false, error: updateErr.message };

  if (!updatedRow && paused) {
    const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
    if (authErr) return { ok: false, error: authErr.message };
    if (!authData.user) return { ok: false, error: 'User not found' };

    const u = authData.user;
    const { error: insertErr } = await admin.from('profiles').insert({
      id: userId,
      email: u.email ?? null,
      full_name: fullNameFromAuthUserMetadata(u),
      onboarding_follow_ups_paused_at: pausedAt,
    });
    if (insertErr) {
      if (insertErr.code === '23505') {
        const { error: againErr } = await admin
          .from('profiles')
          .update({ onboarding_follow_ups_paused_at: pausedAt })
          .eq('id', userId)
          .select('id')
          .maybeSingle();
        if (againErr) return { ok: false, error: againErr.message };
      } else {
        return { ok: false, error: insertErr.message };
      }
    }
  }

  if (paused) {
    const reason = (opts?.pendingCancelReason ?? 'paused_by_admin').trim() || 'paused_by_admin';
    const canceled = await cancelPendingFollowUpsForUser(userId, reason);
    if (!canceled.ok) return { ok: false, error: canceled.error };
  } else {
    const snapshots = await listOnboardingSnapshots();
    const snapshot = snapshots.find((s) => s.user_id === userId);
    if (snapshot) await reconcileFollowUpsForSnapshot({ ...snapshot, follow_ups_paused_at: null });
  }
  return { ok: true };
}

export async function sendManualOnboardingFollowUp(input: {
  userId: string;
  templateId: string;
  stage: AccountOnboardingStage;
}) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) return { ok: false as const, error: 'Server misconfigured' };
  const snapshots = await listOnboardingSnapshots();
  const snapshot = snapshots.find((s) => s.user_id === input.userId);
  if (!snapshot || !snapshot.email) return { ok: false as const, error: 'User not found or missing email' };
  const tpl = resolvePostmarkTemplateFromEnv(input.templateId);
  if (!tpl.templateAlias && !tpl.templateId) return { ok: false as const, error: 'Template not configured' };

  const sent = await sendTemplatedEmail({
    to: snapshot.email,
    templateAlias: tpl.templateAlias,
    templateId: tpl.templateId,
    templateModel: buildOnboardingFollowUpTemplateModel(snapshot, {
      stage: input.stage,
      stepKey: 'manual',
    }),
    tag: 'onboarding_follow_up_manual',
    metadata: {
      user_id: snapshot.user_id,
      stage: input.stage,
      step_key: 'manual',
    },
  });
  if (!sent.ok) return { ok: false as const, error: sent.error ?? 'Failed to send' };
  await admin.from('onboarding_follow_ups').insert({
    user_id: snapshot.user_id,
    onboarding_stage_at_schedule: input.stage,
    template_id: input.templateId,
    scheduled_for: new Date().toISOString(),
    status: 'SENT',
    step_key: 'manual',
  });
  return { ok: true as const };
}
