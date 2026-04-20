'use client';

import { ExternalLink, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminBadge } from '@/components/admin/AdminBadge';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminRowActions } from '@/components/admin/AdminRowActions';
import { AdminTable, AdminTableHead, AdminTd, AdminTh, AdminTr } from '@/components/admin/AdminTable';

type BillingData = {
  accounts: Array<{
    account_id: string;
    account_name: string;
    owner_name: string;
    owner_email: string;
    plan: string;
    billing_cycle: 'monthly';
    renewal_date: string | null;
    amount_cents: number;
    mrr_cents: number;
    subscription_status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'suspended';
    payment_status: 'paid' | 'failed' | 'pending' | 'refunded';
    failed_payments: number | null;
    stripe_onboarding_status: string;
    stripe_connected: boolean;
    stripe_account_id: string | null;
    stripe_charges_enabled: boolean;
    stripe_payouts_enabled: boolean;
    started_at: string;
    cancelled_at: string | null;
  }>;
};

type FilterModel = {
  search: string;
  plan: 'all' | 'starter' | 'growth' | 'professional' | 'enterprise';
  subscription: 'all' | BillingData['accounts'][number]['subscription_status'];
  payment: 'all' | BillingData['accounts'][number]['payment_status'];
  renewal: 'all' | 'next_30d' | 'next_60d' | 'overdue_or_unknown';
};

const DEFAULT_FILTERS: FilterModel = {
  search: '',
  plan: 'all',
  subscription: 'all',
  payment: 'all',
  renewal: 'all',
};

