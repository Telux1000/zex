import { AdminSupportDesk } from '@/components/admin/AdminSupportDesk';
import { requireAdminPageAccess } from '@/lib/admin/auth';

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  await requireAdminPageAccess();
  const { ticketId } = await params;
  return <AdminSupportDesk initialTicketId={ticketId} />;
}
