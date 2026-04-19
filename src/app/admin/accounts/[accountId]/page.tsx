import { AdminAccountDetailPanel } from '@/components/admin/AdminAccountDetailPanel';

export default async function AdminAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <AdminAccountDetailPanel accountId={accountId} />;
}
