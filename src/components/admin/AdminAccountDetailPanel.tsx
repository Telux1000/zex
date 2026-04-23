'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import {
  allowedAccountLifecycleActions,
  type AccountLifecycleAction,
  type AccountLifecycleStatus,
  type TenantUserLifecycleStatus,
} from '@/lib/admin/account-lifecycle';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminRowActions, type AdminRowActionItem } from '@/components/admin/AdminRowActions';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';
import { AdminMemberRolePicker } from '@/components/admin/AdminMemberRolePicker';
import {
  buildInviteRolePickerOptions,
  buildMemberRolePickerOptions,
  canChangeSubscriberMemberRole,
} from '@/lib/admin/account-member-role-policy';
import {
  adminRoleLabel,
  type AdminAccountMemberRole,
  type AdminAssignableMemberRole,
} from '@/lib/admin/account-member-roles';
import { AdminAccountAuditSection } from '@/components/admin/AdminAccountAuditSection';
import { cn } from '@/lib/utils/cn';

type UserRowStatus = TenantUserLifecycleStatus;

type DetailPayload = {
  actor: { role: string; canManageLifecycle: boolean };
  account: {
    id: string;
    name: string;
    owner: { id: string; name: string; email: string };
    plan: string;
    lifecycle_status: AccountLifecycleStatus;
    trial_status?: string;
    status_days_left?: number | null;
    created_at: string;
    users_count: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: AdminAccountMemberRole;
    status: UserRowStatus;
    created_at: string;
    last_active_at: string | null;
  }>;
  pending_invites: Array<{
    id: string;
    email: string;
    role: Exclude<AdminAccountMemberRole, 'owner'>;
    status: 'pending' | 'invited';
    created_at: string;
    expires_at: string;
  }>;
};

type ConfirmState =
  | { scope: 'account'; action: AccountLifecycleAction }
  | { scope: 'user'; userId: string; action: 'suspend' | 'reactivate' | 'deactivate' | 'remove' }
  | null;

function statusBadgeTone(
  s: UserRowStatus | AccountLifecycleStatus | 'invited'
): 'active' | 'pending' | 'suspended' {
  if (s === 'active') return 'active';
  if (s === 'pending' || s === 'invited') return 'pending';
  return 'suspended';
}

