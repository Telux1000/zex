import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseCookieToSet } from '@/lib/supabase/cookie-types';

function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return { url, anon };
}

export async function updateSession(request: NextRequest) {
  const env = getSupabasePublicEnv();
  if (!env) {
    // Avoid middleware invocation crash when env vars are missing.
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anon, {
    auth: {
      flowType: 'pkce',
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as never)
        );
      },
    },
  });

  const authT0 = Date.now();
  await supabase.auth.getUser();
  if (process.env.NODE_ENV === 'development') {
    const p = request.nextUrl.pathname;
    if (p === '/login' || p.startsWith('/dashboard') || p.startsWith('/auth/')) {
      const ms = Date.now() - authT0;
      // pathname only — no query (may contain sensitive data)
      const label = p.length > 64 ? `${p.slice(0, 61)}…` : p;
      console.info(`[login-perf] middleware: auth_check ms=${ms} path=${label}`);
    }
  }

  return response;
}
