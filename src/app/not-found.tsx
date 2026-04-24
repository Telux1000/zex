import Link from 'next/link';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--card)] text-[var(--foreground)]">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
        <AppLogoInline href="/" size="md" />
        <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          This page could not be found
        </h1>
        <p className="mt-4 max-w-xl text-sm text-slate-600 dark:text-slate-400 sm:text-base">
          The link may be outdated, or the page may have moved. Use one of the links below to continue.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="app-btn-primary">
            Go to homepage
          </Link>
          <Link href="/signup" className="app-btn-secondary">
            Start free
          </Link>
          <Link href="/login" className="app-btn-secondary">
            Log in
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-500">
          <Link href="/terms" className="transition-colors hover:text-slate-700 dark:hover:text-slate-300">
            Terms
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-slate-700 dark:hover:text-slate-300">
            Privacy
          </Link>
          <Link href="/refunds" className="transition-colors hover:text-slate-700 dark:hover:text-slate-300">
            Refunds
          </Link>
        </div>
      </main>
    </div>
  );
}