function toTitle(v: string): string {
  return v
    .split('_')
    .map((s) => s.slice(0, 1).toUpperCase() + s.slice(1))
    .join(' ');
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function subscriptionTone(
  status: BillingData['accounts'][number]['subscription_status']
): 'active' | 'trialing' | 'failed' | 'suspended' | 'neutral' {
  if (status === 'active') return 'active';
  if (status === 'trialing') return 'trialing';
  if (status === 'past_due') return 'failed';
  if (status === 'suspended') return 'suspended';
  return 'neutral';
}

function paymentTone(
  status: BillingData['accounts'][number]['payment_status'],
  failed: number | null
): 'failed' | 'active' | 'warning' | 'neutral' {
  if (failed && failed > 0) return 'failed';
  if (status === 'failed') return 'failed';
  if (status === 'pending') return 'warning';
  if (status === 'paid') return 'active';
  return 'neutral';
}

function billingFiltersFromSearchParams(sp: URLSearchParams): Partial<FilterModel> {
  const out: Partial<FilterModel> = {};
  const sub = sp.get('subscription');
  if (sub === 'active' || sub === 'trialing' || sub === 'past_due' || sub === 'cancelled' || sub === 'suspended') {
    out.subscription = sub;
  }
  const pay = sp.get('payment');
  if (pay === 'paid' || pay === 'failed' || pay === 'pending' || pay === 'refunded') {
    out.payment = pay;
  }
  const ren = sp.get('renewal');
  if (ren === 'next_30d' || ren === 'next_60d' || ren === 'overdue_or_unknown') {
    out.renewal = ren;
  }
  const plan = sp.get('plan');
  if (plan === 'starter' || plan === 'growth' || plan === 'professional' || plan === 'enterprise') {
    out.plan = plan;
  }
  return out;
}

function matchesRenewalFilter(renewalDate: string | null, renewal: FilterModel['renewal']): boolean {
  if (renewal === 'all') return true;
  if (!renewalDate) return renewal === 'overdue_or_unknown';
  const renewalAt = new Date(renewalDate).getTime();
  if (Number.isNaN(renewalAt)) return renewal === 'overdue_or_unknown';
  const now = Date.now();
  const diffDays = Math.floor((renewalAt - now) / (1000 * 60 * 60 * 24));
  if (renewal === 'next_30d') return diffDays >= 0 && diffDays <= 30;
  if (renewal === 'next_60d') return diffDays >= 0 && diffDays <= 60;
  return diffDays < 0;
}

export function AdminBillingPanel() {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterModel>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<BillingData['accounts'][number] | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const patch = billingFiltersFromSearchParams(searchParams);
    if (Object.keys(patch).length === 0) return;
    setFilters({ ...DEFAULT_FILTERS, ...patch });
  }, [searchParams]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/billing');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load billing.');
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError('Network error.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncBillingAck(accountId: string) {
    setSyncing(accountId);
    try {
      await fetch('/api/admin/billing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: accountId }),
      });
      await load();
    } finally {
      setSyncing(null);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filters.search.trim().toLowerCase();
    return data.accounts.filter((a) => {
      if (filters.plan !== 'all' && a.plan !== filters.plan) return false;
      if (filters.subscription !== 'all' && a.subscription_status !== filters.subscription) return false;
      if (filters.payment !== 'all' && a.payment_status !== filters.payment) return false;
      if (!matchesRenewalFilter(a.renewal_date, filters.renewal)) return false;
      if (!q) return true;
      return (
        a.account_name.toLowerCase().includes(q) ||
        a.owner_name.toLowerCase().includes(q) ||
        a.owner_email.toLowerCase().includes(q)
      );
    });
  }, [data, filters]);

  const billingDrillBanner = useMemo(() => {
    const patch = billingFiltersFromSearchParams(searchParams);
    if (Object.keys(patch).length === 0) return null;
    const bits = Object.entries(patch).map(([k, v]) => `${k}: ${v}`);
    return `Filtered from navigation: ${bits.join(', ')}.`;
  }, [searchParams]);

  const summary = useMemo(() => {
    const rows = data?.accounts ?? [];
    const active = rows.filter((a) => a.subscription_status === 'active').length;
    const trialing = rows.filter((a) => a.subscription_status === 'trialing').length;
    const pastDue = rows.filter((a) => a.subscription_status === 'past_due').length;
    const failed = rows.filter((a) => a.payment_status === 'failed' || (a.failed_payments ?? 0) > 0).length;
    const mrrCents = rows.reduce((sum, a) => sum + a.mrr_cents, 0);
    const now = new Date();
    const cancellations = rows.filter((a) => {
      if (!a.cancelled_at) return false;
      const d = new Date(a.cancelled_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { active, trialing, pastDue, failed, mrrCents, cancellations };
  }, [data]);

  const accounts = filtered.slice(0, 120);

  if (error) {
    return (
      <AdminContentCard className="border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-950/30">
        <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
      </AdminContentCard>
    );
  }

  if (!data) {
    return (
      <AdminContentCard>
        <p className="text-sm text-zinc-500">Loading billing…</p>
      </AdminContentCard>
    );
  }

  return (
    <div className="space-y-5">
      <AdminContentCard padding="p-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Operational SaaS billing only. Customer invoices inside subscriber workspaces are intentionally excluded.
        </p>
        {billingDrillBanner ? (
          <p className="mt-3 rounded-lg border border-sky-200/90 bg-sky-50/80 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
            {billingDrillBanner}
          </p>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Active subscriptions', String(summary.active)],
            ['Trialing accounts', String(summary.trialing)],
            ['Past due accounts', String(summary.pastDue)],
            ['Failed payments', String(summary.failed)],
            ['MRR', formatCurrency(summary.mrrCents)],
            ['Cancellations this month', String(summary.cancellations)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-zinc-200/90 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
        {summary.trialing === 0 ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">No active trials at the moment.</p>
        ) : null}
      </AdminContentCard>

      <AdminContentCard padding="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="relative block min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Search</span>
            <Search className="pointer-events-none absolute left-2.5 top-[2.2rem] h-3.5 w-3.5 text-zinc-400" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Company, account owner, or email…"
              className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="text-xs font-medium text-zinc-500">
            Plan
            <select
              value={filters.plan}
              onChange={(e) => setFilters((f) => ({ ...f, plan: e.target.value as FilterModel['plan'] }))}
              className="mt-1 h-9 min-w-[9rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">All plans</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-500">
            Subscription
            <select
              value={filters.subscription}
              onChange={(e) => setFilters((f) => ({ ...f, subscription: e.target.value as FilterModel['subscription'] }))}
              className="mt-1 h-9 min-w-[10rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-500">
            Payment
            <select
              value={filters.payment}
              onChange={(e) => setFilters((f) => ({ ...f, payment: e.target.value as FilterModel['payment'] }))}
              className="mt-1 h-9 min-w-[9rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">All states</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-500">
            Renewal
            <select
              value={filters.renewal}
              onChange={(e) => setFilters((f) => ({ ...f, renewal: e.target.value as FilterModel['renewal'] }))}
              className="mt-1 h-9 min-w-[10rem] rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="all">Any date</option>
              <option value="next_30d">Next 30 days</option>
              <option value="next_60d">Next 60 days</option>
              <option value="overdue_or_unknown">Overdue / unknown</option>
            </select>
          </label>
          <button
            type="button"
            className="h-9 rounded-md border border-zinc-200 px-3 text-sm dark:border-zinc-700"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            Reset
          </button>
        </div>
      </AdminContentCard>

      <AdminContentCard padding="p-4">
        {actionMsg ? (
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400" role="status">
            {actionMsg}
          </p>
        ) : null}
        {accounts.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No subscription rows match your filters.</p>
        ) : (
          <AdminTable>
            <AdminTableHead>
              <AdminTh>Company / Account</AdminTh>
              <AdminTh>Owner</AdminTh>
              <AdminTh>Plan</AdminTh>
              <AdminTh>Subscription status</AdminTh>
              <AdminTh>Renewal</AdminTh>
              <AdminTh>Amount</AdminTh>
              <AdminTh>Payment status</AdminTh>
              <AdminTh className="w-12 text-right"> </AdminTh>
            </AdminTableHead>
            <tbody>
              {accounts.map((a) => (
                <AdminTr key={a.account_id} onClick={() => setSelected(a)} className="cursor-pointer">
                  <AdminTd className="font-medium text-zinc-900 dark:text-zinc-100">{a.account_name}</AdminTd>
                  <AdminTd>
                    <div className="text-sm text-zinc-800 dark:text-zinc-200">{a.owner_name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{a.owner_email || '—'}</div>
                  </AdminTd>
                  <AdminTd>{toTitle(a.plan)}</AdminTd>
                  <AdminTd>
                    <AdminBadge tone={subscriptionTone(a.subscription_status)}>{toTitle(a.subscription_status)}</AdminBadge>
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">{formatDate(a.renewal_date)}</AdminTd>
                  <AdminTd>{formatCurrency(a.amount_cents)}</AdminTd>
                  <AdminTd>
                    <AdminBadge tone={paymentTone(a.payment_status, a.failed_payments)}>{toTitle(a.payment_status)}</AdminBadge>
                  </AdminTd>
                  <AdminTd
                    className="text-right"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <AdminRowActions
                      items={[
                        { label: 'View billing details', onClick: () => setSelected(a) },
                        { label: 'View payment history', onClick: () => setSelected(a) },
                        { divider: true },
                        {
                          label: 'Change plan',
                          onClick: () =>
                            setActionMsg(`Plan changes for ${a.account_name} are managed via Paddle (customer billing portal or support).`),
                        },
                        {
                          label: a.subscription_status === 'suspended' ? 'Resume subscription' : 'Pause subscription',
                          onClick: () =>
                            setActionMsg(
                              `Use account lifecycle controls to ${
                                a.subscription_status === 'suspended' ? 'reactivate' : 'suspend'
                              } ${a.account_name}.`
                            ),
                        },
                        {
                          label: 'Cancel subscription',
                          danger: true,
                          onClick: () =>
                            setActionMsg(`Cancellation is restricted here; complete cancellation in Paddle or via support for ${a.account_name}.`),
                        },
                        {
                          label: syncing === a.account_id ? 'Syncing…' : 'Ack billing sync',
                          onClick: () => void syncBillingAck(a.account_id),
                          disabled: syncing === a.account_id,
                        },
                      ]}
                      disabled={syncing === a.account_id}
                    />
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminContentCard>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-zinc-950/45" role="dialog" aria-label="Billing detail">
          <button type="button" className="h-full flex-1" aria-label="Close details" onClick={() => setSelected(null)} />
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Billing details</p>
                <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{selected.account_name}</h3>
                <p className="text-sm text-zinc-500">{selected.owner_name} {selected.owner_email ? `(${selected.owner_email})` : ''}</p>
              </div>
              <button
                type="button"
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => setSelected(null)}
                aria-label="Close billing details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-500">Plan</p>
                <p className="text-sm font-medium">{toTitle(selected.plan)}</p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-500">Billing cycle</p>
                <p className="text-sm font-medium">{toTitle(selected.billing_cycle)}</p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-500">Next renewal</p>
                <p className="text-sm font-medium">{formatDate(selected.renewal_date)}</p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-500">Amount</p>
                <p className="text-sm font-medium">{formatCurrency(selected.amount_cents)}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <AdminBadge tone={subscriptionTone(selected.subscription_status)}>
                Subscription: {toTitle(selected.subscription_status)}
              </AdminBadge>
              <AdminBadge tone={paymentTone(selected.payment_status, selected.failed_payments)}>
                Payment: {toTitle(selected.payment_status)}
              </AdminBadge>
              <AdminBadge tone="neutral">
                Stripe: {selected.stripe_connected ? selected.stripe_onboarding_status : 'Not connected'}
              </AdminBadge>
            </div>

            <section className="mt-6">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment history</h4>
              <div className="mt-2 rounded-md border border-zinc-200 dark:border-zinc-800">
                <div className="border-b border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">Date • Event • Status • Amount</div>
                <div className="px-3 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {selected.payment_status === 'paid'
                    ? `Latest charge succeeded (${formatCurrency(selected.amount_cents)}).`
                    : selected.payment_status === 'failed'
                      ? 'Latest charge failed. Follow up in Paddle or your payment provider for details.'
                      : 'No settled charge captured yet.'}
                </div>
              </div>
            </section>

            <section className="mt-5">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Subscription history</h4>
              <div className="mt-2 rounded-md border border-zinc-200 dark:border-zinc-800">
                <div className="border-b border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">Date • Event</div>
                <div className="px-3 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  Started {formatDate(selected.started_at)}. Current state: {toTitle(selected.subscription_status)}.
                  {selected.cancelled_at ? ` Cancelled ${formatDate(selected.cancelled_at)}.` : ''}
                </div>
              </div>
            </section>

            {selected.stripe_account_id ? (
              <a
                href={`https://dashboard.stripe.com/connect/accounts/${selected.stripe_account_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Open in Stripe <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
