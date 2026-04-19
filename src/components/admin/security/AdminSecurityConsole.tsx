'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';
import { AdminSecurityOverview } from '@/components/admin/security/AdminSecurityOverview';
import { AdminSecurityAccessSection } from '@/components/admin/security/AdminSecurityAccessSection';
import { AdminSecurityActivitySection } from '@/components/admin/security/AdminSecurityActivitySection';
import { AdminSecurityPoliciesSection } from '@/components/admin/security/AdminSecurityPoliciesSection';
import type {
  SecurityConsolePayload,
  SecurityConsoleTab,
  SecurityPoliciesDTO,
} from '@/components/admin/security/types';
import { adminAuditTargetDescription } from '@/lib/admin/admin-audit-target-display';
import { cn } from '@/lib/utils/cn';

function roleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === 'owner') return 'Owner';
  if (r === 'admin') return 'Admin';
  if (r === 'support') return 'Support';
  return role;
}

const TABS: { id: SecurityConsoleTab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Posture & signals' },
  { id: 'access', label: 'Access', hint: 'Staff & invites' },
  { id: 'activity', label: 'Activity', hint: 'Audit & sign-ins' },
  { id: 'policies', label: 'Policies', hint: 'Owner controls' },
];

function normalizeTab(raw: string | null): SecurityConsoleTab {
  if (raw === 'access' || raw === 'activity' || raw === 'policies' || raw === 'overview') return raw;
  return 'overview';
}

export function AdminSecurityConsole({
  data,
  onPoliciesSaved,
}: {
  data: SecurityConsolePayload;
  onPoliciesSaved: (p: SecurityPoliciesDTO) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = useMemo(() => normalizeTab(searchParams.get('tab')), [searchParams]);
  const activityCategory = searchParams.get('category') ?? 'all';
  const accessFilter = searchParams.get('access');

  const navigate = useCallback(
    (t: SecurityConsoleTab, options?: { activityCategory?: string; access?: 'no_mfa' | 'suspended' }) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set('tab', t);
      if (options?.activityCategory) p.set('category', options.activityCategory);
      else if (t !== 'activity') p.delete('category');
      if (options?.access) p.set('access', options.access);
      else if (t !== 'access') p.delete('access');
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Security console</p>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Access, audit, and policy</h1>
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Operational center for internal back-office risk: who has access, what changed, and which guardrails owners
          expect.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(t.id)}
            className={cn(
              'rounded-lg px-3 py-2 text-left transition',
              tab === t.id
                ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
            )}
          >
            <span className="block text-sm font-semibold">{t.label}</span>
            <span
              className={cn(
                'mt-0.5 block text-[11px] font-normal',
                tab === t.id ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-500'
              )}
            >
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      <AdminContentCard padding="p-6">
        {tab === 'overview' ? <AdminSecurityOverview data={data} onNavigate={navigate} /> : null}
        {tab === 'access' ? (
          <AdminSecurityAccessSection
            staff={data.staff_access}
            invites={data.invites}
            accessFilter={accessFilter}
          />
        ) : null}
        {tab === 'activity' ? (
          <AdminSecurityActivitySection
            key={searchParams.toString()}
            initialCategory={activityCategory}
            loginSnapshot={data.login_snapshot}
          />
        ) : null}
        {tab === 'policies' ? (
          <AdminSecurityPoliciesSection
            key={data.policies.updated_at ?? 'new'}
            initial={data.policies}
            canEdit={data.capabilities.canEditPolicies}
            onSaved={onPoliciesSaved}
          />
        ) : null}
      </AdminContentCard>

      {tab === 'overview' && data.recent_audit_logs.length > 0 ? (
        <AdminContentCard padding="p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Latest audit entries</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Most recent events — open Activity for full search and pagination.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('activity')}
              className="text-xs font-medium text-zinc-900 underline dark:text-zinc-100"
            >
              Open activity →
            </button>
          </div>
          <div className="mt-4">
            <AdminTable>
              <AdminTableHead>
                <AdminTh>When</AdminTh>
                <AdminTh>Actor</AdminTh>
                <AdminTh>Action</AdminTh>
                <AdminTh>Target</AdminTh>
              </AdminTableHead>
              <tbody>
                {data.recent_audit_logs.slice(0, 8).map((r) => (
                  <AdminTr key={r.id}>
                    <AdminTd className="whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                      {new Date(r.created_at).toLocaleString()}
                    </AdminTd>
                    <AdminTd>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {r.actor_display ?? `${r.actor_user_id.slice(0, 8)}…`}
                        </span>
                        <AdminBadge tone="neutral">{roleLabel(r.actor_role)}</AdminBadge>
                      </div>
                    </AdminTd>
                    <AdminTd className="text-sm text-zinc-800 dark:text-zinc-200">
                      {r.action_label ?? r.action}
                    </AdminTd>
                    <AdminTd className="max-w-md break-words text-xs text-zinc-600 dark:text-zinc-400">
                      {r.target_display ?? adminAuditTargetDescription(r)}
                    </AdminTd>
                  </AdminTr>
                ))}
              </tbody>
            </AdminTable>
          </div>
        </AdminContentCard>
      ) : null}
    </div>
  );
}
