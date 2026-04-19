import { Suspense } from 'react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminAccountsPanel } from '@/components/admin/AdminAccountsPanel';

export default function AdminAccountsPage() {
  return (
    <Suspense
      fallback={
        <AdminContentCard>
          <p className="text-sm text-zinc-500">Loading accounts…</p>
        </AdminContentCard>
      }
    >
      <AdminAccountsPanel />
    </Suspense>
  );
}
