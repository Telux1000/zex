'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminRole } from '@/lib/admin/auth';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminRowActions } from '@/components/admin/AdminRowActions';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';

type StaffRow = {
  user_id: string;
  full_name: string;
  email: string;
  internal_code: string | null;
  role: string;
  status: 'active' | 'suspended';
  invited_by_email: string | null;
  invited_by_name: string | null;
  created_at: string | null;
  last_active_at: string | null;
};

type InviteRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  invited_by_email: string | null;
  invited_by_name: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

type Capabilities = {
  canInvite: boolean;
  canResendOrRevokeInvite: boolean;
  canChangeRoles: boolean;
  canDeactivate: boolean;
};

function inviteTone(status: string): 'pending' | 'active' | 'revoked' | 'neutral' {
  const s = status.toLowerCase();
  if (s === 'pending') return 'pending';
  if (s === 'accepted') return 'active';
  if (s === 'revoked') return 'revoked';
  if (s === 'expired') return 'neutral';
  return 'neutral';
}

function formatRole(r: string): string {
  const x = r.toLowerCase();
  if (x === 'owner') return 'Owner';
  if (x === 'admin') return 'Admin';
  if (x === 'support') return 'Support';
  return r;
}

export function AdminTeamPanel() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [actorRole, setActorRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'support'>('support');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<
    | { type: 'revoke'; inviteId: string }
    | { type: 'deactivate' | 'reactivate'; userId: string }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/team');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not load team.');
        return;
      }
      setStaff(json.staff ?? []);
      setInvites(json.invites ?? []);
      setCapabilities(json.capabilities ?? null);
      setActorRole(json.actorRole ?? null);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteMsg(null);
    setInviteBusy(true);
    try {
      const res = await fetch('/api/admin/team/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteMsg(json.error ?? 'Invite failed.');
        return;
      }
      setShowInvite(false);
      setInviteName('');
      setInviteEmail('');
      setInviteRole('support');
      await load();
    } finally {
      setInviteBusy(false);
    }
  }

  async function resendInvite(id: string) {
    await fetch(`/api/admin/team/invites/${id}/resend`, { method: 'POST' });
    await load();
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/admin/team/invites/${id}/revoke`, { method: 'POST' });
    setConfirm(null);
    await load();
  }

  async function setMemberStatus(userId: string, action: 'deactivate' | 'reactivate') {
    await fetch(`/api/admin/team/members/${userId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setConfirm(null);
    await load();
  }

  async function changeRole(userId: string, role: 'admin' | 'support') {
    await fetch(`/api/admin/team/members/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    await load();
  }

  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.type === 'revoke') await revokeInvite(confirm.inviteId);
      else if (confirm.type === 'deactivate') await setMemberStatus(confirm.userId, 'deactivate');
      else await setMemberStatus(confirm.userId, 'reactivate');
    } finally {
      setConfirmBusy(false);
    }
  }

  if (loading && !capabilities) {
    return (
      <AdminContentCard>
        <p className="text-sm text-zinc-500">Loading team…</p>
      </AdminContentCard>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Internal Zenzex staff only — separate from subscriber accounts and invoice customers.
          </p>
          {capabilities?.canInvite ? (
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              onClick={() => setShowInvite(true)}
            >
              Invite staff
            </button>
          ) : null}
        </div>
        {error ? (
          <AdminContentCard className="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </AdminContentCard>
        ) : null}

        <AdminContentCard>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Active staff</h2>
          {staff.length === 0 ? (
            <p className="mt-4 text-center text-sm text-zinc-500">No internal staff rows.</p>
          ) : (
            <div className="mt-4">
              <AdminTable>
                <AdminTableHead>
                  <AdminTh>Code</AdminTh>
                  <AdminTh>Name</AdminTh>
                  <AdminTh>Email</AdminTh>
                  <AdminTh>Role</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Invited by</AdminTh>
                  <AdminTh>Created</AdminTh>
                  <AdminTh>Last active</AdminTh>
                  <AdminTh className="w-12 text-right"> </AdminTh>
                </AdminTableHead>
                <tbody>
                  {staff.map((s) => (
                    <AdminTr key={s.user_id}>
                      <AdminTd className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                        {s.internal_code ?? '—'}
                      </AdminTd>
                      <AdminTd className="font-medium text-zinc-900 dark:text-zinc-100">{s.full_name || '—'}</AdminTd>
                      <AdminTd>{s.email}</AdminTd>
                      <AdminTd>
                        {s.role === 'owner' ? (
                          <span className="text-sm">{formatRole(s.role)}</span>
                        ) : capabilities?.canChangeRoles &&
                          (actorRole === 'owner' || (actorRole === 'admin' && s.role === 'support')) ? (
                          <select
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            value={s.role === 'admin' || s.role === 'support' ? s.role : 'support'}
                            onChange={(e) => void changeRole(s.user_id, e.target.value as 'admin' | 'support')}
                            aria-label="Change role"
                          >
                            <option value="admin">Admin</option>
                            <option value="support">Support</option>
                          </select>
                        ) : (
                          <span className="text-sm">{formatRole(s.role)}</span>
                        )}
                      </AdminTd>
                      <AdminTd>
                        {s.status === 'suspended' ? (
                          <AdminBadge tone="suspended">Suspended</AdminBadge>
                        ) : (
                          <AdminBadge tone="active">Active</AdminBadge>
                        )}
                      </AdminTd>
                      <AdminTd className="text-xs">
                        {s.invited_by_name || s.invited_by_email ? (
                          <>
                            <span>{s.invited_by_name ?? '—'}</span>
                            {s.invited_by_email ? <span className="block text-zinc-500">{s.invited_by_email}</span> : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </AdminTd>
                      <AdminTd className="text-xs text-zinc-600">
                        {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                      </AdminTd>
                      <AdminTd className="text-xs text-zinc-600">
                        {s.last_active_at ? new Date(s.last_active_at).toLocaleString() : 'Never'}
                      </AdminTd>
                      <AdminTd className="text-right">
                        {s.role === 'owner' ||
                        !capabilities?.canDeactivate ||
                        (actorRole === 'admin' && s.role === 'admin') ? null : s.status === 'active' ? (
                          <AdminRowActions
                            items={[
                              {
                                label: 'Deactivate',
                                danger: true,
                                onClick: () => setConfirm({ type: 'deactivate', userId: s.user_id }),
                              },
                            ]}
                          />
                        ) : (
                          <AdminRowActions
                            items={[
                              {
                                label: 'Reactivate',
                                onClick: () => setConfirm({ type: 'reactivate', userId: s.user_id }),
                              },
                            ]}
                          />
                        )}
                      </AdminTd>
                    </AdminTr>
                  ))}
                </tbody>
              </AdminTable>
            </div>
          )}
        </AdminContentCard>

        <AdminContentCard>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Invitations</h2>
          {invites.length === 0 ? (
            <p className="mt-4 text-center text-sm text-zinc-500">No invitations.</p>
          ) : (
            <div className="mt-4">
              <AdminTable>
                <AdminTableHead>
                  <AdminTh>Name</AdminTh>
                  <AdminTh>Email</AdminTh>
                  <AdminTh>Role</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>Invited by</AdminTh>
                  <AdminTh>Created</AdminTh>
                  <AdminTh>Expires</AdminTh>
                  <AdminTh className="w-12 text-right"> </AdminTh>
                </AdminTableHead>
                <tbody>
                  {invites.map((i) => (
                    <AdminTr key={i.id}>
                      <AdminTd>{i.full_name}</AdminTd>
                      <AdminTd>{i.email}</AdminTd>
                      <AdminTd>{formatRole(i.role)}</AdminTd>
                      <AdminTd>
                        <AdminBadge tone={inviteTone(i.status)}>{i.status}</AdminBadge>
                      </AdminTd>
                      <AdminTd className="text-xs">
                        {i.invited_by_name || i.invited_by_email ? (
                          <>
                            <span>{i.invited_by_name ?? '—'}</span>
                            {i.invited_by_email ? <span className="block text-zinc-500">{i.invited_by_email}</span> : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </AdminTd>
                      <AdminTd className="text-xs">{new Date(i.created_at).toLocaleString()}</AdminTd>
                      <AdminTd className="text-xs">{new Date(i.expires_at).toLocaleString()}</AdminTd>
                      <AdminTd className="text-right">
                        {i.status === 'pending' && capabilities?.canResendOrRevokeInvite ? (
                          <AdminRowActions
                            items={[
                              { label: 'Resend email', onClick: () => void resendInvite(i.id) },
                              {
                                label: 'Revoke invite',
                                danger: true,
                                onClick: () => setConfirm({ type: 'revoke', inviteId: i.id }),
                              },
                            ]}
                          />
                        ) : null}
                      </AdminTd>
                    </AdminTr>
                  ))}
                </tbody>
              </AdminTable>
            </div>
          )}
        </AdminContentCard>
      </div>

      {showInvite ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Invite staff</h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">We’ll email a secure link — no password here.</p>
            <form onSubmit={submitInvite} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Full name</label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Email</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Role</label>
                <select
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'support')}
                >
                  <option value="admin">Admin</option>
                  <option value="support">Support</option>
                </select>
              </div>
              {inviteMsg ? <p className="text-sm text-red-600 dark:text-red-400">{inviteMsg}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
                  onClick={() => setShowInvite(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  disabled={inviteBusy}
                >
                  {inviteBusy ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={confirm !== null}
        title={
          confirm?.type === 'revoke'
            ? 'Revoke invitation?'
            : confirm?.type === 'deactivate'
              ? 'Deactivate team member?'
              : confirm?.type === 'reactivate'
                ? 'Reactivate team member?'
                : ''
        }
        description={
          confirm?.type === 'revoke'
            ? 'They will not be able to accept this invite. You can send a new invite later.'
            : confirm?.type === 'deactivate'
              ? 'They will lose access to the admin console until reactivated.'
              : confirm?.type === 'reactivate'
                ? 'They will regain admin console access according to their role.'
                : undefined
        }
        confirmLabel={confirm?.type === 'revoke' ? 'Revoke' : confirm?.type === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        variant={confirm?.type === 'revoke' || confirm?.type === 'deactivate' ? 'danger' : 'default'}
        busy={confirmBusy}
        onClose={() => !confirmBusy && setConfirm(null)}
        onConfirm={runConfirm}
      />
    </>
  );
}
