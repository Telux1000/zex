'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function safeNextPath(raw: string | null): string {
  const n = (raw ?? '/dashboard').trim();
  if (!n.startsWith('/') || n.startsWith('//')) return '/dashboard';
  return n;
}

function classifyAuthError(message: string): 'link_expired' | 'auth' {
  const m = message.toLowerCase();
  if (
    m.includes('expired') ||
    m.includes('invalid') ||
    m.includes('otp') ||
    m.includes('already used')
  ) {
    return 'link_expired';
  }
  return 'auth';
}

/**
 * Handles Supabase email confirmation / OAuth return.
 * Must run in the browser: PKCE uses ?code= (OK on server too) but legacy implicit flows put
 * tokens in the URL hash, which never reaches a Route Handler — only the client can read them.
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hint, setHint] = useState('Confirming your email…');

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const code = searchParams.get('code');
      const next = safeNextPath(searchParams.get('next'));
      const explicitError = searchParams.get('error');
      const explicitErrorDescription = searchParams.get('error_description');
      const hasNextParam = searchParams.has('next');

      try {
        if (explicitError) {
          const mapped = classifyAuthError(explicitErrorDescription ?? explicitError);
          router.replace(`/login?error=${mapped}`);
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const { data: first, error: e1 } = await supabase.auth.getSession();
          if (e1) throw e1;
          if (!first.session) {
            await new Promise((r) => setTimeout(r, 200));
            const { data: second, error: e2 } = await supabase.auth.getSession();
            if (e2) throw e2;
            if (!second.session) {
              if (!cancelled) {
                // Email-confirmation links can be valid even when project settings do not auto-sign-in.
                if (!hasNextParam) {
                  router.replace('/login?verified=success');
                } else {
                  router.replace('/login?error=auth');
                }
              }
              return;
            }
          }
        }

        if (cancelled) return;

        try {
          await fetch('/api/auth/login-activity', { method: 'POST' });
        } catch {
          /* non-blocking */
        }

        router.replace(next);
        router.refresh();
      } catch (error) {
        if (!cancelled) {
          setHint('Could not confirm. Redirecting to sign in…');
          const mapped = classifyAuthError(error instanceof Error ? error.message : '');
          router.replace(`/login?error=${mapped}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{hint}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">One moment…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center px-6 text-sm text-slate-600 dark:text-slate-300">
          Loading…
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
