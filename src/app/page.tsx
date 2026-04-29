import Link from 'next/link';
import type { Metadata } from 'next';
import {
  BarChart3,
  Bell,
  ChevronDown,
  CreditCard,
  Facebook,
  FileText,
  Instagram,
  Linkedin,
  X as XIcon,
  Youtube,
} from 'lucide-react';
import { LandingPricingSection } from '@/components/pricing/LandingPricingSection';
import { AppLogoInline } from '@/components/branding/AppLogoInline';
import { TikTokIcon } from '@/components/branding/TikTokIcon';
import { LandingOutstandingShowcase } from '@/components/landing/LandingOutstandingShowcase';

export const metadata: Metadata = {
  title: 'Zenzex | Simple Invoicing Software for Faster Payments',
  description:
    'Zenzex helps freelancers and businesses turn text, voice, or screenshots into professional invoices, track payments, send reminders, and get paid faster.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Zenzex | Simple Invoicing Software for Faster Payments',
    description:
      'Zenzex helps freelancers and businesses turn text, voice, or screenshots into professional invoices, track payments, send reminders, and get paid faster.',
    url: 'https://zenzex.com',
  },
  twitter: {
    title: 'Zenzex | Simple Invoicing Software for Faster Payments',
    description:
      'Zenzex helps freelancers and businesses turn text, voice, or screenshots into professional invoices, track payments, send reminders, and get paid faster.',
  },
};

const LANDING_SOCIAL_LINKS = [
  { href: 'https://x.com/zenzexai', label: 'Zenzex on X', Icon: XIcon },
  { href: 'https://linkedin.com/company/zenzexai', label: 'Zenzex on LinkedIn', Icon: Linkedin },
  { href: 'https://instagram.com/zenzexai', label: 'Zenzex on Instagram', Icon: Instagram },
  { href: 'https://tiktok.com/@zenzexai', label: 'Zenzex on TikTok', Icon: TikTokIcon },
  { href: 'https://www.youtube.com/@zenzexai', label: 'Zenzex on YouTube', Icon: Youtube },
  { href: 'https://www.facebook.com/zenzexai', label: 'Zenzex on Facebook', Icon: Facebook },
];

const LANDING_FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Can clients pay directly from the invoice?',
    answer:
      'Yes, invoices include a payment link. Clients can pay by card without needing an account.',
  },
  {
    question: 'What integrations do you support?',
    answer:
      'Zenzex connects with Stripe for payments. Accounting integrations (QuickBooks, Xero) are on the roadmap.',
  },
  {
    question: 'What happens when my free trial ends?',
    answer:
      "You'll be prompted to choose a plan. If you don't upgrade, you move to the Starter free plan automatically, with no charge and no data lost.",
  },
  {
    question: 'What currencies are supported?',
    answer: 'Invoice clients worldwide, supporting USD, EUR, GBP, NGN, ZAR, and more.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: "Yes. Cancel before your next billing date and you won't be charged again.",
  },
];

