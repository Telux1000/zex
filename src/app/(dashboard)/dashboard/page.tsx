import { Suspense } from 'react';
import { DashboardHomeContent } from './DashboardHomeContent';
import { DashboardHomeSkeleton } from './DashboardHomeSkeleton';

export const dynamic = 'force-dynamic';

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { range?: string; notice?: string };
}) {
  return (
    <Suspense fallback={<DashboardHomeSkeleton />}>
      <DashboardHomeContent searchParams={searchParams} />
    </Suspense>
  );
}
