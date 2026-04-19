import Link from 'next/link';
import { DashboardCard } from '@/components/dashboard/ui/dashboard-card';
import {
  getPrimaryBusinessForUser,
  getServerSupabaseUser,
} from '@/lib/supabase/server-auth';

export default async function AnalyticsPage() {
  const { user } = await getServerSupabaseUser();
  if (!user) return null;

  const biz = await getPrimaryBusinessForUser(user.id);
  const business = biz
    ? { id: biz.id, currency: biz.currency ?? undefined }
    : undefined;
  if (!business) {
    return (
      <div className="mx-auto max-w-2xl">
        <DashboardCard>
          <p className="text-slate-600 dark:text-slate-400">Create a business first.</p>
          <Link
            href="/onboarding"
            className="mt-3 inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400"
          >
            Onboarding →
          </Link>
        </DashboardCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-2">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Analytics</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Deeper trends and cohort views for your business.
      </p>
      <DashboardCard className="mt-6">
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Reporting totals use your company base currency ({(business.currency ?? 'USD').toUpperCase()}) and stored
          invoice exchange rates.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Advanced analytics is coming soon. Your main metrics live on the{' '}
          <Link
            href="/dashboard"
            className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Dashboard
          </Link>{' '}
          and{' '}
          <Link
            href="/dashboard/insights"
            className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            AI Insights
          </Link>
          .
        </p>
      </DashboardCard>
    </div>
  );
}
