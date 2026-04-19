'use client';

import { AlertTriangle, KeyRound, Mail, ShieldAlert, ShieldOff, UserCog, Users } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { SecurityConsolePayload, SecurityConsoleTab } from '@/components/admin/security/types';

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  onClick,
  tone = 'default',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Users;
  onClick?: () => void;
  tone?: 'default' | 'warning' | 'muted';
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col rounded-xl border border-zinc-200/90 bg-white p-4 text-left shadow-sm transition dark:border-zinc-800 dark:bg-zinc-950',
        onClick && 'cursor-pointer hover:border-zinc-300 hover:shadow-md dark:hover:border-zinc-600',
        tone === 'warning' && 'border-amber-200/80 dark:border-amber-900/50',
        tone === 'muted' && 'opacity-95'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">{title}</p>
        <Icon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
      {subtitle ? (
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">{subtitle}</p>
      ) : null}
    </Comp>
  );
}

export function AdminSecurityOverview({
  data,
  onNavigate,
}: {
  data: SecurityConsolePayload;
  onNavigate: (tab: SecurityConsoleTab, options?: { activityCategory?: string; access?: 'no_mfa' | 'suspended' }) => void;
}) {
  const { overview } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Security posture</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Operational snapshot for internal staff access, invitations, and high-signal audit events. Drill into tabs
          for detail.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Failed sign-ins"
          value="—"
          subtitle={overview.failed_logins_note}
          icon={ShieldAlert}
          tone="muted"
        />
        <StatCard
          title="Pending invites"
          value={overview.pending_invites}
          subtitle="Internal admin & support invitations awaiting acceptance."
          icon={Mail}
          onClick={() => onNavigate('access')}
        />
        <StatCard
          title="Staff without MFA"
          value={overview.staff_without_mfa}
          subtitle={
            data.policies.require_mfa_for_internal_staff
              ? 'Policy requires MFA — these accounts are non-compliant until enrolled.'
              : 'Verified TOTP (or other factors) from Auth; enroll under tenant Security settings.'
          }
          icon={ShieldOff}
          tone={overview.staff_without_mfa > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate('access', { access: 'no_mfa' })}
        />
        <StatCard
          title="Role changes (30d)"
          value={overview.role_changes_30d}
          subtitle="Internal staff role updates recorded in the audit log."
          icon={UserCog}
          onClick={() => onNavigate('activity', { activityCategory: 'access' })}
        />
        <StatCard
          title="Suspended internal staff"
          value={overview.suspended_internal_staff}
          subtitle="Profiles with internal admin suspension."
          icon={Users}
          onClick={() => onNavigate('access', { access: 'suspended' })}
        />
        <StatCard
          title="Security signals (7d)"
          value={overview.security_signals_7d}
          subtitle="Suspensions, password resets, policy changes, and related actions."
          icon={AlertTriangle}
          onClick={() => onNavigate('activity')}
        />
        <StatCard
          title="Invite events (30d)"
          value={overview.invite_events_30d}
          subtitle="Created, resent, revoked, and accepted internal invites."
          icon={Mail}
          onClick={() => onNavigate('activity', { activityCategory: 'invites' })}
        />
        <StatCard
          title="Subscriber password resets (30d)"
          value={overview.password_resets_30d}
          subtitle="Admin-initiated password recovery for tenant users."
          icon={KeyRound}
          onClick={() => onNavigate('activity', { activityCategory: 'password' })}
        />
      </div>
    </div>
  );
}
