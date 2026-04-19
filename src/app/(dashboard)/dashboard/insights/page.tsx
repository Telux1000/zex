'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AIServiceClient } from '@/lib/ai/ai-service-client';
import {
  buildDeterministicInsights,
  type DeterministicInsightCard,
} from '@/lib/insights/deterministic-fallback';
import {
  DEFAULT_DASHBOARD_RANGE,
  getDashboardFinancialRange,
  isDashboardRangePreset,
  parseDashboardRangeParam,
  readDashboardRangeFromStorage,
  getClientDashboardTimezone,
  writeDashboardRangeToStorage,
  type DashboardRangePreset,
} from '@/lib/dashboard/date-range';
import { hasPlanFeature } from '@/lib/billing/plans';
import { useBillingPlan } from '@/hooks/use-billing-plan';

type InsightCard = {
  id: string;
  type: string;
  title: string;
  summary?: string | null;
  severity: 'low' | 'medium' | 'high' | string;
  action_label?: string | null;
  metadata?: { supporting_facts?: string[]; provider?: string } | null;
  created_at: string;
};

type AskResult = {
  answer: string;
  supporting_facts?: string[];
};

async function selectInvoicesWithFallback(
  supabase: ReturnType<typeof createClient>,
  businessId: string
) {
  const primary = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, customer_name, due_date, status, total, amount_paid, balance_due, issue_date, paid_at, exchange_rate_to_base'
    )
    .eq('business_id', businessId);

  if (!primary.error) return primary;
  if (!/column .* does not exist/i.test(primary.error.message ?? '')) return primary;

  return supabase
    .from('invoices')
    .select(
      'id, invoice_number, customer_name, due_date, status, total, amount_paid, balance_due, issue_date, created_at'
    )
    .eq('business_id', businessId);
}

