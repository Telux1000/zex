import Link from 'next/link';
import { BarChart3, Bell, ChevronDown, CreditCard, FileText } from 'lucide-react';
import { LandingPricingSection } from '@/components/pricing/LandingPricingSection';
import { AppLogoInline } from '@/components/branding/AppLogoInline';

const LANDING_FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Can clients pay directly from the invoice?',
    answer:
      'Yes — invoices include a payment link. Clients can pay by card without needing an account.',
  },
  {
    question: 'What integrations do you support?',
    answer:
      'Zenzex connects with Stripe for payments. Accounting integrations (QuickBooks, Xero) are on the roadmap.',
  },
  {
    question: 'What happens when my free trial ends?',
    answer:
      "You'll be prompted to choose a plan. If you don't upgrade, you move to the Starter free plan automatically — no charge, no data lost.",
  },
  {
    question: 'What currencies are supported?',
    answer: 'USD, EUR, GBP, and ZAR are supported. More currencies are being added.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: "Yes. Cancel before your next billing date and you won't be charged again.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--card)] text-[var(--foreground)]">
      <header className="app-marketing-header">
        <div className="mx-auto flex h-14 min-h-[3.5rem] max-w-6xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-4">
          <AppLogoInline href="/" size="md" priority className="min-w-0 shrink-0" />
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
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-6">
            <Link
              href="/login"
              className="shrink-0 text-xs font-medium text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 sm:text-sm"
            >
              Log in
            </Link>
            <Link href="/signup" className="app-btn-primary shrink-0 whitespace-nowrap text-xs sm:text-sm">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-3 pb-12 pt-12 text-center sm:px-4 sm:pb-20 sm:pt-20 md:pt-24">
          <p className="text-balance text-xs font-semibold uppercase leading-snug tracking-wide text-indigo-600 dark:text-indigo-400 sm:text-sm">
            New · Voice-to-invoice now live
          </p>
          <h1 className="mt-3 text-balance text-3xl font-bold leading-[1.12] tracking-tight text-slate-900 dark:text-white sm:mt-4 sm:text-5xl sm:leading-tight md:text-6xl">
            Invoice from a voice note. Send it in seconds.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-6 sm:text-lg">
            Zenzex turns text, voice, or uploaded screenshots into professional invoices — with automated reminders
            and real-time payment tracking built in.
          </p>
          <div className="mx-auto mt-8 flex w-full max-w-sm justify-center px-1 sm:mt-10 sm:max-w-none sm:px-0">
            <Link
              href="/signup"
              className="app-btn-primary-lg inline-flex w-full min-h-[48px] items-center justify-center sm:w-auto sm:min-h-0"
            >
              Start free
            </Link>
          </div>

          {/* Social proof — TODO(placeholder): Replace counts, rating source, and quotes with real data / testimonials. */}
          <div className="mx-auto mt-10 max-w-5xl border-t border-[var(--sidebar-border)] pt-8 sm:mt-12 sm:pt-10">
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap sm:gap-10">
              {/* TODO(placeholder): Replace 400+ with live business count. */}
              <p className="text-center text-xs font-semibold text-slate-800 dark:text-slate-200 sm:text-sm">
                Join <span className="text-indigo-600 dark:text-indigo-400">400+ businesses</span>
              </p>
              <div
                className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-[var(--sidebar-border)] bg-[var(--card)] px-3 py-2 shadow-sm sm:px-4"
                aria-label="Rating placeholder"
              >
                <span className="flex shrink-0 text-sm text-amber-500 sm:text-base" aria-hidden>
                  {'★★★★★'}
                </span>
                {/* TODO(placeholder): Verify rating and attribution source. */}
                <span className="text-center text-xs font-medium text-slate-700 dark:text-slate-300 sm:text-sm">
                  4.8 on Product Hunt
                </span>
              </div>
            </div>
            <div className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 pl-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-10 sm:justify-center sm:overflow-visible sm:pb-0 sm:pl-0 [&::-webkit-scrollbar]:hidden">
              <blockquote className="w-[calc((100%-0.75rem)/2)] shrink-0 snap-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--card)] p-3 text-left sm:min-w-0 sm:w-auto sm:max-w-[260px] sm:p-4">
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm">
                  &ldquo;I dictate invoices between client calls — Zenzex is the first tool that actually keeps up.&rdquo;
                  {/* TODO(placeholder): testimonial copy */}
                </p>
                <footer className="mt-3 text-xs font-semibold text-slate-900 dark:text-white">
                  Maya Chen{/* TODO(placeholder): name */} · Freelance designer
                </footer>
              </blockquote>
              <blockquote className="w-[calc((100%-0.75rem)/2)] shrink-0 snap-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--card)] p-3 text-left sm:min-w-0 sm:w-auto sm:max-w-[260px] sm:p-4">
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm">
                  &ldquo;Our three-person studio finally stopped chasing payments — reminders just happen.&rdquo;
                  {/* TODO(placeholder): testimonial copy */}
                </p>
                <footer className="mt-3 text-xs font-semibold text-slate-900 dark:text-white">
                  Jordan Okonkwo{/* TODO(placeholder): name */} · Creative studio lead
                </footer>
              </blockquote>
              <blockquote className="w-[calc((100%-0.75rem)/2)] shrink-0 snap-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--card)] p-3 text-left sm:min-w-0 sm:w-auto sm:max-w-[260px] sm:p-4">
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm">
                  &ldquo;Screenshot a scope email, get an invoice — it&apos;s stupidly fast for IT contracts.&rdquo;
                  {/* TODO(placeholder): testimonial copy */}
                </p>
                <footer className="mt-3 text-xs font-semibold text-slate-900 dark:text-white">
                  Sam Rivera{/* TODO(placeholder): name */} · Independent consultant
                </footer>
              </blockquote>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-[var(--sidebar-border)] py-12 sm:py-20">
          <div className="mx-auto max-w-6xl px-3 sm:px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Invoicing, payments, and visibility in one place
              </h2>
              <p className="mt-3 text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
                Structured workflows and automation so you spend less time on admin and more time on work that pays.
              </p>
            </div>

            {/* TODO(placeholder): Swap for real product screenshot when ready. */}
            <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-lg border border-[var(--sidebar-border)] bg-[var(--card)] shadow-lg shadow-slate-900/[0.06] dark:shadow-black/40 sm:mt-12 sm:rounded-xl">
              <div
                className="flex h-10 items-center gap-2 border-b border-slate-300/80 bg-slate-200 px-3.5 dark:border-slate-600 dark:bg-slate-700"
                aria-hidden
              >
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="border-t border-slate-200/50 bg-gradient-to-b from-slate-50 to-white p-3 sm:p-6 dark:border-slate-600/50 dark:from-slate-900/80 dark:to-[var(--card)]">
                <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-1">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:text-xs">
                      Total outstanding
                    </p>
                    <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">$4,280.00</p>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">Dashboard preview (sample data)</p>
                </div>

                {/* Mobile: stacked rows (no horizontal table scroll) */}
                <div className="space-y-3 sm:hidden">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-950/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">INV-1042</p>
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Northwind Studio</p>
                        <p className="text-xs text-slate-500">Due Apr 12</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">$1,200.00</p>
                        <span className="mt-1 inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">
                          Paid
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">INV-1045</p>
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Harbor & Co.</p>
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Due Apr 2</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">$2,450.00</p>
                        <span className="mt-1 inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                          Overdue
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="mt-3 flex w-full min-h-[44px] cursor-default items-center justify-center rounded-md bg-indigo-600 text-sm font-semibold text-white dark:bg-indigo-500"
                    >
                      Send Reminder
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-950/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">INV-1048</p>
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Brightline Labs</p>
                        <p className="text-xs text-slate-500">Due Apr 28</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">$630.00</p>
                        <span className="mt-1 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                          Pending
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white sm:block dark:border-slate-600 dark:bg-slate-950/40">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
                        <th className="px-4 py-2.5">Invoice</th>
                        <th className="px-4 py-2.5">Client</th>
                        <th className="px-4 py-2.5">Due</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                        <th className="px-4 py-2.5 text-right">Status</th>
                        <th className="px-4 py-2.5 text-right"> </th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700 dark:text-slate-300">
                      <tr className="border-b border-slate-100 dark:border-slate-700/80">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">INV-1042</td>
                        <td className="px-4 py-3">Northwind Studio</td>
                        <td className="px-4 py-3 text-slate-500">Apr 12</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">$1,200.00</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                            Paid
                          </span>
                        </td>
                        <td className="px-4 py-3" />
                      </tr>
                      <tr className="border-b border-slate-100 bg-amber-50/80 dark:border-slate-700/80 dark:bg-amber-500/10">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">INV-1045</td>
                        <td className="px-4 py-3">Harbor & Co.</td>
                        <td className="px-4 py-3 font-medium text-amber-800 dark:text-amber-200">Apr 2</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">$2,450.00</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:text-amber-300">
                            Overdue
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            tabIndex={-1}
                            className="inline-flex cursor-default rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm dark:bg-indigo-500"
                          >
                            Send Reminder
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">INV-1048</td>
                        <td className="px-4 py-3">Brightline Labs</td>
                        <td className="px-4 py-3 text-slate-500">Apr 28</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">$630.00</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            Pending
                          </span>
                        </td>
                        <td className="px-4 py-3" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <ul className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              <li className="app-card-surface app-card-surface-hover flex flex-col p-5 sm:p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Smart invoice creation</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Turn text, voice, or uploaded screenshots into professional invoices, ready to send in seconds.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-5 sm:p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <CreditCard className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Real-time payment tracking</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  See what&apos;s paid, partial, or overdue at a glance. One clear view of your receivables.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-5 sm:p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <Bell className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Automated reminders</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Send polite, timely follow-ups before and after due dates, with less manual chasing and steadier cash
                  flow.
                </p>
              </li>
              <li className="app-card-surface app-card-surface-hover flex flex-col p-5 sm:p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <BarChart3 className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Built-in insights</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Clear summaries and reporting so you can see revenue trends and outstanding balances at a glance.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 py-12 sm:py-20">
          <div className="mx-auto max-w-6xl px-3 sm:px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                How it works
              </h2>
              <p className="mt-3 text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
                Set up in minutes, send your first invoice, then let automation handle the rest.
              </p>
            </div>
            <ol className="mx-auto mt-8 grid max-w-4xl gap-6 sm:mt-12 sm:gap-8 md:grid-cols-3 md:gap-10">
              <li className="relative text-center md:text-left">
                <span
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                  aria-hidden
                >
                  1
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Create your workspace</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Sign up, add your business profile, and connect how you bill, without an implementation project.
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
                  Build line items from text, voice, or uploads, and intelligent formatting keeps every invoice
                  consistent.
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
                  Monitor status in real time, run automated reminder workflows, and review summaries when you reconcile.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <LandingPricingSection />

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-[var(--sidebar-border)] py-12 sm:py-20">
          <div className="mx-auto max-w-2xl px-3 sm:px-4">
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Frequently asked questions
              </h2>
              <p className="mt-3 text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
                Quick answers about billing, payments, and plans.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-2.5 sm:mt-10 sm:gap-3">
              {LANDING_FAQ_ITEMS.map((item) => (
                <details
                  key={item.question}
                  className="group app-card-surface overflow-hidden rounded-lg border border-[var(--sidebar-border)]"
                >
                  <summary className="flex min-h-[48px] cursor-pointer list-none items-start justify-between gap-3 px-3 py-3.5 text-left text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:text-white dark:hover:bg-slate-800/60 dark:active:bg-slate-800 sm:items-center sm:p-4 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 pt-0.5 sm:pt-0">{item.question}</span>
                    <ChevronDown
                      className="mt-0.5 h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400 sm:mt-0 sm:h-4 sm:w-4"
                      aria-hidden
                    />
                  </summary>
                  <div className="border-t border-[var(--sidebar-border)] px-3 pb-3.5 pt-0 sm:px-4 sm:pb-4">
                    <p className="pt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:pt-3">{item.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-[var(--sidebar-border)] py-12 sm:py-24">
          <div className="mx-auto max-w-3xl px-3 text-center sm:px-4">
            <h2 className="text-balance text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Start invoicing with confidence
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
              Zenzex helps you issue invoices faster, track payments clearly, and reduce manual follow-up, so you always
              know where revenue stands.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-xs text-slate-500 dark:text-slate-500 sm:text-sm">
              No credit card required to get started.
            </p>
            <div className="mx-auto mt-8 flex w-full max-w-sm justify-center sm:mt-10 sm:max-w-none">
              <Link
                href="/signup"
                className="app-btn-primary-lg inline-flex w-full min-h-[48px] items-center justify-center sm:w-auto sm:min-h-0"
              >
                Create free account
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--sidebar-border)] py-6 sm:py-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-3 sm:flex-row sm:px-4">
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
