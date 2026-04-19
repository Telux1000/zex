import { notFound, redirect } from 'next/navigation';
import { getPrimaryBusinessForUser, getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { canAccessSupportInbox } from '@/lib/support/support-access';

export default async function SupportSectionLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) redirect('/login');

  const business = await getPrimaryBusinessForUser(user.id);
  if (!business) notFound();

  const role = await getEffectiveBusinessRole(supabase, business.id, user.id);
  if (!canAccessSupportInbox(role)) notFound();

  return children;
}