function InsightsPageContent() {
  const searchParams = useSearchParams();
  const urlRange = searchParams.get('range');

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [queryResult, setQueryResult] = useState<AskResult | { error: string } | null>(null);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [fallbackInsights, setFallbackInsights] = useState<DeterministicInsightCard[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [rangePreset, setRangePreset] = useState<DashboardRangePreset>(DEFAULT_DASHBOARD_RANGE);
  const { plan: billingPlan, loading: billingPlanLoading } = useBillingPlan();

  const supabase = createClient();

  useEffect(() => {
    if (urlRange != null && urlRange !== '') {
      setRangePreset(parseDashboardRangeParam(urlRange));
      if (isDashboardRangePreset(urlRange)) writeDashboardRangeToStorage(urlRange);
      return;
    }
    setRangePreset(readDashboardRangeFromStorage() ?? DEFAULT_DASHBOARD_RANGE);
  }, [urlRange]);

  const dashboardPeriodLabel = useMemo(() => {
    const tz = getClientDashboardTimezone();
    return getDashboardFinancialRange(rangePreset, new Date(), tz).label;
  }, [rangePreset]);
  const insightsUnlocked = hasPlanFeature(billingPlan, 'advanced_insights');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setBusinessId(null);
            setInsightsLoading(false);
            setInsightsError('Please sign in to load insights.');
          }
          return;
        }
        const { data: owned } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        let bid: string | null = owned?.id ? String(owned.id) : null;
        if (!bid) {
          const { data: membership } = await supabase
            .from('business_members')
            .select('business_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          bid = membership?.business_id ? String(membership.business_id) : null;
        }
        if (!cancelled) {
          setBusinessId(bid);
          if (!bid) {
            setInsightsLoading(false);
            setInsightsError('No business found. Complete onboarding to enable insights.');
          }
        }
      } catch {
        if (!cancelled) {
          setBusinessId(null);
          setInsightsLoading(false);
          setInsightsError('Unable to resolve your business profile.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (businessId === null) return;
    const bid: string = businessId;
    let cancelled = false;

    async function loadInsights(runAi: boolean) {
      setInsightsLoading(true);
      setInsightsError(null);
      // Always clear stale provider warnings; deterministic fallback will still be shown.
      setAiWarning(null);
      try {
        // Never block deterministic insights on stored-insights table availability.
        let stored: InsightCard[] = [];
        try {
          const storedRes = await supabase
            .from('ai_insights')
            .select('*')
            .eq('business_id', bid)
            .order('created_at', { ascending: false })
            .limit(20);
          stored = (storedRes.data ?? []) as InsightCard[];
          // Normalize stored insights so card rendering stays consistent regardless of provider.
          stored = stored.map((s) => {
            const meta = s.metadata && typeof s.metadata === 'object' ? (s.metadata as Record<string, unknown>) : {};
            const supporting_facts = Array.isArray((meta as { supporting_facts?: unknown[] }).supporting_facts)
              ? (meta as { supporting_facts?: unknown[] }).supporting_facts!.map((x) => String(x))
              : [];
            return {
              ...s,
              metadata: {
                ...meta,
                supporting_facts,
              },
            };
          });
        } catch {
          stored = [];
        }

        const [invoicesRes, paymentsRes] = await Promise.all([
          selectInvoicesWithFallback(supabase, bid),
          supabase
            .from('payments')
            .select('amount, amount_in_base, created_at')
            .eq('business_id', bid)
            .order('created_at', { ascending: false })
            .limit(200),
        ]);

        if (cancelled) return;
        setInsights(stored);
        setLastUpdatedAt(new Date());

        const invoices = ((invoicesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
          const paid = Number(r.amount_paid ?? 0);
          const total = Number(r.total ?? 0);
          const balance = r.balance_due != null ? Number(r.balance_due) : Math.max(0, total - paid);
          const rate = Number((r as { exchange_rate_to_base?: number }).exchange_rate_to_base ?? 1);
          return { ...r, balance_due_safe: Math.max(0, balance) * rate };
        });
        setFallbackInsights(buildDeterministicInsights(invoices));

        if (runAi) {
          setAiWarning(null);
          try {
            const data = await AIServiceClient.generateInsights({
              businessId: bid,
              range: rangePreset,
              dashboardTz: getClientDashboardTimezone(),
            });
            if (Array.isArray(data.insights) && !cancelled) {
              const merged = [...(data.insights as InsightCard[]), ...stored].slice(0, 20);
              setInsights(merged);
            }
          } catch (e) {
            // AI failures should not block deterministic fallback.
            const msg = e instanceof Error ? e.message : 'AI generation failed';
            setAiWarning(msg);
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load insights';
          setAiWarning(msg);
          // Provider failure should never block deterministic fallback.
          setInsightsError(null);
        }
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    }

    loadInsights(insightsUnlocked);
    const interval = window.setInterval(() => loadInsights(false), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [businessId, supabase, rangePreset, insightsUnlocked]);

  async function askQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!insightsUnlocked) return;
    if (!businessId || !question.trim()) return;
    setLoading(true);
    setQueryResult(null);
    try {
      const res = await AIServiceClient.askInsightsQuestion({
        businessId,
        question: question.trim(),
        range: rangePreset,
        dashboardTz: getClientDashboardTimezone(),
      });
      setQueryResult({
        answer: res.answer,
        supporting_facts: res.supporting_facts,
      });
    } catch (err) {
      // Keep provider/internal failures out of the UI.
      setQueryResult({ error: 'Unable to answer right now. Please try again in a moment.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Insights</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        AI analyst cards and invoice reminders. Cash-flow and spending analysis lives on your dashboard under
        Insights.
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Analyst insights are generated automatically. Revenue and period questions use your dashboard range (
        {dashboardPeriodLabel}
        ); change it on the{' '}
        <a href="/dashboard" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          main dashboard
        </a>
        .
      </p>
      {!billingPlanLoading && !insightsUnlocked && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <Lock className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Advanced insights are available on Professional plan
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Upgrade to unlock AI analyst answers and advanced insight generation.
              </p>
              <Link href="/settings" className="mt-3 app-btn-secondary inline-flex items-center justify-center">
                Upgrade
              </Link>
            </div>
          </div>
        </div>
      )}
      {insightsLoading && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Generating insights from your latest business data...</p>
      )}
      {insightsError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          Unable to load insights right now: {insightsError}
        </p>
      )}
      {aiWarning && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          AI summary is temporarily unavailable. Showing source-of-truth fallback insights.
        </p>
      )}

      <form onSubmit={askQuestion} className="mt-6 flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='e.g. Who owes me money? What is my revenue this month?'
          disabled={!insightsUnlocked}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="submit"
          disabled={loading || !question.trim() || !insightsUnlocked}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {loading ? 'Analyzing...' : 'Ask analyst'}
        </button>
      </form>

      {queryResult && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-900 dark:text-white">Analyst Answer</h2>
          {'error' in queryResult ? (
            <p className="mt-2 text-red-600">{String(queryResult.error)}</p>
          ) : (
            <div className="mt-2">
              <p className="text-sm text-slate-700 dark:text-slate-300">{queryResult.answer}</p>
              {(queryResult.supporting_facts ?? []).length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {(queryResult.supporting_facts ?? []).slice(0, 5).map((fact, idx) => (
                    <li key={`${idx}-${fact}`}>- {fact}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 dark:text-white">Prioritized Insights</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {lastUpdatedAt
            ? `Last updated ${lastUpdatedAt.toLocaleTimeString()} • Auto-refresh every 60s`
            : 'Auto-refresh every 60s'}
        </span>
      </div>
      {insights.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {insights.map((ins) => (
            <li
              key={ins.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900 dark:text-white">{ins.title}</p>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {ins.type}
                </span>
              </div>
              {ins.summary && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{ins.summary}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {ins.severity}
                </span>
                {ins.action_label && (
                  <span className="inline-block rounded border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-200">
                    {ins.action_label}
                  </span>
                )}
              </div>
              {Array.isArray(ins.metadata?.supporting_facts) &&
                ins.metadata?.supporting_facts.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {ins.metadata.supporting_facts.slice(0, 3).map((fact, idx) => (
                      <li key={`${ins.id}-fact-${idx}`}>- {fact}</li>
                    ))}
                  </ul>
                )}
              <p className="mt-2 text-xs text-slate-500">
                {new Date(ins.created_at).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      ) : fallbackInsights.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {fallbackInsights.map((ins) => (
            <li
              key={ins.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900 dark:text-white">{ins.title}</p>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {ins.type}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{ins.summary}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {ins.severity}
                </span>
                {ins.action_label && (
                  <span className="inline-block rounded border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-200">
                    {ins.action_label}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Not enough source data yet. Create/send invoices or record payments to unlock automatic insights.
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl p-6 text-sm text-slate-500 dark:text-slate-400">
          Loading insights…
        </div>
      }
    >
      <InsightsPageContent />
    </Suspense>
  );
}
