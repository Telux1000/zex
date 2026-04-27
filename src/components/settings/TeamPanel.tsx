'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Business } from '@/lib/database.types';
import { BUSINESS_MEMBER_ROLES, type BusinessMemberRole } from '@/lib/rbac/types';
import { workspaceRoleLabelFromUnknown } from '@/lib/roles/workspace-roles';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { isSettingsPagePerfEnabled, settingsPagePerfLog } from '@/lib/dev/settings-page-perf';

type TeamMember = {
  user_id: string;
  account_number?: string | null;
  accountNumber?: string | null;
  full_name: string | null;
  fullName?: string | null;
  email: string | null;
  role: 'owner' | BusinessMemberRole;
  status: 'active' | 'suspended';
  invited_at: string | null;
  joined_at: string | null;
  last_active_at: string | null;
};

type PendingInvite = {
  id: string;
  email: string;
  role: BusinessMemberRole;
  status: 'pending_invite';
  invited_at: string;
  expires_at: string;
  inviter_name: string | null;
};

type TeamPayload = {
  current_user_id: string;
  current_user_role: 'owner' | BusinessMemberRole;
  owner: TeamMember;
  members: TeamMember[];
  pending_invites: PendingInvite[];
};

type Props = {
  business: Business;
};

type ConfirmIntent = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  suspended: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  pending_invite: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

