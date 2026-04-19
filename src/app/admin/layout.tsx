import { AdminShell } from '@/components/admin/AdminShell';
import { AdminNotificationsProvider } from '@/contexts/AdminNotificationsContext';
import { AdminSupportUnreadProvider } from '@/contexts/AdminSupportUnreadContext';
import { requireAdminPageAccess } from '@/lib/admin/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPageAccess();

  const { data: profile } = await session.supabase
    .from('profiles')
    .select('full_name, email, avatar_url, internal_support_ticket_sound')
    .eq('id', session.user.id)
    .maybeSingle();

  const userName = (profile?.full_name && String(profile.full_name).trim()) || session.user.email || 'Admin';
  const userEmail = profile?.email ?? session.user.email ?? '';

  const { data: unreadRpc } = await session.supabase.rpc('support_ticket_unread_for_internal_staff');
  type UnreadRow = { unread_count?: number };
  const initialSupportUnreadTotal = ((unreadRpc ?? []) as UnreadRow[]).reduce(
    (s, r) => s + (Number(r.unread_count) || 0),
    0
  );
  const ticketSoundOn = profile?.internal_support_ticket_sound !== false;

  return (
    <AdminSupportUnreadProvider
      userId={session.user.id}
      initialTotalUnread={initialSupportUnreadTotal}
      initialSoundEnabled={ticketSoundOn}
    >
      <AdminNotificationsProvider userId={session.user.id}>
        <AdminShell
          userName={userName}
          userEmail={userEmail}
          avatarUrl={profile?.avatar_url ?? null}
          adminRole={session.adminRole}
        >
          {children}
        </AdminShell>
      </AdminNotificationsProvider>
    </AdminSupportUnreadProvider>
  );
}
