import type { SupabaseClient } from '@supabase/supabase-js';

/** Upsert read pointer to latest message time (or now if empty thread). */
export async function markSupportTicketReadForUser(
  supabase: SupabaseClient,
  userId: string,
  ticketId: string
): Promise<void> {
  const { data: maxRow } = await supabase
    .from('support_ticket_messages')
    .select('created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const at = maxRow?.created_at ? String(maxRow.created_at) : new Date().toISOString();
  const now = new Date().toISOString();

  await supabase.from('support_ticket_read_state').upsert(
    {
      user_id: userId,
      ticket_id: ticketId,
      last_read_at: at,
      updated_at: now,
    },
    { onConflict: 'user_id,ticket_id' }
  );
}
