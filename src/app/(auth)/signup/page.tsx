'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const pre = searchParams.get('email')?.trim();
    if (pre) setEmail(pre);
  }, [searchParams]);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/signup-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Sign up failed.');
        return;
      }
      router.replace(`/signup/confirm?email=${encodeURIComponent(email.trim())}`);
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="app-page-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="app-card-surface w-full max-w-sm space-y-8 p-6 sm:p-8">
        <div className="text-center">
          <AppLogoInline href="/" size="lg" priority className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">
            Create your account
          </h1>
        </div>

        <form onSubmit={signUp} className="space-y-4">
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
              minLength={6}
              className="app-input"
            />
          </div>
          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          )}
          <button type="submit" disabled={loading} className="app-btn-primary w-full">
            {loading ? 'Creating account...' : 'Sign up'}
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
          Already have an account?{' '}
          <Link href="/login" className="app-link-accent">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="app-page-bg flex min-h-screen items-center justify-center px-4">
          <div className="text-sm text-slate-500">Loading…</div>
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}
