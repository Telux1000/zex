import { notFound } from 'next/navigation';
import { SupportDesk } from '@/components/support/SupportDesk';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';

export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams?: { compose?: string };
}) {
  const { user } = await getServerSupabaseUser();
  if (!user) notFound();

  const { slug } = await params;
  if (slug && slug.length > 1) notFound();
  const ticketId = slug?.length === 1 ? slug[0] : null;

  const initialComposeOpen = searchParams?.compose === '1';

  return (
    <SupportDesk
      currentUserId={user.id}
      initialTicketId={ticketId}
      initialComposeOpen={initialComposeOpen}
    />
  );
}
