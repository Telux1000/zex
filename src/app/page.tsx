import Link from 'next/link';
import { BarChart3, Bell, CreditCard, FileText } from 'lucide-react';
import { LandingPricingSection } from '@/components/pricing/LandingPricingSection';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--card)] text-[var(--foreground)]">
      <header className="app-marketing-header">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <AppLogoInline href="/" size="md" priority className="shrink-0" />
          <nav className="hidden items-center gap-8 sm:flex">
            <a
              href="#features"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Pricing
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-4 sm:gap-6">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
            >
              Log in
            </Link>
            <Link href="/signup" className="app-btn-primary">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:pb-20 sm:pt-20 md:pt-24">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            Smart invoicing
          </p>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
            Get paid faster with simple, automated invoicing
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Create invoices in seconds from text, voice, or uploads. Track payments in real time, automate
            follow-ups, and see clear summaries of revenue and outstanding balances without spreadsheets.
          </p>
          <div className="mt-10 flex justify-center">
            <Link href="/signup" className="app-btn-primary-lg inline-flex items-center justify-center">
              Start free
            </Link>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-[var(--sidebar-border)] py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Invoicing, payments, and visibility in one place
              </h2>
              <p className="mt-3 text-slate-600 dark:text-slate-400">
                Structured workflows and automation so you spend less time on admin and more time on work
                that pays.
              </p>
            </div>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <li className="app-card-surface app-card-surface-hover flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Smart invoice creation</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Turn text, voice, or uploaded screenshots into professional invoices, ready to send in
                  seconds.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <CreditCard className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Real-time payment tracking</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  See what&apos;s paid, partial, or overdue at a glance. One clear view of your receivables.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <Bell className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Automated reminders</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Send polite, timely follow-ups before and after due dates, with less manual chasing and
                  steadier cash flow.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <BarChart3 className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Built-in insights</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Clear summaries and reporting so you can see revenue trends and outstanding balances at a
                  glance.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                How it works
              </h2>
              <p className="mt-3 text-slate-600 dark:text-slate-400">
                Set up in minutes, send your first invoice, then let automation handle the rest.
              </p>
            </div>
            <ol className="mx-auto mt-12 grid max-w-4xl gap-8 md:grid-cols-3 md:gap-10">
              <li className="relative text-center md:text-left">
                <span
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                  aria-hidden
                >
                  1
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Create your workspace</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Sign up, add your business profile, and connect how you bill, without an implementation
                  project.
                </p>
              </li>
              <li className="relative text-center md:text-left">
                <span
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                  aria-hidden
                >
                  2
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Issue invoices quickly</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Build line items from text, voice, or uploads, and intelligent formatting keeps every
                  invoice consistent.
                </p>
              </li>
              <li className="relative text-center md:text-left">
                <span
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                >
                  3
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Collect and stay current</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Monitor status in real time, run automated reminder workflows, and review summaries when
                  you reconcile.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <LandingPricingSection />

        {/* Final CTA */}
        <section className="border-t border-[var(--sidebar-border)] py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <h2 className="text-balance text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Start invoicing with confidence
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-slate-600 dark:text-slate-400">
              Zenzex helps you issue invoices faster, track payments clearly, and reduce manual follow-up, so
              you always know where revenue stands.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500 dark:text-slate-500">
              No credit card required to get started.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="app-btn-primary-lg inline-flex items-center justify-center">
                Create free account
              </Link>
              <Link
                href="/login"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--sidebar-border)] py-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
            <AppLogoInline href="/" size="sm" />
            <div className="flex flex-col items-center gap-3 sm:items-end">
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-500">
                <Link
                  href="/terms"
                  className="transition-colors hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Terms of Service
                </Link>
                <Link
                  href="/privacy"
                  className="transition-colors hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/refunds"
                  className="transition-colors hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Refund Policy
                </Link>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                © {new Date().getFullYear()} Zenzex. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
