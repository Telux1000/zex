'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      /* same UX as success */
    }
    setLoading(false);
    setDone(true);
  }

  return (
    <div className="app-page-bg flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="app-card-surface w-full max-w-sm space-y-6 p-6 sm:p-8">
        <div className="text-center">
          <AppLogoInline href="/" size="lg" priority className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Forgot password</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {done ? (
          <p className="text-center text-sm text-slate-700 dark:text-slate-300">
            If an account exists, a reset link has been sent.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="app-input"
              />
            </div>
            <button type="submit" disabled={loading} className="app-btn-primary w-full">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm">
          <Link href="/login" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
