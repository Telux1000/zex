'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';
import type { InviteRowDTO, StaffAccessRow } from '@/components/admin/security/types';

function roleTone(role: string): 'neutral' | 'warning' | 'open' {
  if (role === 'owner') return 'warning';
  if (role === 'admin') return 'open';
  return 'neutral';
}

export function AdminSecurityAccessSection({
  staff,
  invites,
  accessFilter,
}: {
  staff: StaffAccessRow[];
  invites: InviteRowDTO[];
  accessFilter: string | null;
}) {
  const filteredStaff = useMemo(() => {
    if (accessFilter === 'no_mfa') {
      return staff.filter((s) => s.status === 'active' && s.mfa_status === 'none');
    }
    if (accessFilter === 'suspended') {
      return staff.filter((s) => s.status === 'suspended');
    }
    return staff;
  }, [staff, accessFilter]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Internal access</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Who can operate the back office, how they authenticate, and invite state. Day-to-day role changes stay in{' '}
            <Link href="/admin/team" className="font-medium text-zinc-900 underline dark:text-zinc-100">
              Team
            </Link>
            — this view is optimized for security review.
          </p>
        </div>
      </div>

      {accessFilter ? (
        <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          Filter active:{' '}
          <span className="font-semibold">
            {accessFilter === 'no_mfa' ? 'Active staff without verified MFA' : 'Suspended internal staff'}
          </span>
          .{' '}
          <Link href="/admin/security?tab=access" className="underline">
            Clear filter
          </Link>
        </p>
      ) : null}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Internal staff</h3>
        <div className="mt-3">
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Code</AdminTh>
              <AdminTh>Role</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>MFA</AdminTh>
              <AdminTh>Last sign-in</AdminTh>
            </AdminTableHead>
            <tbody>
              {filteredStaff.length === 0 ? (
                <AdminTr>
                  <AdminTd colSpan={7} className="py-8 text-center text-sm text-zinc-500">
                    No rows match this filter.
                  </AdminTd>
                </AdminTr>
              ) : (
                filteredStaff.map((s) => (
                  <AdminTr key={s.user_id}>
                    <AdminTd className="font-medium text-zinc-900 dark:text-zinc-100">{s.full_name || '—'}</AdminTd>
                    <AdminTd className="text-zinc-600 dark:text-zinc-400">{s.email || '—'}</AdminTd>
                    <AdminTd className="font-mono text-xs text-zinc-500">{s.internal_code ?? '—'}</AdminTd>
                    <AdminTd>
                      <AdminBadge tone={roleTone(s.role)}>{s.role}</AdminBadge>
                    </AdminTd>
                    <AdminTd>
                      {s.status === 'suspended' ? (
                        <AdminBadge tone="suspended">Suspended</AdminBadge>
                      ) : (
                        <AdminBadge tone="active">Active</AdminBadge>
                      )}
                    </AdminTd>
                    <AdminTd>
                      {s.mfa_status === 'verified' ? (
                        <AdminBadge tone="active">Verified</AdminBadge>
                      ) : s.mfa_status === 'unknown' ? (
                        <AdminBadge tone="neutral">Unknown</AdminBadge>
                      ) : (
                        <AdminBadge tone="warning">Not enrolled</AdminBadge>
                      )}
                    </AdminTd>
                    <AdminTd className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {s.last_active_at ? new Date(s.last_active_at).toLocaleString() : '—'}
                    </AdminTd>
                  </AdminTr>
                ))
              )}
            </tbody>
          </AdminTable>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Invitations</h3>
        <div className="mt-3">
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Email</AdminTh>
              <AdminTh>Role</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Invited by</AdminTh>
              <AdminTh>Expires</AdminTh>
            </AdminTableHead>
            <tbody>
              {invites.length === 0 ? (
                <AdminTr>
                  <AdminTd colSpan={5} className="py-8 text-center text-sm text-zinc-500">
                    No invite rows.
                  </AdminTd>
                </AdminTr>
              ) : (
                invites.map((i) => (
                  <AdminTr key={i.id}>
                    <AdminTd className="font-medium text-zinc-900 dark:text-zinc-100">{i.email}</AdminTd>
                    <AdminTd>
                      <AdminBadge tone="neutral">{i.role}</AdminBadge>
                    </AdminTd>
                    <AdminTd>
                      <AdminBadge
                        tone={
                          i.status === 'pending'
                            ? 'pending'
                            : i.status === 'accepted'
                              ? 'active'
                              : i.status === 'revoked'
                                ? 'revoked'
                                : 'neutral'
                        }
                      >
                        {i.status}
                      </AdminBadge>
                    </AdminTd>
                    <AdminTd className="text-sm text-zinc-600 dark:text-zinc-400">
                      {i.invited_by_email ?? i.invited_by_name ?? '—'}
                    </AdminTd>
                    <AdminTd className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {new Date(i.expires_at).toLocaleString()}
                    </AdminTd>
                  </AdminTr>
                ))
              )}
            </tbody>
          </AdminTable>
        </div>
      </section>
    </div>
  );
}
