import { createClient } from '@supabase/supabase-js';

export function getSupabaseServiceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const missing: string[] = [];
    if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
    if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    console.error(`[supabase-service-admin] Missing env: ${missing.join(', ')}`);
    return null;
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
