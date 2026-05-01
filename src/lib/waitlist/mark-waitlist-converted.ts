import type { SupabaseClient } from '@supabase/supabase-js';
import { billingLog } from '@/lib/billing/billing-logger';

async function resolveAuthEmailNorm(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email.trim().toLowerCase() || null;
}

async function resolveEmailHints(
  admin: SupabaseClient,
  userId: string,
  hint?: string | null
): Promise<string | null> {
  const h = String(hint ?? '').trim().toLowerCase();
  if (h) return h;
  const { data: p } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
  const pe = p?.email?.trim().toLowerCase();
  if (pe) return pe;
  return resolveAuthEmailNorm(admin, userId);
}

async function tryConvertWaitlistRow(
  admin: SupabaseClient,
  args: { userId: string; emailNorm: string | null; now: string }
): Promise<{ id: string; email: string } | null> {
  const { userId, emailNorm, now } = args;
  const orFilter = emailNorm
    ? `linked_user_id.eq.${userId},email.eq.${emailNorm}`
    : `linked_user_id.eq.${userId}`;

  const { data, error } = await admin
    .from('waitlist')
    .update({
      status: 'converted',
      converted_at: now,
      linked_user_id: userId,
    })
    .in('status', ['pending', 'invited', 'activated'])
    .or(orFilter)
    .select('id,email');

  if (error) {
    billingLog.warn('waitlist_convert_update_failed', { userId, message: error.message });
    return null;
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const first = rows[0];
  if (!first?.id || first.email == null) return null;
  return { id: String(first.id), email: String(first.email) };
}

/**
 * After a paid SaaS subscription activates: mark matching waitlist row as converted.
 * Matches by `linked_user_id` or waitlist `email` (profile / auth email).
 * Only updates rows in pending / invited / activated — never overwrites `converted` (idempotent).
 *
 * When `providerCustomerId` is set and the primary user match finds no row, resolves `user_id`(s)
 * from `subscriptions.provider_customer_id` and retries (covers edge cases where billing identity
 * maps before waitlist `linked_user_id` is set).
 */
export async function markWaitlistConvertedOnPaidSubscription(
  admin: SupabaseClient,
  userId: string,
  opts?: { userEmail?: string | null; providerCustomerId?: string | null }
): Promise<void> {
  const now = new Date().toISOString();
  const emailNorm = await resolveEmailHints(admin, userId, opts?.userEmail ?? null);

  let hit = await tryConvertWaitlistRow(admin, { userId, emailNorm, now });
  if (hit) {
    billingLog.info('waitlist_converted', { email: hit.email });
    return;
  }

  const cust = String(opts?.providerCustomerId ?? '').trim();
  if (!cust) return;

  const { data: subRows, error: subErr } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('provider_customer_id', cust);
  if (subErr || !subRows?.length) return;

  const userIds = [...new Set(subRows.map((r) => String(r.user_id)).filter(Boolean))].filter(
    (uid) => uid !== userId
  );
  for (const uid of userIds) {
    const em = await resolveEmailHints(admin, uid, null);
    hit = await tryConvertWaitlistRow(admin, { userId: uid, emailNorm: em, now });
    if (hit) {
      billingLog.info('waitlist_converted', { email: hit.email });
      return;
    }
  }
}
