'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminRowActions } from '@/components/admin/AdminRowActions';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';

type OnboardingStage =
  | 'ACCOUNT_CREATED'
  | 'SIGNUP_UNVERIFIED'
  | 'VERIFIED_NO_LOGIN'
  | 'LOGIN_NO_ONBOARDING'
  | 'ONBOARDING_IN_PROGRESS'
  | 'ONBOARDING_COMPLETED';
type OnboardingStageFilter = 'ALL_INCOMPLETE' | OnboardingStage;
type OnboardingSort = 'created_at' | 'days_stuck' | 'last_activity_at';

type OnboardingAccountRow = {
  id: string;
  account_id: string | null;
  name: string;
  email: string;
  created_at: string;
  email_verified_at: string | null;
  first_signed_in_at: string | null;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  last_activity_at: string | null;
  onboarding_stage: OnboardingStage;
  stuck_reason: string | null;
  days_stuck: number | null;
  follow_up_status: 'active' | 'paused';
  last_follow_up: { sent_at: string; template_id: string; template_display?: string } | null;
  next_follow_up: { scheduled_for: string; template_id: string; template_display?: string } | null;
};

const STAGE_FILTERS: { id: OnboardingStageFilter; label: string }[] = [
  { id: 'ALL_INCOMPLETE', label: 'All incomplete' },
  { id: 'SIGNUP_UNVERIFIED', label: 'Signup unverified' },
  { id: 'VERIFIED_NO_LOGIN', label: 'Verified, no login' },
  { id: 'LOGIN_NO_ONBOARDING', label: 'Login, no onboarding' },
  { id: 'ONBOARDING_IN_PROGRESS', label: 'Onboarding in progress' },
  { id: 'ONBOARDING_COMPLETED', label: 'Completed' },
];
const STAGE_FILTER_IDS = new Set<OnboardingStageFilter>(STAGE_FILTERS.map((f) => f.id));
const SORT_IDS = new Set<OnboardingSort>(['created_at', 'days_stuck', 'last_activity_at']);

function stageLabel(stage: OnboardingStage): string {
  if (stage === 'ACCOUNT_CREATED') return 'Account created';
  if (stage === 'SIGNUP_UNVERIFIED') return 'Signup unverified';
  if (stage === 'VERIFIED_NO_LOGIN') return 'Verified, no login';
  if (stage === 'LOGIN_NO_ONBOARDING') return 'Login, no onboarding';
  if (stage === 'ONBOARDING_IN_PROGRESS') return 'Onboarding in progress';
  return 'Onboarding completed';
}

function stageTone(stage: OnboardingStage): 'active' | 'pending' | 'neutral' {
  if (stage === 'ONBOARDING_COMPLETED') return 'active';
  if (stage === 'ONBOARDING_IN_PROGRESS') return 'pending';
  return 'neutral';
}

/** e.g. `onboarding-login-no-onboarding-2h` → `Onboarding Login No Onboarding 2hrs.` */
function humanizeOnboardingFollowUpLabel(templateDisplayOrEnvKey: string): string {
  let slug = String(templateDisplayOrEnvKey ?? '').trim();
  if (!slug) return '';
  if (slug.startsWith('POSTMARK_TEMPLATE_')) {
    slug = slug.slice('POSTMARK_TEMPLATE_'.length).replace(/_/g, '-').toLowerCase();
  } else {
    slug = slug.replace(/_/g, '-').toLowerCase();
  }
  const parts = slug.split('-').filter((p) => p.length > 0);
  if (parts.length === 0) return templateDisplayOrEnvKey;

  const last = parts[parts.length - 1]!;
  const duration = /^(\d+)(m|h|d)$/i.exec(last);
  const wordParts = duration ? parts.slice(0, -1) : parts;
  const titled = wordParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

  if (!duration) return titled;

  const n = duration[1]!;
  const u = duration[2]!.toLowerCase();
  let suffix = last;
  if (u === 'm') suffix = `${n}mins.`;
  else if (u === 'h') suffix = `${n}hrs.`;
  else if (u === 'd') suffix = `${n}days.`;

  return titled ? `${titled} ${suffix}` : suffix;
}

export function AdminAccountsOnboardingPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<OnboardingAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processorRunning, setProcessorRunning] = useState(false);
  const [processorMessage, setProcessorMessage] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, page_size: 25, total: 0, total_pages: 1 });
  const rawStage = searchParams.get('stage') as OnboardingStageFilter | null;
  const rawSort = searchParams.get('sort') as OnboardingSort | null;
  const stage = rawStage && STAGE_FILTER_IDS.has(rawStage) ? rawStage : 'ALL_INCOMPLETE';
  const sort = rawSort && SORT_IDS.has(rawSort) ? rawSort : 'days_stuck';
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const search = searchParams.get('search') ?? '';

  function setOnboardingQuery(next: Partial<Record<'stage' | 'sort' | 'dir' | 'page' | 'search', string | null>>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    p.set('view', 'onboarding');
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        stage,
        search,
        sort,
        dir,
        page: String(page),
        page_size: '25',
      });
      const res = await fetch(`/api/admin/onboarding/users?${params.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        accounts?: OnboardingAccountRow[];
        pagination?: { page: number; page_size: number; total: number; total_pages: number };
      };
      if (!res.ok) {
        setError(json.error ?? 'Failed to load onboarding accounts.');
        return;
      }
      setRows(json.accounts ?? []);
      setPagination(json.pagination ?? { page: 1, page_size: 25, total: 0, total_pages: 1 });
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [dir, page, search, sort, stage]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalLabel = useMemo(() => {
    if (pagination.total === 0) return 'No accounts';
    return `${pagination.total} ${pagination.total === 1 ? 'account' : 'accounts'}`;
  }, [pagination.total]);

  if (error) {
    return (
      <AdminContentCard className="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </AdminContentCard>
    );
  }

  return (
    <AdminContentCard>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Lifecycle visibility from account creation to onboarding completion, with stuck reasons and aging for follow-up.
      </p>

      <div className="mt-4 flex flex-col gap-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
        <div className="relative min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setOnboardingQuery({
                search: e.target.value.trim().length > 0 ? e.target.value : null,
                page: '1',
              });
            }}
            placeholder="Search name or email…"
            className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Search onboarding accounts"
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Stage
            <select
              value={stage}
              onChange={(e) => {
                setOnboardingQuery({ stage: e.target.value, page: '1' });
              }}
              className="h-9 min-w-[13rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {STAGE_FILTERS.map((filter) => (
                <option key={filter.id} value={filter.id}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                setOnboardingQuery({ sort: e.target.value, page: '1' });
              }}
              className="h-9 min-w-[10rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="days_stuck">Days stuck</option>
              <option value="created_at">Created at</option>
              <option value="last_activity_at">Last activity</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Direction
            <select
              value={dir}
              onChange={(e) => {
                setOnboardingQuery({ dir: e.target.value, page: '1' });
              }}
              className="h-9 min-w-[7rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </label>

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            <button
              type="button"
              disabled={processorRunning || loading}
              onClick={async () => {
                setProcessorMessage(null);
                setProcessorRunning(true);
                try {
                  const res = await fetch('/api/admin/onboarding/follow-ups/process', { method: 'POST' });
                  const json = (await res.json()) as {
                    error?: string;
                    reconciled?: number;
                    sent?: number;
                    canceled?: number;
                  };
                  if (!res.ok) {
                    setProcessorMessage(json.error ?? 'Follow-up processor failed.');
                    return;
                  }
                  const r = json.reconciled ?? 0;
                  const s = json.sent ?? 0;
                  const c = json.canceled ?? 0;
                  setProcessorMessage(`Processor run: reconciled ${r}, sent ${s}, canceled ${c}.`);
                  await load();
                } catch {
                  setProcessorMessage('Network error.');
                } finally {
                  setProcessorRunning(false);
                }
              }}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {processorRunning ? 'Running…' : 'Run follow-up processor'}
            </button>
            <p className="text-xs text-zinc-500">{totalLabel}</p>
          </div>
        </div>
        {processorMessage ? (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{processorMessage}</p>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-6 text-center text-sm text-zinc-500">Loading onboarding accounts…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-zinc-500">No accounts match this onboarding view.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Name</AdminTh>
              <AdminTh>Workspace</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Created at</AdminTh>
              <AdminTh>Verification status</AdminTh>
              <AdminTh>First sign-in at</AdminTh>
              <AdminTh>Onboarding stage</AdminTh>
              <AdminTh>Stuck reason</AdminTh>
              <AdminTh>Days stuck</AdminTh>
              <AdminTh>Last follow-up</AdminTh>
              <AdminTh>Next follow-up</AdminTh>
              <AdminTh>Automation</AdminTh>
              <AdminTh>Last activity at</AdminTh>
              <AdminTh className="w-12 text-right"> </AdminTh>
            </AdminTableHead>
            <tbody>
              {rows.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd className="font-medium text-zinc-900 dark:text-zinc-100">{row.name}</AdminTd>
                  <AdminTd>
                    {row.account_id ? (
                      <AdminBadge tone="active">Workspace ready</AdminBadge>
                    ) : (
                      <AdminBadge tone="warning">No workspace yet</AdminBadge>
                    )}
                  </AdminTd>
                  <AdminTd className="text-zinc-600 dark:text-zinc-300">{row.email || '—'}</AdminTd>
                  <AdminTd className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                  </AdminTd>
                  <AdminTd>
                    {row.email_verified_at ? (
                      <AdminBadge tone="active">Verified</AdminBadge>
                    ) : (
                      <AdminBadge tone="pending">Pending</AdminBadge>
                    )}
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {row.first_signed_in_at ? new Date(row.first_signed_in_at).toLocaleString() : 'Never'}
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge tone={stageTone(row.onboarding_stage)}>{stageLabel(row.onboarding_stage)}</AdminBadge>
                  </AdminTd>
                  <AdminTd className="text-zinc-600 dark:text-zinc-400">{row.stuck_reason ?? '—'}</AdminTd>
                  <AdminTd className="text-zinc-700 dark:text-zinc-300">
                    {row.days_stuck == null ? '—' : `${row.days_stuck}d`}
                  </AdminTd>
                  <AdminTd className="max-w-[16rem] align-top text-sm text-zinc-600 dark:text-zinc-400">
                    {row.last_follow_up ? (
                      <>
                        <span className="whitespace-nowrap">
                          {new Date(row.last_follow_up.sent_at).toLocaleString()}
                        </span>
                        <br />
                        <span className="text-zinc-500 dark:text-zinc-500">
                          {humanizeOnboardingFollowUpLabel(
                            row.last_follow_up.template_display ?? row.last_follow_up.template_id
                          )}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </AdminTd>
                  <AdminTd className="max-w-[16rem] align-top text-sm text-zinc-600 dark:text-zinc-400">
                    {row.next_follow_up ? (
                      <>
                        <span className="whitespace-nowrap">
                          {new Date(row.next_follow_up.scheduled_for).toLocaleString()}
                        </span>
                        <br />
                        <span className="text-zinc-500 dark:text-zinc-500">
                          {humanizeOnboardingFollowUpLabel(
                            row.next_follow_up.template_display ?? row.next_follow_up.template_id
                          )}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge tone={row.follow_up_status === 'paused' ? 'warning' : 'active'}>
                      {row.follow_up_status === 'paused' ? 'Paused' : 'Active'}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {row.last_activity_at ? new Date(row.last_activity_at).toLocaleString() : '—'}
                  </AdminTd>
                  <AdminTd className="text-right">
                    <AdminRowActions
                      items={[
                        ...(row.account_id
                          ? [
                              {
                                label: 'Open account',
                                onClick: () => router.push(`/admin/accounts/${row.account_id}`),
                              },
                            ]
                          : []),
                          {
                            label: row.follow_up_status === 'paused' ? 'Resume follow-ups' : 'Pause follow-ups',
                            onClick: async () => {
                              const endpoint =
                                row.follow_up_status === 'paused'
                                  ? `/api/admin/onboarding/users/${row.id}/resume-follow-ups`
                                  : `/api/admin/onboarding/users/${row.id}/pause-follow-ups`;
                              await fetch(endpoint, { method: 'POST' });
                              await load();
                            },
                          },
                          {
                            label: 'Cancel pending follow-ups',
                            onClick: async () => {
                              await fetch(`/api/admin/onboarding/users/${row.id}/cancel-follow-ups`, { method: 'POST' });
                              await load();
                            },
                          },
                          ...(row.next_follow_up
                            ? [
                                {
                                  label: 'Send next follow-up now',
                                  onClick: async () => {
                                    await fetch(`/api/admin/onboarding/users/${row.id}/send-follow-up`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        template_id: row.next_follow_up?.template_id,
                                        onboarding_stage: row.onboarding_stage,
                                      }),
                                    });
                                    await load();
                                  },
                                },
                              ]
                            : []),
                      ]}
                    />
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminTable>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-zinc-200/80 pt-4 text-xs dark:border-zinc-800">
        <button
          type="button"
          disabled={pagination.page <= 1 || loading}
          onClick={() => setOnboardingQuery({ page: String(Math.max(1, pagination.page - 1)) })}
          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
        >
          Previous
        </button>
        <span className="text-zinc-500">
          Page {pagination.page} / {pagination.total_pages}
        </span>
        <button
          type="button"
          disabled={pagination.page >= pagination.total_pages || loading}
          onClick={() => setOnboardingQuery({ page: String(Math.min(pagination.total_pages, pagination.page + 1)) })}
          className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
        >
          Next
        </button>
      </div>
    </AdminContentCard>
  );
}
