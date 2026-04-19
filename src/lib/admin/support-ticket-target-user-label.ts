import type { SupabaseClient } from '@supabase/supabase-js';
import { formatAdminSupportUserDisplay } from '@/lib/admin/format-support-user-display';

export async function labelForSupportTicketTargetUserId(
  admin: SupabaseClient,
  targetUserId: string | null | undefined
): Promise<string | null> {
  const uid = targetUserId ? String(targetUserId).trim() : '';
  if (!uid) return null;

  const { data: p } = await admin
    .from('profiles')
    .select('full_name, email, account_number')
    .eq('id', uid)
    .maybeSingle();
  if (!p) return null;

  return formatAdminSupportUserDisplay({
    accountNumber: p.account_number,
    fullName: p.full_name,
    email: p.email,
  });
}
