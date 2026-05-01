'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Mail, UserCheck } from 'lucide-react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { cn } from '@/lib/utils/cn';

type WaitlistRow = {
  id: string;
  email: string;
  country: string | null;
  business_type: string | null;
  source: string;
  trigger_reason: string | null;
  referral_count: number;
  status: string;
  created_at: string;
  invited_at: string | null;
  activated_at: string | null;
  converted_at: string | null;
  linked_user_id: string | null;
  priority_score: number;
};

type Metrics = {
  total: number;
  invited: number;
  activated: number;
  converted: number;
  conversion_rate_pct: number;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function AdminWaitlistPanel() {
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [businessTypeFilter, setBusinessTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    if (countryFilter.trim()) p.set('country', countryFilter.trim());
    if (businessTypeFilter.trim()) p.set('business_type', businessTypeFilter.trim());
    if (sourceFilter.trim()) p.set('source', sourceFilter.trim());
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [statusFilter, countryFilter, businessTypeFilter, sourceFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/waitlist${query}`);
      const j = (await res.json()) as {
        rows?: WaitlistRow[];
        metrics?: Metrics;
        error?: string;
      };
      if (!res.ok) {
        setError(j.error ?? 'Failed to load waitlist');
        return;
      }
      setRows(j.rows ?? []);
      setMetrics(j.metrics ?? null);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function inviteRow(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/waitlist/${id}/invite`, { method: 'POST' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Invite failed');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function markConverted(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/waitlist/${id}/converted`, { method: 'POST' });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? 'Update failed');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function copyEmail(email: string) {
    void navigator.clipboard.writeText(email);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Waitlist</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Review signups, send invites, and track conversions.
        </p>
      </div>

      {metrics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {(
            [
              { label: 'Total', value: String(metrics.total) },
              { label: 'Invited', value: String(metrics.invited) },
              { label: 'Activated', value: String(metrics.activated ?? 0) },
              { label: 'Converted', value: String(metrics.converted) },
              { label: 'Conversion rate', value: `${metrics.conversion_rate_pct}%` },
            ] as const
          ).map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <AdminContentCard>
        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="invited">Invited</option>
                <option value="activated">Activated</option>
                <option value="converted">Converted</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Country contains
              <input
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                placeholder="e.g. NG"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Business type contains
              <input
                value={businessTypeFilter}
                onChange={(e) => setBusinessTypeFilter(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Source
              <input
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                placeholder="landing, pricing…"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            </div>
          ) : (
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Country</th>
                  <th className="py-2 pr-3">Business</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Trigger</th>
                  <th className="py-2 pr-3">Referrals</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Activated</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pl-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-zinc-500">
                      No rows match filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-zinc-100 hover:bg-zinc-50/80 dark:border-zinc-900 dark:hover:bg-zinc-900/40"
                    >
                      <td className="py-2.5 pr-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                        {r.priority_score}
                      </td>
                      <td className="max-w-[200px] truncate py-2.5 pr-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                        {r.email}
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-700 dark:text-zinc-300">{r.country ?? '—'}</td>
                      <td className="max-w-[140px] truncate py-2.5 pr-3 text-zinc-700 dark:text-zinc-300">
                        {r.business_type ?? '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-700 dark:text-zinc-300">{r.source}</td>
                      <td className="max-w-[120px] truncate py-2.5 pr-3 text-xs text-zinc-600 dark:text-zinc-400">
                        {r.trigger_reason ?? '—'}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-zinc-800 dark:text-zinc-200">{r.referral_count}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                            r.status === 'converted'
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                              : r.status === 'invited'
                                ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200'
                                : r.status === 'activated'
                                  ? 'bg-amber-100 text-amber-950 dark:bg-amber-900/35 dark:text-amber-100'
                                  : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-zinc-600 dark:text-zinc-400">
                        {formatDate(r.activated_at)}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-zinc-600 dark:text-zinc-400">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            onClick={() => copyEmail(r.email)}
                            title="Copy email"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </button>
                          {r.status !== 'converted' && r.status !== 'activated' ? (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100"
                              onClick={() => void inviteRow(r.id)}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              {busyId === r.id ? '…' : 'Invite'}
                            </button>
                          ) : null}
                          {r.status !== 'converted' ? (
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                              onClick={() => void markConverted(r.id)}
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Converted
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </AdminContentCard>
    </div>
  );
}