function formatDate(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatTeamMemberStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TeamPanel({ business }: Props) {
  const [payload, setPayload] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<BusinessMemberRole>('staff');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmDialogRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const t0 = Date.now();
    try {
      const res = await fetch(`/api/businesses/${business.id}/team`);
      const data = (await res.json()) as TeamPayload | { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load team');
      setPayload(data as TeamPayload);
      if (isSettingsPagePerfEnabled()) {
        settingsPagePerfLog('settings: team_members_client_fetch_ms', { ms: Date.now() - t0 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    load();
  }, [load]);


  const currentRole = payload?.current_user_role ?? 'viewer';
  const currentUserId = payload?.current_user_id ?? '';
  const canManageUsers = currentRole === 'owner' || currentRole === 'admin';

  const inviteRoleOptions = useMemo((): readonly BusinessMemberRole[] => {
    if (currentRole === 'owner') return BUSINESS_MEMBER_ROLES;
    if (currentRole === 'admin') return BUSINESS_MEMBER_ROLES.filter((r) => r !== 'admin');
    return [];
  }, [currentRole]);

  useEffect(() => {
    if (!(inviteRoleOptions as readonly string[]).includes(inviteRole)) {
      setInviteRole((inviteRoleOptions[0] ?? 'staff') as BusinessMemberRole);
    }
  }, [inviteRoleOptions, inviteRole]);

  function canManageTarget(role: TeamMember['role'], userId: string) {
    if (userId === currentUserId) return false;
    if (currentRole === 'owner') return role !== 'owner';
    if (currentRole === 'admin') return role === 'accountant' || role === 'staff' || role === 'viewer';
    return false;
  }

  function roleChangeOptions(targetRole: TeamMember['role']) {
    if (targetRole === 'owner') return [] as BusinessMemberRole[];
    if (currentRole === 'owner') return [...BUSINESS_MEMBER_ROLES];
    if (currentRole === 'admin') return BUSINESS_MEMBER_ROLES.filter((r) => r !== 'admin');
    return [] as BusinessMemberRole[];
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageUsers) return;
    setInviting(true);
    setInviteMsg(null);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/businesses/${business.id}/team/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invite failed');
      setInviteEmail('');
      setInviteMsg('Invitation sent.');
      await load();
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, role: BusinessMemberRole) {
    setBusyUserId(userId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/businesses/${business.id}/team/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      await load();
    } finally {
      setBusyUserId(null);
    }
  }

  async function runUserAction(userId: string, action: 'suspend' | 'reactivate' | 'password_reset') {
    setBusyUserId(userId);
    try {
      const res = await fetch(`/api/businesses/${business.id}/team/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Action failed');
      await load();
      setActionMsg(action === 'password_reset' ? 'Password reset email sent.' : 'Updated.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function resendInvite(inviteId: string) {
    setBusyInviteId(inviteId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/businesses/${business.id}/team/invites/${inviteId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Resend failed');
      await load();
    } finally {
      setBusyInviteId(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    setBusyInviteId(inviteId);
    try {
      const res = await fetch(`/api/businesses/${business.id}/team/invites/${inviteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Revoke failed');
      await load();
      setActionMsg('Invite revoked.');
    } finally {
      setBusyInviteId(null);
    }
  }

  function openConfirm(intent: ConfirmIntent) {
    if (confirmBusy) return;
    setConfirmIntent(intent);
  }

  function closeConfirm() {
    if (confirmBusy) return;
    setConfirmIntent(null);
  }

  async function handleConfirmAction() {
    if (!confirmIntent) return;
    setConfirmBusy(true);
    try {
      await confirmIntent.onConfirm();
      setConfirmIntent(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  useEffect(() => {
    if (!confirmIntent) return;
    const t = window.setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [confirmIntent]);

  useEffect(() => {
    if (!confirmIntent) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeConfirm();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = confirmDialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmIntent, confirmBusy]);

  const teamRows: TeamMember[] = payload ? [payload.owner, ...payload.members] : [];

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Team</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Manage users, roles, invite status, and account access.
      </p>

      {canManageUsers && (
        <form onSubmit={submitInvite} className="mt-6 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Invite user</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Email</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="colleague@company.com"
              />
            </div>
            <div className="sm:w-40">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as BusinessMemberRole)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                {inviteRoleOptions.map((r) => (
                  <option key={r} value={r}>
                    {workspaceRoleLabelFromUnknown(r)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting || inviteRoleOptions.length === 0}
              className="app-btn-primary"
            >
              {inviting ? 'Sending…' : 'Invite'}
            </button>
          </div>
          {inviteMsg && <p className="text-xs text-slate-600 dark:text-slate-400">{inviteMsg}</p>}
        </form>
      )}
      {actionMsg && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
        >
          {actionMsg}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <>
            <div className="app-table-shell hidden w-full overflow-hidden md:block">
              <div className="w-full overflow-x-auto">
                <table className="app-table min-w-full table-fixed text-left">
                <thead>
                  <tr>
                    <th className="app-th">User</th>
                    <th className="app-th">Role / Status</th>
                    <th className="app-th">Last active</th>
                    {canManageUsers && <th className="app-th-actions min-w-[120px]">Actions</th>}
                  </tr>
                </thead>
                <tbody className="app-tbody">
                  {teamRows.map((row) => {
                    const canManage = canManageUsers && canManageTarget(row.role, row.user_id);
                    const roleOptions = roleChangeOptions(row.role);
                    return (
                      <tr key={row.user_id} className="app-tr-hover">
                        <td className="app-td">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {(row.accountNumber ?? row.account_number ?? '').trim() || '—'}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">
                              {(row.fullName ?? row.full_name ?? '').trim() || '—'}
                            </span>
                            <span className="truncate text-sm text-slate-500 dark:text-slate-400">
                              {row.email?.trim() || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="app-td">
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {canManage && roleOptions.length > 0 ? (
                                <select
                                  value={row.role}
                                  onChange={(e) => void changeRole(row.user_id, e.target.value as BusinessMemberRole)}
                                  disabled={busyUserId === row.user_id}
                                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                                >
                                  {roleOptions.map((r) => (
                                    <option key={r} value={r}>
                                      {workspaceRoleLabelFromUnknown(r)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <RoleBadge role={row.role} />
                              )}
                            </div>
                            <div>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                              >
                                {formatTeamMemberStatusLabel(row.status)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="app-td-secondary">{formatDate(row.last_active_at)}</td>
                        {canManageUsers && (
                          <td className="app-td-actions min-w-[120px] whitespace-nowrap">
                            <div className="inline-flex flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  canManage
                                    ? openConfirm({
                                        title: row.status === 'active' ? 'Suspend user' : 'Reactivate user',
                                        message:
                                          row.status === 'active'
                                            ? 'This user will lose access until reactivated.'
                                            : 'This user will regain access to the workspace.',
                                        confirmLabel:
                                          row.status === 'active' ? 'Suspend user' : 'Reactivate user',
                                        onConfirm: async () =>
                                          runUserAction(
                                            row.user_id,
                                            row.status === 'active' ? 'suspend' : 'reactivate'
                                          ),
                                      })
                                    : undefined
                                }
                                className="inline-flex items-center whitespace-nowrap rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition duration-150 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                                disabled={!canManage || busyUserId === row.user_id}
                              >
                                {row.status === 'active' ? 'Suspend' : 'Reactivate'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  canManage
                                    ? openConfirm({
                                        title: 'Send password reset',
                                        message:
                                          'A password reset email will be sent to this user.',
                                        confirmLabel: 'Send reset',
                                        onConfirm: async () => runUserAction(row.user_id, 'password_reset'),
                                      })
                                    : undefined
                                }
                                className="inline-flex items-center whitespace-nowrap rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 shadow-sm transition duration-150 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                                disabled={!canManage || busyUserId === row.user_id}
                              >
                                Send reset
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              {teamRows.map((row) => {
                const canManage = canManageUsers && canManageTarget(row.role, row.user_id);
                const roleOptions = roleChangeOptions(row.role);
                return (
                  <div key={row.user_id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {(row.accountNumber ?? row.account_number ?? '').trim() || '—'}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {(row.fullName ?? row.full_name ?? '').trim() || '—'}
                        </span>
                        <span className="break-all text-sm text-slate-500 dark:text-slate-400">
                          {row.email?.trim() || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs uppercase text-slate-500 dark:text-slate-400">Role / Status</span>
                        <div className="flex flex-col items-end gap-1">
                          {canManage && roleOptions.length > 0 ? (
                            <select
                              value={row.role}
                              onChange={(e) => void changeRole(row.user_id, e.target.value as BusinessMemberRole)}
                              disabled={busyUserId === row.user_id}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            >
                              {roleOptions.map((r) => (
                                <option key={r} value={r}>
                                  {workspaceRoleLabelFromUnknown(r)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <RoleBadge role={row.role} />
                          )}
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>
                            {formatTeamMemberStatusLabel(row.status)}
                          </span>
                        </div>
                      </div>
                      {canManageUsers && (
                        <div className="flex flex-col items-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              canManage
                                ? openConfirm({
                                    title: row.status === 'active' ? 'Suspend user' : 'Reactivate user',
                                    message:
                                      row.status === 'active'
                                        ? 'This user will lose access until reactivated.'
                                        : 'This user will regain access to the workspace.',
                                    confirmLabel:
                                      row.status === 'active' ? 'Suspend user' : 'Reactivate user',
                                    onConfirm: async () =>
                                      runUserAction(
                                        row.user_id,
                                        row.status === 'active' ? 'suspend' : 'reactivate'
                                      ),
                                  })
                                : undefined
                            }
                            className="inline-flex items-center whitespace-nowrap rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition duration-150 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                            disabled={!canManage || busyUserId === row.user_id}
                          >
                            {row.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              canManage
                                ? openConfirm({
                                    title: 'Send password reset',
                                    message:
                                      'A password reset email will be sent to this user.',
                                    confirmLabel: 'Send reset',
                                    onConfirm: async () => runUserAction(row.user_id, 'password_reset'),
                                  })
                                : undefined
                            }
                            className="inline-flex items-center whitespace-nowrap rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 shadow-sm transition duration-150 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                            disabled={!canManage || busyUserId === row.user_id}
                          >
                            Send reset
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pending invites</h3>
              <div className="app-table-shell mt-3 hidden w-full overflow-hidden md:block">
                <div className="w-full overflow-x-auto">
                  <table className="app-table min-w-full table-fixed text-left">
                  <thead>
                    <tr>
                      <th className="app-th">User</th>
                      <th className="app-th">Role / Status</th>
                      {canManageUsers && <th className="app-th-actions">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="app-tbody">
                    {(payload?.pending_invites ?? []).map((inv) => {
                      const canManageInvite =
                        currentRole === 'owner' ||
                        (currentRole === 'admin' &&
                          (inv.role === 'accountant' || inv.role === 'staff' || inv.role === 'viewer'));
                      return (
                        <tr key={inv.id} className="app-tr-hover">
                          <td className="app-td">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900 dark:text-white">Pending invite</span>
                              <span className="truncate text-sm text-slate-500 dark:text-slate-400">{inv.email}</span>
                            </div>
                          </td>
                          <td className="app-td">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {workspaceRoleLabelFromUnknown(inv.role)}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE.pending_invite}`}
                              >
                                Pending invite
                              </span>
                            </div>
                          </td>
                          {canManageUsers && (
                            <td className="app-td-actions">
                              {canManageInvite ? (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void resendInvite(inv.id)}
                                    className="app-btn-secondary !px-2 !py-1 !text-xs"
                                    disabled={busyInviteId === inv.id}
                                  >
                                    Resend
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openConfirm({
                                        title: 'Revoke invite',
                                        message:
                                          'This invite link will stop working immediately. This action cannot be undone.',
                                        confirmLabel: 'Revoke invite',
                                        onConfirm: async () => revokeInvite(inv.id),
                                      })
                                    }
                                    className="app-btn-destructive !px-2 !py-1 !text-xs"
                                    disabled={busyInviteId === inv.id}
                                  >
                                    Revoke
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {(payload?.pending_invites?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={canManageUsers ? 4 : 3} className="app-table-empty py-6">
                          No pending invites.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 space-y-3 md:hidden">
                {(payload?.pending_invites ?? []).map((inv) => {
                  const canManageInvite =
                    currentRole === 'owner' ||
                    (currentRole === 'admin' &&
                      (inv.role === 'accountant' || inv.role === 'staff' || inv.role === 'viewer'));
                  return (
                    <div key={inv.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900 dark:text-white">Pending invite</span>
                          <span className="break-all text-sm text-slate-500 dark:text-slate-400">{inv.email}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs uppercase text-slate-500 dark:text-slate-400">Role / Status</span>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                              {workspaceRoleLabelFromUnknown(inv.role)}
                            </span>
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE.pending_invite}`}>
                              Pending invite
                            </span>
                          </div>
                        </div>
                        {canManageUsers && (
                          <div className="flex flex-wrap gap-3 pt-1">
                            {canManageInvite ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void resendInvite(inv.id)}
                                  className="app-btn-secondary !px-2 !py-1 !text-xs"
                                  disabled={busyInviteId === inv.id}
                                >
                                  Resend
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openConfirm({
                                      title: 'Revoke invite',
                                      message:
                                        'This invite link will stop working immediately. This action cannot be undone.',
                                      confirmLabel: 'Revoke invite',
                                      onConfirm: async () => revokeInvite(inv.id),
                                    })
                                  }
                                  className="app-btn-destructive !px-2 !py-1 !text-xs"
                                  disabled={busyInviteId === inv.id}
                                >
                                  Revoke
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">No actions available</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(payload?.pending_invites?.length ?? 0) === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No pending invites.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {confirmIntent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close confirmation modal"
            className="absolute inset-0 bg-black/45"
            onClick={closeConfirm}
          />
          <div
            ref={confirmDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-confirm-title"
            aria-describedby="team-confirm-message"
            className="relative z-[101] w-full max-w-md rounded-xl bg-white p-6 shadow-lg dark:bg-gray-900"
          >
            <h3 id="team-confirm-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              {confirmIntent.title}
            </h3>
            <p id="team-confirm-message" className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {confirmIntent.message}
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={confirmBusy}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition duration-150 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => void handleConfirmAction()}
                disabled={confirmBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition duration-150 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {confirmBusy ? 'Processing…' : confirmIntent.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

