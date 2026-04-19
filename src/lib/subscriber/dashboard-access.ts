import type { SupabaseClient } from '@supabase/supabase-js';

export type SubscriberDashboardBlockReason =
  | 'account_suspended'
  | 'account_deactivated'
  | 'user_suspended'
  | 'user_deactivated';

/**
 * When set, subscriber should not use the product dashboard until cleared by Zenzex admin.
 * Account-level blocks apply to all users in the workspace; user-level applies to this login only.
 */
export async function getSubscriberDashboardBlockReason(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriberDashboardBlockReason | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, admin_suspended_at, admin_deactivated_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (owned?.id) {
    if (owned.admin_deactivated_at) return 'account_deactivated';
    if (owned.admin_suspended_at) return 'account_suspended';
    const { data: prof } = await supabase
      .from('profiles')
      .select('subscriber_admin_deactivated_at, subscriber_admin_suspended_at')
      .eq('id', userId)
      .maybeSingle();
    if (prof?.subscriber_admin_deactivated_at) return 'user_deactivated';
    if (prof?.subscriber_admin_suspended_at) return 'user_suspended';
    return null;
  }

  const { data: mem } = await supabase
    .from('business_members')
    .select('suspended_at, deactivated_at, businesses ( admin_suspended_at, admin_deactivated_at )')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const rawBiz = mem?.businesses;
  const b = Array.isArray(rawBiz)
    ? (rawBiz[0] as { admin_suspended_at?: string | null; admin_deactivated_at?: string | null } | undefined)
    : rawBiz && typeof rawBiz === 'object'
      ? (rawBiz as { admin_suspended_at?: string | null; admin_deactivated_at?: string | null })
      : null;
  if (b?.admin_deactivated_at) return 'account_deactivated';
  if (b?.admin_suspended_at) return 'account_suspended';
  if (mem?.deactivated_at) return 'user_deactivated';
  if (mem?.suspended_at) return 'user_suspended';
  return null;
}
