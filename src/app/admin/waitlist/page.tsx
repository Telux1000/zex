import { Suspense } from 'react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminWaitlistPanel } from '@/components/admin/AdminWaitlistPanel';

export default function AdminWaitlistPage() {
  return (
    <Suspense
      fallback={
        <AdminContentCard>
          <p className="text-sm text-zinc-500">Loading waitlist…</p>
        </AdminContentCard>
      }
    >
      <AdminWaitlistPanel />
    </Suspense>
  );
}
