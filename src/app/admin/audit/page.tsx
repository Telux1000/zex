import { Suspense } from 'react';
import { AdminSecurityPanel } from '@/components/admin/AdminSecurityPanel';
import { AdminContentCard } from '@/components/admin/AdminContentCard';

export default function AdminAuditPage() {
  return (
    <Suspense
      fallback={
        <AdminContentCard>
          <p className="text-sm text-zinc-500">Loading security console…</p>
        </AdminContentCard>
      }
    >
      <AdminSecurityPanel />
    </Suspense>
  );
}
