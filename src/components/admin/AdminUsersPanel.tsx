'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminRowActions } from '@/components/admin/AdminRowActions';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';
import { workspaceRoleLabelFromUnknown } from '@/lib/roles/workspace-roles';

type UserRow = {
  id: string;
  display_name: string;
  email_masked: string;
  role: string;
  account_id: string | null;
  account_name: string | null;
  last_sign_in_at: string | null;
  suspended: boolean;
};

const MS_DAY = 86_400_000;

function signInWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= days * MS_DAY;
}

export function AdminUsersPanel() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ userId: string; action: 'suspend' | 'reactivate' } | null>(null);
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();
  const segment = searchParams.get('segment');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load users.');
        return;
      }
      setRows(json.users ?? []);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (segment === 'signin_30d') {
      return rows.filter((u) => signInWithinDays(u.last_sign_in_at, 30));
    }
    return rows;
  }, [rows, segment]);

  const drillBanner =
    segment === 'signin_30d'
      ? 'Filtered from Analytics: sign-in during the last 30 days (engagement proxy; workspace-active people are derived on the server for Analytics totals).'
      : null;

  async function applyStatus() {
    if (!confirm) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/users/${confirm.userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: confirm.action === 'suspend' ? 'suspend' : 'reactivate' }),
      });
      setConfirm(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <AdminContentCard className="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </AdminContentCard>
    );
  }

  if (loading) {
    return (
      <AdminContentCard>
        <p className="text-sm text-zinc-500">Loading users…</p>
      </AdminContentCard>
    );
  }

  return (
    <>
      <AdminContentCard>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Zenzex login users linked to subscriber accounts. Suspending blocks authentication for that user.
        </p>
        {drillBanner ? (
          <p className="mt-3 rounded-lg border border-sky-200/90 bg-sky-50/80 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
            {drillBanner}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-500">No users match the current view.</p>
        ) : filteredRows.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-500">No users match this Analytics filter.</p>
        ) : (
          <div className="mt-4">
            <AdminTable>
              <AdminTableHead>
                <AdminTh>User</AdminTh>
                <AdminTh>Account</AdminTh>
                <AdminTh>Role</AdminTh>
                <AdminTh>Last active</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh className="w-12 text-right"> </AdminTh>
              </AdminTableHead>
              <tbody>
                {filteredRows.map((u) => (
                  <AdminTr key={u.id}>
                    <AdminTd>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{u.display_name}</p>
                      <p className="text-xs text-zinc-500">{u.email_masked}</p>
                    </AdminTd>
                    <AdminTd>{u.account_name ?? '—'}</AdminTd>
                    <AdminTd>{workspaceRoleLabelFromUnknown(u.role)}</AdminTd>
                    <AdminTd className="text-zinc-600 dark:text-zinc-400">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never'}
                    </AdminTd>
                    <AdminTd>
                      {u.suspended ? (
                        <AdminBadge tone="suspended">Suspended</AdminBadge>
                      ) : (
                        <AdminBadge tone="active">Active</AdminBadge>
                      )}
                    </AdminTd>
                    <AdminTd className="text-right">
                      <AdminRowActions
                        items={[
                          u.suspended
                            ? {
                                label: 'Reactivate user',
                                onClick: () => setConfirm({ userId: u.id, action: 'reactivate' }),
                              }
                            : {
                                label: 'Suspend user',
                                danger: true,
                                onClick: () => setConfirm({ userId: u.id, action: 'suspend' }),
                              },
                        ]}
                      />
                    </AdminTd>
                  </AdminTr>
                ))}
              </tbody>
            </AdminTable>
          </div>
        )}
      </AdminContentCard>

      <AdminConfirmDialog
        open={confirm !== null}
        title={confirm?.action === 'suspend' ? 'Suspend user?' : 'Reactivate user?'}
        description={
          confirm?.action === 'suspend'
            ? 'The user will be blocked from signing in until reactivated.'
            : 'The user will be able to sign in again.'
        }
        confirmLabel={confirm?.action === 'suspend' ? 'Suspend' : 'Reactivate'}
        variant={confirm?.action === 'suspend' ? 'danger' : 'default'}
        busy={busy}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={applyStatus}
      />
    </>
  );
}
