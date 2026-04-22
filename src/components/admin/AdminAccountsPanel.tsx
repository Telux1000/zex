'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import {
  allowedAccountLifecycleActions,
  type AccountLifecycleAction,
  type AccountLifecycleStatus,
} from '@/lib/admin/account-lifecycle';
import { AdminAccountsOnboardingPanel } from '@/components/admin/AdminAccountsOnboardingPanel';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminRowActions, type AdminRowActionItem } from '@/components/admin/AdminRowActions';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';
import { cn } from '@/lib/utils/cn';

type AccountRow = {
  id: string;
  name: string;
  owner_name: string;
  owner_email: string;
  current_plan: string;
  subscription_status: string;
  trial_status: string;
  created_at: string;
  last_active_at: string | null;
  users_count: number;
  usage_summary?: {
    invoices_30d: number;
    ai_usage_30d: number;
    reminders_30d: number;
    scheduled_sends_30d: number;
  };
};

const MS_DAY = 86_400_000;

function lastEventWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= days * MS_DAY;
}

/** No product activity in the rolling window used by admin accounts (see API). */
function matchesAccountsDrilldown(
  row: AccountRow,
  activity: string | null,
  usage: string | null
): boolean {
  if (activity === 'active_30d') {
    if (!lastEventWithinDays(row.last_active_at, 30)) return false;
  } else if (activity === 'inactive_30d') {
    if (lastEventWithinDays(row.last_active_at, 30)) return false;
  } else if (activity === 'no_activity') {
    if (row.last_active_at) return false;
    const u = row.usage_summary;
    if (u && u.invoices_30d + u.ai_usage_30d + u.reminders_30d + u.scheduled_sends_30d > 0) return false;
  }

  if (usage === 'ai_30d') {
    if (!row.usage_summary || row.usage_summary.ai_usage_30d <= 0) return false;
  } else if (usage === 'reminders_30d') {
    if (!row.usage_summary || row.usage_summary.reminders_30d <= 0) return false;
  } else if (usage === 'scheduled_30d') {
    if (!row.usage_summary || row.usage_summary.scheduled_sends_30d <= 0) return false;
  }

  return true;
}

function accountStatus(row: AccountRow): { label: string; tone: 'active' | 'pending' | 'suspended' } {
  const s = row.subscription_status as AccountLifecycleStatus | string;
  if (s === 'deactivated') return { label: 'Deactivated', tone: 'suspended' };
  if (s === 'suspended') return { label: 'Suspended', tone: 'suspended' };
  if (row.trial_status.toLowerCase().includes('in_trial')) return { label: 'Trial', tone: 'pending' };
  return { label: 'Active', tone: 'active' };
}

function matchesQuery(row: AccountRow, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    row.name.toLowerCase().includes(s) ||
    row.owner_name.toLowerCase().includes(s) ||
    row.owner_email.toLowerCase().includes(s) ||
    row.current_plan.toLowerCase().includes(s) ||
    row.subscription_status.toLowerCase().includes(s)
  );
}

