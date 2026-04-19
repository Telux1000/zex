import { Suspense } from 'react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminUsersPanel } from '@/components/admin/AdminUsersPanel';

export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <AdminContentCard>
          <p className="text-sm text-zinc-500">Loading users…</p>
        </AdminContentCard>
      }
    >
      <AdminUsersPanel />
    </Suspense>
  );
}
