'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

function safeNextPath(raw: string | null): string {
  const value = (raw ?? '/dashboard').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const supabase = createClient();
  const nextPath = safeNextPath(searchParams.get('next'));
  const isAdminContext = searchParams.get('context') === 'admin' || nextPath.startsWith('/admin');

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setMessage({ type: 'success', text: 'Redirecting...' });
    try {
      await fetch('/api/auth/login-activity', { method: 'POST' });
    } catch {
      /* non-blocking */
    }
    window.location.href = nextPath;
  }

  async function signInWithGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
    });
  }

  return (
    <div className="app-page-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="app-card-surface w-full max-w-sm space-y-8 p-6 sm:p-8">
        <div className="text-center">
          <AppLogoInline href="/" size="lg" priority className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">
            Sign in to your account
          </h1>
          {isAdminContext ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Sign in to access the Zenzex admin panel.</p>
          ) : null}
        </div>

        <form onSubmit={signInWithEmail} className="space-y-4">
          {searchParams.get('reset') === 'success' && !message && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Password updated successfully. Please sign in.
            </p>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="app-input"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="app-input"
            />
            <div className="mt-1.5 flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          {message && (
            <p
              className={`text-sm ${message.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`}
            >
              {message.text}
            </p>
          )}
          <button type="submit" disabled={loading} className="app-btn-primary w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--card-border)]" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-[var(--card)] px-2 text-slate-500 dark:text-slate-400">
              Or continue with
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="app-btn-secondary flex w-full items-center justify-center gap-2"
        >
          Google
        </button>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="app-link-accent">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-bg flex min-h-[50vh] items-center justify-center text-slate-500 dark:text-slate-400">
          Loading…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
