import { notFound } from 'next/navigation';
import { InviteWaitlistPageClient } from '@/components/waitlist/InviteWaitlistPageClient';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { fetchWaitlistInvitePreview } from '@/lib/waitlist/waitlist-invite';

export const dynamic = 'force-dynamic';

export default async function WaitlistInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawParam } = await params;
  const token = decodeURIComponent(String(rawParam ?? '').trim());
  if (!token || token.length > 512) {
    notFound();
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    notFound();
  }

  const preview = await fetchWaitlistInvitePreview(admin, token);
  if (!preview.ok) {
    notFound();
  }

  return <InviteWaitlistPageClient inviteToken={token} defaultEmail={preview.email} />;
}
