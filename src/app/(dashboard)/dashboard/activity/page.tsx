import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  getPrimaryBusinessForUser,
  getServerSupabaseUser,
} from '@/lib/supabase/server-auth';
import {
  buildActivityFeedItems,
  type ActivityEventRow,
  type ExpenseActivityRow,
  type PaymentActivityRow,
} from '@/lib/activity/feed';
import { formatDisplayDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';

export default async function ActivityPage() {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-400">Create a business first.</p>
        <Link href="/onboarding" className="mt-2 inline-block text-indigo-600 hover:underline dark:text-indigo-400">
          Onboarding
        </Link>
      </div>
    );
  }

  const insightHorizon = new Date();
  insightHorizon.setDate(insightHorizon.getDate() - 120);
  const horizonKey = insightHorizon.toISOString().slice(0, 10);

  const [{ data: events }, { data: expenseRows }, { data: paymentRows }] = await Promise.all([
    supabase
      .from('activity_events')
      .select('id, type, title, description, created_at, entity_type, entity_id')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('expenses')
      .select(
        'id, expense_date, category, amount, created_at, updated_at, description, attachment_url'
      )
      .eq('business_id', business.id)
      .gte('expense_date', horizonKey)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('payments')
      .select('id, invoice_id, amount, currency, status, created_at')
      .eq('business_id', business.id)
      .gte('created_at', insightHorizon.toISOString())
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const items = buildActivityFeedItems({
    events: (events ?? []) as ActivityEventRow[],
    expenses: (expenseRows ?? []) as ExpenseActivityRow[],
    payments: (paymentRows ?? []) as PaymentActivityRow[],
    currencyCode: business.currency ?? 'USD',
    limit: 50,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Activity</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Chronological log of what happened in your business—no analysis or recommendations.
      </p>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        For cash-flow guidance and trends, see{' '}
        <Link href="/dashboard/insights" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          Insights
        </Link>
        .
      </p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Recent activity
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <span
              className={cn(
                'mt-1 h-2 w-2 shrink-0 rounded-full',
                item.severity === 'success' && 'bg-emerald-500',
                item.severity === 'warning' && 'bg-amber-500',
                (!item.severity || item.severity === 'neutral') && 'bg-slate-300 dark:bg-slate-600'
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {item.eventType}
                </span>
                <time
                  className="text-xs text-slate-500 dark:text-slate-400"
                  dateTime={item.timestamp}
                  title={formatDisplayDate(item.timestamp)}
                >
                  {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                </time>
              </div>
              <p className="font-medium text-slate-900 dark:text-white">{item.title}</p>
              {item.description ? (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.description}</p>
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="mt-2 inline-block text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Open →
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">No recent activity.</p>
      ) : null}
    </div>
  );
}