export default function LandingPage() {
  const appUrl = 'https://zenzex.com';
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Zenzex',
    legalName: 'Telux Pty Ltd',
    url: appUrl,
    logo: `${appUrl}/zenzex-mark.png`,
  };
  const softwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Zenzex',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: appUrl,
    description:
      'Simple invoicing for freelancers and businesses: create invoices from text, voice, or screenshots, track payments, send reminders, and get paid faster.',
  };
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Zenzex',
    url: appUrl,
    description:
      'Zenzex helps freelancers and businesses invoice clients, follow up on overdue balances, and collect payment without spreadsheets.',
  };
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: LANDING_FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--card)] text-[var(--foreground)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
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
            Simple invoicing software
          </p>
          <h1 className="mt-4 text-balance text-3xl font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-white sm:mt-5 sm:text-5xl sm:leading-tight md:text-6xl">
            Stop chasing clients for money.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base font-medium leading-relaxed text-slate-700 dark:text-slate-300 sm:mt-6 sm:text-lg sm:leading-relaxed">
            Get paid faster with simple, automated invoicing for freelancers and businesses.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-5 sm:text-base">
            Create invoices your way from text, voice, manual entry, or screenshots in seconds. Track
            what&rsquo;s paid or overdue, and send reminders automatically.
          </p>
          <p className="mt-4 text-balance text-sm font-medium text-slate-800 dark:text-slate-200 sm:mt-5 sm:text-base">
            No spreadsheets. No stress.
          </p>
          <div className="mx-auto mt-8 flex w-full max-w-lg flex-col items-stretch justify-center gap-3 px-1 sm:mt-10 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-4 sm:px-0">
            <Link
              href="/signup"
              className="app-btn-primary-lg inline-flex w-full min-h-[48px] shrink-0 items-center justify-center sm:w-auto sm:min-w-[10.5rem] sm:min-h-0"
            >
              Start free
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-[48px] w-full shrink-0 items-center justify-center rounded-lg text-sm font-medium text-slate-600 underline-offset-4 transition-colors hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white sm:w-auto sm:px-2"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-balance text-xs font-semibold text-indigo-600 dark:text-indigo-400 sm:mt-5 sm:text-sm">
            No credit card required &bull; Setup in minutes
          </p>

          {/* Social proof: TODO(placeholder): Replace counts, rating source, and quotes with real data / testimonials. */}
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
            <div className="mt-8 sm:mt-10">
              <h3 className="text-center text-base font-semibold text-slate-900 dark:text-white sm:text-lg">
                Loved by freelancers and businesses
              </h3>
              <div className="mt-5 grid gap-4 sm:mt-6 sm:gap-5 md:grid-cols-3">
                <blockquote className="flex h-full flex-col rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)] p-5 text-left shadow-sm">
                  <div className="flex items-center gap-3">
                    <img
                      src="https://ui-avatars.com/api/?name=Maya+Chen&background=e2e8f0&color=334155"
                      alt="Avatar of Maya Chen"
                      className="h-10 w-10 shrink-0 rounded-full border border-[var(--sidebar-border)]"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Maya Chen</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">Freelance designer</p>
                    </div>
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    &ldquo;I dictate invoices between client calls, Zenzex is the first tool that actually keeps up.&rdquo;
                    {/* TODO(placeholder): testimonial copy */}
                  </p>
                  <p className="mt-3 text-xs tracking-wide text-amber-500 dark:text-amber-400" aria-label="5 out of 5 stars">
                    ★★★★★
                  </p>
                </blockquote>
                <blockquote className="flex h-full flex-col rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)] p-5 text-left shadow-sm">
                  <div className="flex items-center gap-3">
                    <img
                      src="https://ui-avatars.com/api/?name=Jordan+Okonkwo&background=e2e8f0&color=334155"
                      alt="Avatar of Jordan Okonkwo"
                      className="h-10 w-10 shrink-0 rounded-full border border-[var(--sidebar-border)]"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Jordan Okonkwo</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">Creative studio lead</p>
                    </div>
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    &ldquo;Our three-person studio finally stopped chasing payments, reminders just happen.&rdquo;
                    {/* TODO(placeholder): testimonial copy */}
                  </p>
                  <p className="mt-3 text-xs tracking-wide text-amber-500 dark:text-amber-400" aria-label="5 out of 5 stars">
                    ★★★★★
                  </p>
                </blockquote>
                <blockquote className="flex h-full flex-col rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)] p-5 text-left shadow-sm">
                  <div className="flex items-center gap-3">
                    <img
                      src="https://ui-avatars.com/api/?name=Sam+Rivera&background=e2e8f0&color=334155"
                      alt="Avatar of Sam Rivera"
                      className="h-10 w-10 shrink-0 rounded-full border border-[var(--sidebar-border)]"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Sam Rivera</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">Independent consultant</p>
                    </div>
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    &ldquo;Screenshot a scope email, get an invoice, it&apos;s stupidly fast for IT contracts.&rdquo;
                    {/* TODO(placeholder): testimonial copy */}
                  </p>
                  <p className="mt-3 text-xs tracking-wide text-amber-500 dark:text-amber-400" aria-label="5 out of 5 stars">
                    ★★★★★
                  </p>
                </blockquote>
              </div>
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

            <div className="mx-auto mt-8 max-w-4xl sm:mt-12">
              <LandingOutstandingShowcase />
            </div>

            <ul className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              <li className="app-card-surface app-card-surface-hover flex flex-col p-5 sm:p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Smart invoice creation</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Create invoices your way from text, voice, manual entry, or screenshots in seconds.
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
                Set up in minutes. Send your first invoice. Get paid without the follow-up.
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
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Set up your workspace</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Sign up, add your business details, and you&rsquo;re ready to invoice, no setup headaches.
                </p>
              </li>
              <li className="relative text-center md:text-left">
                <span
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                  aria-hidden
                >
                  2
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Create invoices in seconds</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Create invoices your way from text, voice, manual entry, or screenshots in seconds.
                </p>
              </li>
              <li className="relative text-center md:text-left">
                <span
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                >
                  3
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">Get paid and stay in control</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Track what&rsquo;s paid or overdue in real time, and let automatic reminders handle the follow-up.
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
              <nav aria-label="Zenzex on social media" className="w-full sm:w-auto">
                <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-5 p-0 sm:justify-end">
                  {LANDING_SOCIAL_LINKS.map(({ href, label, Icon }) => (
                    <li key={href}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-slate-500 transition-[color,transform] hover:scale-105 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:outline-slate-400"
                      >
                        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
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
