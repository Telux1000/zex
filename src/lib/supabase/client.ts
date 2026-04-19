import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    }
  );
}

/**
 * Password reset links from `auth.admin.generateLink({ type: 'recovery' })` (team/admin/forgot-password API)
 * redirect with an implicit-style URL fragment, not a PKCE exchange the browser prepared. The shared app client
 * forces `flowType: 'pkce'` (and @supabase/ssr cannot override it), so recovery would fail with a missing verifier.
 * Use this client only on `/reset-password`.
 */
export function createPasswordResetBrowserClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
}
