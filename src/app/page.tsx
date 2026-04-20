import Link from 'next/link';
import { Bell, Bot, CreditCard, FileText } from 'lucide-react';
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
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:pb-20 sm:pt-20 md:pt-24">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            AI-powered invoicing
          </p>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
            Get paid faster. Run your business smarter.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Create invoices by chat, voice, or screenshot. Track payments, automate reminders, and ask
            your AI assistant what matters—cash flow, overdue balances, and what to do next.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <Link href="/signup" className="app-btn-primary-lg inline-flex items-center justify-center">
              Start free
            </Link>
            <Link
              href="/dashboard-mockup"
              className="app-btn-secondary-lg inline-flex items-center justify-center"
            >
              Try demo
            </Link>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-[var(--sidebar-border)] py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Everything you need to stay on top of revenue
              </h2>
              <p className="mt-3 text-slate-600 dark:text-slate-400">
                Focused tools that work together—no clutter, no steep learning curve.
              </p>
            </div>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <li className="app-card-surface app-card-surface-hover flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Smart invoicing</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Draft invoices from natural language, voice, or uploads—formatted and ready to send.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <CreditCard className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Payment tracking</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  See what&apos;s paid, partial, or overdue at a glance—no spreadsheet gymnastics.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <Bell className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Automated reminders</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Nudge customers before and after due dates so nothing slips through the cracks.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <Bot className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">AI assistant</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Ask questions, get summaries, and surface insights like a CFO in your pocket.
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
                From first login to first payment in three steps.
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
                  Sign up and add your business details—takes minutes, not days.
                </p>
              </li>
              <li className="relative text-center md:text-left">
                <span
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                  aria-hidden
                >
                  2
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Invoice your way</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Use chat, voice, or uploads to generate polished invoices instantly.
                </p>
              </li>
              <li className="relative text-center md:text-left">
                <span
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                >
                  3
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Collect &amp; stay ahead</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Track payments, send reminders, and ask the assistant what to prioritize next.
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
              Ready to simplify invoicing?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-slate-600 dark:text-slate-400">
              Join teams using Zenzex to invoice faster, get paid on time, and understand their numbers
              without another complicated tool.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup" className="app-btn-primary-lg inline-flex items-center justify-center">
                Create your free account
              </Link>
              <Link
                href="/login"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Already have an account? Sign in
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
