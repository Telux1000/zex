import type { SupabaseClient } from '@supabase/supabase-js';
import { deviceLabelFromUserAgent, maskIpFromForwarded } from '@/lib/auth/device-label';

type HeaderGet = { get(name: string): string | null };

export async function insertLoginEventSuccess(
  supabase: SupabaseClient,
  userId: string,
  headers: HeaderGet
) {
  const ua = headers.get('user-agent') ?? '';
  const forwarded = headers.get('x-forwarded-for') ?? headers.get('x-real-ip');
  return supabase.from('user_login_events').insert({
    user_id: userId,
    status: 'success',
    device_label: deviceLabelFromUserAgent(ua),
    ip_display: maskIpFromForwarded(forwarded),
  });
}