function formatStatusLabel(s: string): string {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function formatAccountStatusBadgeLabel(account: DetailPayload['account']): string {
  const days = account.status_days_left;
  const suffix =
    typeof days === 'number' && days >= 0 ? ` . ${days} day${days === 1 ? '' : 's'} Left` : '';
  if (account.trial_status?.toLowerCase().includes('in_trial')) return `Trial${suffix}`;
  return `${formatStatusLabel(account.lifecycle_status)}${suffix}`;
}

/** Match server: no reset for deactivated subscriber users; pending/active/suspended OK. */
function canOfferSubscriberPasswordReset(u: { status: UserRowStatus }): boolean {
  return u.status !== 'deactivated';
}

export function AdminAccountDetailPanel({ accountId }: { accountId: string }) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminAssignableMemberRole>('member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [roleConfirm, setRoleConfirm] = useState<{
    userId: string;
    name: string;
    from: AdminAssignableMemberRole;
    to: AdminAssignableMemberRole;
  } | null>(null);
  const [roleConfirmBusy, setRoleConfirmBusy] = useState(false);
  const [roleDialogUser, setRoleDialogUser] = useState<DetailPayload['users'][number] | null>(null);
  const [roleDraft, setRoleDraft] = useState<AdminAssignableMemberRole>('member');

  const [tableSearch, setTableSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AdminAccountMemberRole>('all');

  const [passwordResetConfirm, setPasswordResetConfirm] = useState<{
    userId: string;
    name: string;
    email: string;
  } | null>(null);
  const [passwordResetBusy, setPasswordResetBusy] = useState(false);
  const [userActionMsg, setUserActionMsg] = useState<string | null>(null);
  const [accountSection, setAccountSection] = useState<'users' | 'activity'>('users');

  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}`);
      const json = (await res.json()) as DetailPayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Failed to load account details.');
        return;
      }
      setData(json);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const members = useMemo(() => data?.users ?? [], [data]);
  const invites = useMemo(() => data?.pending_invites ?? [], [data]);
  const canManage = data?.actor.canManageLifecycle ?? false;
  const adminMemberCount = useMemo(() => members.filter((m) => m.role === 'admin').length, [members]);

  useEffect(() => {
    if (roleDialogUser && roleDialogUser.role !== 'owner') {
      setRoleDraft(roleDialogUser.role as AdminAssignableMemberRole);
    }
  }, [roleDialogUser]);

  const filteredMembers = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return members.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.status.toLowerCase().includes(q)
      );
    });
  }, [members, tableSearch, roleFilter]);

  const filteredInvites = useMemo(() => {
    if (roleFilter === 'owner') return [];
    const q = tableSearch.trim().toLowerCase();
    return invites.filter((i) => {
      if (roleFilter !== 'all' && i.role !== roleFilter) return false;
      if (!q) return true;
      return i.email.toLowerCase().includes(q);
    });
  }, [invites, tableSearch, roleFilter]);

  async function runRoleConfirm() {
    if (!roleConfirm) return;
    setRoleConfirmBusy(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/users/${roleConfirm.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: roleConfirm.to }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Role change failed.');
        return;
      }
      setRoleConfirm(null);
      setError(null);
      await load();
    } finally {
      setRoleConfirmBusy(false);
    }
  }

  async function runPasswordResetSend() {
    if (!passwordResetConfirm) return;
    setPasswordResetBusy(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/users/${passwordResetConfirm.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'password_reset' }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Could not send reset email.');
        return;
      }
      setPasswordResetConfirm(null);
      setError(null);
      setUserActionMsg('Password reset email sent.');
      await load();
    } finally {
      setPasswordResetBusy(false);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.scope === 'account') {
        const res = await fetch(`/api/admin/accounts/${accountId}/lifecycle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: confirm.action }),
        });
        if (!res.ok) {
          const j = await res.json();
          setError(j.error ?? 'Account action failed.');
          return;
        }
      } else {
        const res = await fetch(`/api/admin/accounts/${accountId}/users/${confirm.userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: confirm.action }),
        });
        if (!res.ok) {
          const j = await res.json();
          setError(j.error ?? 'User action failed.');
          return;
        }
      }
      setConfirm(null);
      setError(null);
      await load();
    } finally {
      setConfirmBusy(false);
    }
  }

  function buildUserMenu(u: DetailPayload['users'][number]): AdminRowActionItem[] {
    const safe: AdminRowActionItem[] = [{ label: 'View account', onClick: () => router.push(`/admin/accounts/${accountId}`) }];
    if (!canManage) return safe;

    if (u.role === 'owner') {
      const resetItem: AdminRowActionItem[] = [];
      if (canOfferSubscriberPasswordReset(u)) {
        resetItem.push({
          label: 'Send reset',
          onClick: () => {
            setUserActionMsg(null);
            setPasswordResetConfirm({ userId: u.id, name: u.name, email: u.email });
          },
        });
      }
      const risky: AdminRowActionItem[] = [];
      if (u.status === 'active' || u.status === 'pending') {
        risky.push({ label: 'Suspend user', danger: true, onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'suspend' }) });
        risky.push({ label: 'Deactivate user', danger: true, onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'deactivate' }) });
      }
      if (u.status === 'suspended') {
        risky.push({ label: 'Reactivate user', onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'reactivate' }) });
        risky.push({ label: 'Deactivate user', danger: true, onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'deactivate' }) });
      }
      if (u.status === 'deactivated') {
        risky.push({ label: 'Reactivate user', onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'reactivate' }) });
      }
      if (risky.length === 0 && resetItem.length === 0) return safe;
      return [
        ...safe,
        ...(resetItem.length ? [{ divider: true } as const, ...resetItem] : []),
        ...(risky.length ? [{ divider: true } as const, ...risky] : []),
      ];
    }

    const changeRoleItem: AdminRowActionItem[] = [];
    if (canChangeSubscriberMemberRole({ canManageLifecycle: canManage, memberRole: u.role, memberStatus: u.status })) {
      changeRoleItem.push({
        label: 'Change role',
        onClick: () => setRoleDialogUser(u),
      });
    }

    const sendResetItem: AdminRowActionItem[] = [];
    if (canOfferSubscriberPasswordReset(u)) {
      sendResetItem.push({
        label: 'Send reset',
        onClick: () => {
          setUserActionMsg(null);
          setPasswordResetConfirm({ userId: u.id, name: u.name, email: u.email });
        },
      });
    }

    const mid: AdminRowActionItem[] = [...changeRoleItem, ...sendResetItem];

    if (u.status === 'pending') {
      if (mid.length) return [...safe, { divider: true }, ...mid];
      return safe;
    }

    const risky: AdminRowActionItem[] = [];
    if (u.status === 'active') {
      risky.push({ label: 'Suspend user', danger: true, onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'suspend' }) });
      risky.push({ label: 'Deactivate user', danger: true, onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'deactivate' }) });
    }
    if (u.status === 'suspended') {
      risky.push({ label: 'Reactivate user', onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'reactivate' }) });
      risky.push({ label: 'Deactivate user', danger: true, onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'deactivate' }) });
    }
    if (u.status === 'deactivated') {
      risky.push({ label: 'Reactivate user', onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'reactivate' }) });
    }
    if (u.status !== 'deactivated') {
      risky.push({ label: 'Remove user', danger: true, onClick: () => setConfirm({ scope: 'user', userId: u.id, action: 'remove' }) });
    }

    if (mid.length && risky.length) return [...safe, { divider: true }, ...mid, { divider: true }, ...risky];
    if (mid.length) return [...safe, { divider: true }, ...mid];
    if (risky.length) return [...safe, { divider: true }, ...risky];
    return safe;
  }

  function buildAccountMenu(ls: AccountLifecycleStatus): AdminRowActionItem[] {
    if (!canManage) return [];
    const allowed = allowedAccountLifecycleActions(ls);
    const items: AdminRowActionItem[] = [];
    for (const a of allowed) {
      const label =
        a === 'suspend'
          ? 'Suspend account'
          : a === 'deactivate'
            ? 'Deactivate account'
            : 'Reactivate account';
      const danger = a === 'suspend' || a === 'deactivate';
      items.push({
        label,
        danger,
        onClick: () => setConfirm({ scope: 'account', action: a }),
      });
    }
    return items;
  }

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteError(json.error ?? 'Could not send invite.');
        return;
      }
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('member');
      await load();
    } finally {
      setInviteBusy(false);
    }
  }

  if (loading) return <AdminContentCard><p className="text-sm text-zinc-500">Loading account…</p></AdminContentCard>;
  if (error || !data) return <AdminContentCard className="border-red-200 bg-red-50/80"><p className="text-sm text-red-700">{error ?? 'Not found'}</p></AdminContentCard>;

  const ls = data.account.lifecycle_status;
  const accountMenu = buildAccountMenu(ls);

  return (
    <div className="space-y-6">
      <AdminContentCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{data.account.name}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Owner: {data.account.owner.name} ({data.account.owner.email})</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <AdminBadge tone="neutral">Plan: {data.account.plan}</AdminBadge>
              <AdminBadge tone={statusBadgeTone(ls)}>{formatAccountStatusBadgeLabel(data.account)}</AdminBadge>
              <AdminBadge tone="neutral">{data.account.users_count} users</AdminBadge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <button
                type="button"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
                onClick={() => setShowInvite(true)}
              >
                Invite user
              </button>
            ) : null}
            {accountMenu.length > 0 ? <AdminRowActions items={accountMenu} /> : null}
          </div>
        </div>
        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div
            className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            role="tablist"
            aria-label="Account sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={accountSection === 'users'}
              onClick={() => setAccountSection('users')}
              className={cn(
                'rounded px-2 py-1 transition-colors',
                accountSection === 'users'
                  ? 'bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              )}
            >
              Users
            </button>
            <button
              type="button"
              disabled
              className="rounded px-2 py-1 text-zinc-500 disabled:cursor-not-allowed dark:text-zinc-400"
              title="Billing section coming soon"
            >
              Billing
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={accountSection === 'activity'}
              onClick={() => setAccountSection('activity')}
              className={cn(
                'rounded px-2 py-1 transition-colors',
                accountSection === 'activity'
                  ? 'bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              )}
            >
              Activity
            </button>
          </div>
        </div>
      </AdminContentCard>

      {accountSection === 'users' ? (
      <AdminContentCard>
        <div className="flex flex-col gap-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:mr-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Users</h3>
            {userActionMsg ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
                {userActionMsg}
              </p>
            ) : null}
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search name, email, status…"
              className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              aria-label="Filter users"
            />
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Role
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | AdminAccountMemberRole)}
              className="h-9 min-w-[8rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">All</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="accountant">Accountant</option>
              <option value="support">{adminRoleLabel('support')}</option>
              <option value="member">{adminRoleLabel('member')}</option>
            </select>
          </label>
          <p className="text-xs text-zinc-500 sm:ml-auto">
            {filteredMembers.length + filteredInvites.length} row
            {filteredMembers.length + filteredInvites.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="mt-4">
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Role</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Last active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </AdminTableHead>
            <tbody>
              {filteredMembers.length === 0 && filteredInvites.length === 0 ? (
                <AdminTr>
                  <AdminTd colSpan={6} className="py-8 text-center text-sm text-zinc-500">
                    No users match your filters.
                  </AdminTd>
                </AdminTr>
              ) : null}
              {filteredMembers.map((u) => (
                <AdminTr key={u.id}>
                  <AdminTd>{u.name}</AdminTd>
                  <AdminTd>{u.email}</AdminTd>
                  <AdminTd>
                    {u.role === 'owner' ? (
                      <AdminBadge tone="neutral">{adminRoleLabel(u.role)}</AdminBadge>
                    ) : canChangeSubscriberMemberRole({
                        canManageLifecycle: canManage,
                        memberRole: u.role,
                        memberStatus: u.status,
                      }) ? (
                      <AdminMemberRolePicker
                        aria-label={`Role for ${u.name}`}
                        className="max-w-[11rem]"
                        value={
                          roleConfirm?.userId === u.id
                            ? roleConfirm.from
                            : (u.role as AdminAssignableMemberRole)
                        }
                        onChange={(to) => {
                          if (to === u.role) return;
                          setRoleConfirm({
                            userId: u.id,
                            name: u.name,
                            from: u.role as AdminAssignableMemberRole,
                            to,
                          });
                        }}
                        options={buildMemberRolePickerOptions({
                          currentRole: u.role as AdminAssignableMemberRole,
                          memberStatus: u.status,
                          canManageLifecycle: canManage,
                          adminMemberCount,
                        })}
                      />
                    ) : (
                      <AdminBadge tone="neutral">{adminRoleLabel(u.role)}</AdminBadge>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge tone={statusBadgeTone(u.status)}>{formatStatusLabel(u.status)}</AdminBadge>
                  </AdminTd>
                  <AdminTd className="text-zinc-600 dark:text-zinc-400">
                    {u.last_active_at ? new Date(u.last_active_at).toLocaleString() : '—'}
                  </AdminTd>
                  <AdminTd>
                    <AdminRowActions items={buildUserMenu(u)} />
                  </AdminTd>
                </AdminTr>
              ))}

              {filteredInvites.map((i) => (
                <AdminTr key={i.id}>
                  <AdminTd className="text-zinc-500">Pending invite</AdminTd>
                  <AdminTd>{i.email}</AdminTd>
                  <AdminTd>
                    <AdminBadge tone="neutral">{adminRoleLabel(i.role)}</AdminBadge>
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge tone={statusBadgeTone('invited')}>{formatStatusLabel(i.status)}</AdminBadge>
                  </AdminTd>
                  <AdminTd className="text-xs text-zinc-500">—</AdminTd>
                  <AdminTd className="max-w-[10rem] truncate text-xs text-zinc-500">
                    Expires {new Date(i.expires_at).toLocaleString()}
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminTable>
        </div>
      </AdminContentCard>
      ) : (
        <AdminAccountAuditSection
          accountId={accountId}
          users={data.users.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
        />
      )}

      {showInvite ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Invite user</h3>
            <form onSubmit={inviteUser} className="mt-4 space-y-3">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="name@company.com"
                required
              />
              <AdminMemberRolePicker
                aria-label="Invite role"
                className="w-full px-3 py-2"
                value={inviteRole}
                onChange={setInviteRole}
                options={buildInviteRolePickerOptions()}
                disabled={inviteBusy}
              />
              {inviteError ? <p className="text-sm text-red-600">{inviteError}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-md border border-zinc-200 px-3 py-2 text-sm" onClick={() => setShowInvite(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={inviteBusy} className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
                  {inviteBusy ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {roleDialogUser ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/50 p-4">
          <div
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
            role="dialog"
            aria-labelledby="role-change-title"
          >
            <h3 id="role-change-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Change role
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{roleDialogUser.name}</p>
            <div className="mt-4">
              <label htmlFor="role-change-picker" className="block text-xs font-medium text-zinc-500">
                Role
              </label>
              <AdminMemberRolePicker
                id="role-change-picker"
                className="mt-1 w-full px-3 py-2"
                value={roleDraft}
                onChange={setRoleDraft}
                options={buildMemberRolePickerOptions({
                  currentRole: roleDialogUser.role as AdminAssignableMemberRole,
                  memberStatus: roleDialogUser.status,
                  canManageLifecycle: canManage,
                  adminMemberCount,
                })}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                onClick={() => setRoleDialogUser(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={roleDraft === roleDialogUser.role}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                onClick={() => {
                  setRoleConfirm({
                    userId: roleDialogUser.id,
                    name: roleDialogUser.name,
                    from: roleDialogUser.role as AdminAssignableMemberRole,
                    to: roleDraft,
                  });
                  setRoleDialogUser(null);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={passwordResetConfirm !== null}
        title="Send password reset?"
        description={
          passwordResetConfirm
            ? `Email a reset link to ${passwordResetConfirm.email} (${passwordResetConfirm.name}).`
            : ''
        }
        variant="default"
        confirmLabel="Send reset"
        busy={passwordResetBusy}
        onClose={() => !passwordResetBusy && setPasswordResetConfirm(null)}
        onConfirm={runPasswordResetSend}
      />

      <AdminConfirmDialog
        open={roleConfirm !== null}
        title="Change role?"
        description={
          roleConfirm
            ? `${roleConfirm.name}: ${adminRoleLabel(roleConfirm.from)} → ${adminRoleLabel(roleConfirm.to)}`
            : ''
        }
        variant="default"
        confirmLabel="Change role"
        busy={roleConfirmBusy}
        onClose={() => !roleConfirmBusy && setRoleConfirm(null)}
        onConfirm={runRoleConfirm}
      />

      <AdminConfirmDialog
        open={confirm !== null}
        title={
          confirm?.scope === 'account'
            ? confirm.action === 'suspend'
              ? 'Suspend account?'
              : confirm.action === 'deactivate'
                ? 'Deactivate account?'
                : 'Reactivate account?'
            : confirm?.action === 'remove'
              ? 'Remove user?'
              : confirm?.action === 'suspend'
                ? 'Suspend user?'
                : confirm?.action === 'deactivate'
                  ? 'Deactivate user?'
                  : 'Reactivate user?'
        }
        description={
          confirm?.scope === 'account'
            ? confirm.action === 'suspend'
              ? 'Subscribers will be blocked from using this workspace until reactivated. Data is preserved.'
              : confirm.action === 'deactivate'
                ? 'Stronger shutdown: the workspace is disabled until explicitly reactivated. Data is preserved.'
                : 'Restore normal access for this workspace.'
            : confirm?.action === 'remove'
              ? 'This removes the user from this account.'
              : confirm?.action === 'suspend'
                ? 'Temporary restriction: login and access are blocked until reactivated.'
                : confirm?.action === 'deactivate'
                  ? 'Stronger disable: user is blocked until reactivated. Record kept for audit.'
                  : 'Restore this user’s access.'
        }
        variant={
          confirm?.scope === 'account'
            ? confirm.action === 'reactivate'
              ? 'default'
              : 'danger'
            : confirm?.action === 'reactivate'
              ? 'default'
              : 'danger'
        }
        confirmLabel={
          confirm?.scope === 'account'
            ? confirm.action === 'suspend'
              ? 'Suspend'
              : confirm.action === 'deactivate'
                ? 'Deactivate'
                : 'Reactivate'
            : confirm?.action === 'remove'
              ? 'Remove'
              : confirm?.action === 'suspend'
                ? 'Suspend'
                : confirm?.action === 'deactivate'
                  ? 'Deactivate'
                  : 'Reactivate'
        }
        busy={confirmBusy}
        onClose={() => !confirmBusy && setConfirm(null)}
        onConfirm={runConfirm}
      />
    </div>
  );
}
