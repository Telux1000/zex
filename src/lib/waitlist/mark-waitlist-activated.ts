import type { SupabaseClient } from '@supabase/supabase-js';
import { billingLog } from '@/lib/billing/billing-logger';

/**
 * When an account is created for a waitlisted email, move pending/invited → activated.
 * Idempotent for already-activated/converted rows (update matches none).
 */
export async function markWaitlistActivatedOnSignup(
  admin: SupabaseClient,
  input: { userId: string; email: string }
): Promise<void> {
  const emailNorm = String(input.email ?? '').trim().toLowerCase();
  if (!emailNorm || !input.userId) return;

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('waitlist')
    .update({
      status: 'activated',
      activated_at: now,
      linked_user_id: input.userId,
    })
    .in('status', ['pending', 'invited'])
    .eq('email', emailNorm)
    .select('id')
    .maybeSingle();

  if (error) {
    billingLog.warn('waitlist_activate_update_failed', { email: emailNorm, message: error.message });
    return;
  }
  if (data?.id) {
    billingLog.info('waitlist_activated', { email: emailNorm });
  }
}
