import type { AdminRole } from '@/lib/admin/auth';

/** Admin-facing account (subscriber business) lifecycle. */
export type AccountLifecycleStatus = 'active' | 'suspended' | 'deactivated';

/** Admin-facing tenant user row (owner or member). */
export type TenantUserLifecycleStatus = 'active' | 'suspended' | 'deactivated' | 'pending' | 'invited';

export type AccountLifecycleAction = 'suspend' | 'reactivate' | 'deactivate';

export function deriveAccountLifecycleStatus(row: {
  admin_suspended_at?: string | null;
  admin_deactivated_at?: string | null;
}): AccountLifecycleStatus {
  if (row.admin_deactivated_at) return 'deactivated';
  if (row.admin_suspended_at) return 'suspended';
  return 'active';
}

export function deriveMemberUserStatus(row: {
  suspended_at?: string | null;
  deactivated_at?: string | null;
  last_sign_in_at?: string | null;
}): Exclude<TenantUserLifecycleStatus, 'invited'> {
  if (row.deactivated_at) return 'deactivated';
  if (row.suspended_at) return 'suspended';
  if (!row.last_sign_in_at) return 'pending';
  return 'active';
}

export function deriveOwnerUserStatus(row: {
  subscriber_admin_suspended_at?: string | null;
  subscriber_admin_deactivated_at?: string | null;
  last_sign_in_at?: string | null;
}): Exclude<TenantUserLifecycleStatus, 'invited'> {
  if (row.subscriber_admin_deactivated_at) return 'deactivated';
  if (row.subscriber_admin_suspended_at) return 'suspended';
  if (!row.last_sign_in_at) return 'pending';
  return 'active';
}

/** Allowed account lifecycle transition for validation (server). */
export function nextAccountStatusAfterAction(
  current: AccountLifecycleStatus,
  action: AccountLifecycleAction
): AccountLifecycleStatus | null {
  if (action === 'suspend') {
    if (current === 'active') return 'suspended';
    return null;
  }
  if (action === 'deactivate') {
    if (current === 'active' || current === 'suspended') return 'deactivated';
    return null;
  }
  if (action === 'reactivate') {
    if (current === 'suspended' || current === 'deactivated') return 'active';
    return null;
  }
  return null;
}

/** Actions to show in admin account menu (no duplicates for current state). */
export function allowedAccountLifecycleActions(status: AccountLifecycleStatus): AccountLifecycleAction[] {
  switch (status) {
    case 'active':
      return ['suspend', 'deactivate'];
    case 'suspended':
      return ['reactivate', 'deactivate'];
    case 'deactivated':
      return ['reactivate'];
    default:
      return [];
  }
}

/** Internal admin: owner/admin can change subscriber lifecycle; support is read-only. */
export function canManageSubscriberLifecycle(actor: AdminRole): boolean {
  return actor === 'owner' || actor === 'admin';
}

export type AccountLifecycleState =
  | 'UNVERIFIED'
  | 'VERIFIED_NOT_SIGNED_IN'
  | 'SIGNED_IN_ONBOARDING_INCOMPLETE'
  | 'ACTIVE';

export type AccountOnboardingStatus = 'not_started' | 'in_progress' | 'completed';

const UNVERIFIED_ATTENTION_AFTER_HOURS = 24;

type AccountLifecycleDeriveInput = {
  created_at?: string | null;
  email_verified_at?: string | null;
  last_sign_in_at?: string | null;
  onboarding_started_at?: string | null;
  onboarding_completed_at?: string | null;
};

export type DerivedAccountLifecycle = {
  lifecycle_state: AccountLifecycleState;
  needs_attention: boolean;
  onboarding_status: AccountOnboardingStatus;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  email_verified_at: string | null;
  last_sign_in_at: string | null;
};

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return (Date.now() - ts) / (1000 * 60 * 60);
}

export function deriveAccountLifecycle(input: AccountLifecycleDeriveInput): DerivedAccountLifecycle {
  const onboardingStartedAt = input.onboarding_started_at ?? null;
  const onboardingCompletedAt = input.onboarding_completed_at ?? null;
  const emailVerifiedAt = input.email_verified_at ?? null;
  const lastSignInAt = input.last_sign_in_at ?? null;

  const onboardingStatus: AccountOnboardingStatus = onboardingCompletedAt
    ? 'completed'
    : onboardingStartedAt
      ? 'in_progress'
      : 'not_started';

  let lifecycleState: AccountLifecycleState = 'UNVERIFIED';
  if (!emailVerifiedAt) {
    lifecycleState = 'UNVERIFIED';
  } else if (!lastSignInAt) {
    lifecycleState = 'VERIFIED_NOT_SIGNED_IN';
  } else if (!onboardingCompletedAt) {
    lifecycleState = 'SIGNED_IN_ONBOARDING_INCOMPLETE';
  } else {
    lifecycleState = 'ACTIVE';
  }

  const unverifiedTooLong = !emailVerifiedAt && (hoursSince(input.created_at) ?? 0) >= UNVERIFIED_ATTENTION_AFTER_HOURS;
  const needsAttention =
    unverifiedTooLong ||
    lifecycleState === 'VERIFIED_NOT_SIGNED_IN' ||
    lifecycleState === 'SIGNED_IN_ONBOARDING_INCOMPLETE';

  return {
    lifecycle_state: lifecycleState,
    needs_attention: needsAttention,
    onboarding_status: onboardingStatus,
    onboarding_started_at: onboardingStartedAt,
    onboarding_completed_at: onboardingCompletedAt,
    email_verified_at: emailVerifiedAt,
    last_sign_in_at: lastSignInAt,
  };
}

export type AccountLifecycleTimelineEventType =
  | 'account_created'
  | 'verification_email_sent'
  | 'email_verified'
  | 'first_sign_in'
  | 'onboarding_started'
  | 'onboarding_completed';

export type AccountLifecycleTimelineEvent = {
  type: AccountLifecycleTimelineEventType;
  label: string;
  at: string;
};

export function buildAccountLifecycleTimeline(input: {
  created_at?: string | null;
  verification_email_sent_at?: string | null;
  email_verified_at?: string | null;
  first_sign_in_at?: string | null;
  onboarding_started_at?: string | null;
  onboarding_completed_at?: string | null;
}): AccountLifecycleTimelineEvent[] {
  const rows: Array<AccountLifecycleTimelineEvent | null> = [
    input.created_at
      ? {
          type: 'account_created',
          label: 'Account created',
          at: input.created_at,
        }
      : null,
    input.verification_email_sent_at
      ? {
          type: 'verification_email_sent',
          label: 'Verification email sent',
          at: input.verification_email_sent_at,
        }
      : null,
    input.email_verified_at
      ? {
          type: 'email_verified',
          label: 'Email verified',
          at: input.email_verified_at,
        }
      : null,
    input.first_sign_in_at
      ? {
          type: 'first_sign_in',
          label: 'First sign-in',
          at: input.first_sign_in_at,
        }
      : null,
    input.onboarding_started_at
      ? {
          type: 'onboarding_started',
          label: 'Onboarding started',
          at: input.onboarding_started_at,
        }
      : null,
    input.onboarding_completed_at
      ? {
          type: 'onboarding_completed',
          label: 'Onboarding completed',
          at: input.onboarding_completed_at,
        }
      : null,
  ];
  return rows
    .filter((row): row is AccountLifecycleTimelineEvent => Boolean(row))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
