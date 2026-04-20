import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import type { SupabaseCookieToSet } from '@/lib/supabase/cookie-types';

const INTERNAL_ADMIN_ROLES = new Set(['owner', 'admin', 'support']);

function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return { url, anon };
}

function safeNext(pathWithQuery: string) {
  if (!pathWithQuery.startsWith('/') || pathWithQuery.startsWith('//')) return '/admin';
  return pathWithQuery;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminPage = pathname.startsWith('/admin');
  const isAdminApi = pathname.startsWith('/api/admin');

  if (!isAdminPage && !isAdminApi) {
    return await updateSession(request);
  }

  const env = getSupabasePublicEnv();
  if (!env) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'Server misconfigured: missing Supabase public env vars.' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/login?notice=config-missing', request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anon, {
    auth: { flowType: 'pkce' },
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const next = safeNext(`${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(new URL(`/login?context=admin&next=${encodeURIComponent(next)}`, request.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('internal_admin_role, internal_admin_suspended_at')
    .eq('id', user.id)
    .maybeSingle();
  const internalRole = String(profile?.internal_admin_role ?? '')
    .trim()
    .toLowerCase();
  const suspended = Boolean(profile?.internal_admin_suspended_at);
  const allowed = INTERNAL_ADMIN_ROLES.has(internalRole) && !suspended;

  if (!allowed) {
    console.warn('[admin-access-denied]', {
      path: pathname,
      userId: user.id,
      reason: 'missing_or_invalid_internal_admin_role',
    });
    if (isAdminApi) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/dashboard?notice=admin-denied', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