export function AdminAccountsPanel() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [actor, setActor] = useState<{ canManageLifecycle: boolean }>({ canManageLifecycle: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountLifecycleStatus>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [confirm, setConfirm] = useState<{ accountId: string; action: AccountLifecycleAction } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = searchParams.get('view') === 'onboarding' ? 'onboarding' : 'accounts';
  const drillActivity = searchParams.get('activity');
  const drillUsage = searchParams.get('usage');
  const drillRange = searchParams.get('range');

  useEffect(() => {
    if (activeView !== 'accounts') {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch('/api/admin/accounts')
      .then(async (r) => {
        const json = (await r.json()) as {
          accounts?: AccountRow[];
          actor?: { canManageLifecycle: boolean };
          error?: string;
        };
        if (!r.ok) {
          throw new Error(json.error ?? r.statusText ?? 'Failed to load accounts');
        }
        setRows(json.accounts ?? []);
        setActor(json.actor ?? { canManageLifecycle: false });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load accounts'))
      .finally(() => setLoading(false));
  }, [activeView]);

  function setView(nextView: 'accounts' | 'onboarding') {
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === 'onboarding') params.set('view', 'onboarding');
    else params.delete('view');
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  const planOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.current_plan) set.add(String(r.current_plan));
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((a) => {
      if (statusFilter !== 'all' && a.subscription_status !== statusFilter) return false;
      if (planFilter !== 'all' && a.current_plan !== planFilter) return false;
      if (!matchesAccountsDrilldown(a, drillActivity, drillUsage)) return false;
      return matchesQuery(a, search);
    });
  }, [rows, search, statusFilter, planFilter, drillActivity, drillUsage]);

  const drillBanner = useMemo(() => {
    if (!drillActivity && !drillUsage) return null;
    const parts: string[] = [];
    if (drillActivity === 'active_30d') parts.push('product activity in the last 30 days');
    if (drillActivity === 'inactive_30d') parts.push('no product activity in the last 30 days');
    if (drillActivity === 'no_activity') parts.push('no recorded product activity (onboarding risk)');
    if (drillUsage === 'ai_30d') parts.push('AI usage in the last 30 days');
    if (drillUsage === 'reminders_30d') parts.push('reminders sent in the last 30 days');
    if (drillUsage === 'scheduled_30d') parts.push('scheduled sends in the last 30 days');
    if (parts.length === 0) return null;
    const rangeNote = drillRange === '30d' ? ' · window: 30d' : '';
    return `Filtered from Analytics: ${parts.join('; ')}${rangeNote}.`;
  }, [drillActivity, drillUsage, drillRange]);

  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/admin/accounts/${confirm.accountId}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: confirm.action }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Action failed.');
        return;
      }
      setConfirm(null);
      const listRes = await fetch('/api/admin/accounts');
      const json = (await listRes.json()) as { accounts?: AccountRow[]; actor?: { canManageLifecycle: boolean } };
      if (listRes.ok) {
        setRows(json.accounts ?? []);
        setActor(json.actor ?? { canManageLifecycle: false });
        setError(null);
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  function buildAccountRowActions(accountId: string, lifecycle: AccountLifecycleStatus): AdminRowActionItem[] {
    if (!actor.canManageLifecycle) return [];
    const allowed = allowedAccountLifecycleActions(lifecycle);
    return allowed.map((a) => ({
      label: a === 'suspend' ? 'Suspend account' : a === 'deactivate' ? 'Deactivate account' : 'Reactivate account',
      danger: a === 'suspend' || a === 'deactivate',
      onClick: () => setConfirm({ accountId, action: a }),
    }));
  }

  if (activeView === 'accounts' && error) {
    return (
      <AdminContentCard className="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </AdminContentCard>
    );
  }

  if (activeView === 'accounts' && loading) {
    return (
      <AdminContentCard>
        <p className="text-sm text-zinc-500">Loading accounts…</p>
      </AdminContentCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setView('accounts')}
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-semibold transition',
            activeView === 'accounts'
              ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
          )}
        >
          Accounts
        </button>
        <button
          type="button"
          onClick={() => setView('onboarding')}
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-semibold transition',
            activeView === 'onboarding'
              ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
          )}
        >
          Onboarding
        </button>
      </div>

      {activeView === 'onboarding' ? (
        <AdminAccountsOnboardingPanel />
      ) : (
        <AdminContentCard>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Accounts are the primary entity. Click a row to manage members and user operations.
          </p>
      {drillBanner ? (
        <p className="mt-3 rounded-lg border border-sky-200/90 bg-sky-50/80 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
          {drillBanner}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, owner, plan…"
            className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Filter accounts"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | AccountLifecycleStatus)}
              className="h-9 min-w-[8rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Plan
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="h-9 min-w-[8rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">All plans</option>
              {planOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-zinc-500 sm:ml-auto">
          {filtered.length === rows.length ? `${rows.length} accounts` : `${filtered.length} of ${rows.length} accounts`}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-zinc-500">No accounts to show.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-zinc-500">No accounts match your filters.</p>
      ) : (
        <div className="mt-4">
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Company</AdminTh>
              <AdminTh>Owner</AdminTh>
              <AdminTh>Plan</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Users</AdminTh>
              <AdminTh>Created</AdminTh>
              <AdminTh>Last active</AdminTh>
              <AdminTh className="w-12 text-right"> </AdminTh>
            </AdminTableHead>
            <tbody>
              {filtered.map((a) => {
                const status = accountStatus(a);
                const ls = a.subscription_status as AccountLifecycleStatus;
                const actions = buildAccountRowActions(a.id, ls);
                return (
                  <AdminTr
                    key={a.id}
                    className={cn('cursor-pointer')}
                    onClick={() => router.push(`/admin/accounts/${a.id}`)}
                  >
                    <AdminTd className="font-medium text-zinc-900 dark:text-zinc-100">{a.name}</AdminTd>
                    <AdminTd>
                      <p>{a.owner_name}</p>
                      <p className="text-xs text-zinc-500">{a.owner_email}</p>
                    </AdminTd>
                    <AdminTd>{a.current_plan}</AdminTd>
                    <AdminTd>
                      <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                    </AdminTd>
                    <AdminTd>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/accounts/${a.id}`);
                        }}
                        className="inline-flex"
                        aria-label={`Open ${a.name} users`}
                      >
                        <AdminBadge tone="neutral">
                          {a.users_count} {a.users_count === 1 ? 'user' : 'users'}
                        </AdminBadge>
                      </button>
                    </AdminTd>
                    <AdminTd className="whitespace-nowrap text-zinc-600">{new Date(a.created_at).toLocaleDateString()}</AdminTd>
                    <AdminTd className="text-zinc-600 dark:text-zinc-400">
                      {a.last_active_at ? new Date(a.last_active_at).toLocaleString() : '—'}
                    </AdminTd>
                    <AdminTd className="text-right" onClick={(e) => e.stopPropagation()}>
                      {actions.length > 0 ? <AdminRowActions items={actions} /> : null}
                    </AdminTd>
                  </AdminTr>
                );
              })}
            </tbody>
          </AdminTable>
        </div>
      )}

      <AdminConfirmDialog
        open={confirm !== null}
        title={
          confirm?.action === 'suspend'
            ? 'Suspend account?'
            : confirm?.action === 'deactivate'
              ? 'Deactivate account?'
              : 'Reactivate account?'
        }
        description={
          confirm?.action === 'suspend'
            ? 'Subscribers will be blocked from using this workspace until reactivated. Data is preserved.'
            : confirm?.action === 'deactivate'
              ? 'Stronger shutdown: the workspace is disabled until explicitly reactivated. Data is preserved.'
              : 'Restore normal access for this workspace.'
        }
        variant={confirm?.action === 'reactivate' ? 'default' : 'danger'}
        confirmLabel={
          confirm?.action === 'suspend' ? 'Suspend' : confirm?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'
        }
        busy={confirmBusy}
        onClose={() => !confirmBusy && setConfirm(null)}
        onConfirm={runConfirm}
      />
        </AdminContentCard>
      )}
    </div>
  );
}
