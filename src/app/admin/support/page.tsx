import { AdminSupportDesk } from '@/components/admin/AdminSupportDesk';
import { requireAdminPageAccess } from '@/lib/admin/auth';

export default async function AdminSupportPage() {
  await requireAdminPageAccess();
  return <AdminSupportDesk initialTicketId={null} />;
}
