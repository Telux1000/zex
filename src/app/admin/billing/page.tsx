import { Suspense } from 'react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminBillingPanel } from '@/components/admin/AdminBillingPanel';

export default function AdminBillingPage() {
  return (
    <Suspense
      fallback={
        <AdminContentCard>
          <p className="text-sm text-zinc-500">Loading billing…</p>
        </AdminContentCard>
      }
    >
      <AdminBillingPanel />
    </Suspense>
  );
}
