import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import type { Metadata } from 'next';
import { ChevronDown, Facebook, Instagram, Linkedin, X as XIcon, Youtube } from 'lucide-react';
import { AppLogoInline } from '@/components/branding/AppLogoInline';
import { TikTokIcon } from '@/components/branding/TikTokIcon';
import { LandingFeatureList } from '@/components/landing/LandingFeatureList';
import { LandingMarketingMobileNav } from '@/components/landing/LandingMarketingMobileNav';
import { LandingMarketingSmoothScroll } from '@/components/landing/LandingMarketingSmoothScroll';
import { LandingMobileStickyWaitlist } from '@/components/landing/LandingMobileStickyWaitlist';
import { LandingWaitlistDisabledHashHandler } from '@/components/landing/LandingWaitlistDisabledHashHandler';
import { LandingWaitlistSection } from '@/components/landing/LandingWaitlistSection';
import { ThemeModeSegmented } from '@/components/theme/ThemeModeSegmented';
import { WaitlistForm } from '@/components/waitlist/WaitlistForm';
import {
  LANDING_HOW_IT_WORKS_COMPACT,
  LANDING_HOW_IT_WORKS_STEPS,
} from '@/lib/landing/landing-how-it-works-steps';
import { LANDING_WAITLIST_EMAIL_INPUT_ID } from '@/lib/landing/landing-waitlist-ids';
import { getPublicWaitlistEnabled } from '@/lib/landing/public-waitlist-settings';
import { cn } from '@/lib/utils/cn';

const LandingOutstandingShowcase = nextDynamic(
  () =>
    import('@/components/landing/LandingOutstandingShowcase').then((m) => ({
      default: m.LandingOutstandingShowcase,
    })),
  {
    loading: () => (
      <div
        className="min-h-[min(14rem,42svh)] w-full rounded-xl border border-[var(--sidebar-border)] bg-slate-100/35 dark:bg-slate-800/30"
        role="status"
        aria-label="Loading product preview"
      />
    ),
  },
);

const LandingPricingSection = nextDynamic(
  () =>
    import('@/components/pricing/LandingPricingSection').then((m) => ({
      default: m.LandingPricingSection,
    })),
  {
    loading: () => (
      <div
        className="min-h-[28rem] w-full border-t border-[var(--sidebar-border)] bg-[var(--background)] py-10"
        role="status"
        aria-label="Loading pricing"
      />
    ),
  },
);

/** Always resolve waitlist flag at request time (avoid static prerender baking a default). */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Zenzex | Simple Invoicing Software for Faster Payments',
  description:
    'Simple invoicing for freelancers and businesses: create invoices faster, review before sending, and track payments clearly.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Zenzex | Simple Invoicing Software for Faster Payments',
    description:
      'Simple invoicing for freelancers and businesses: create invoices faster, review before sending, and track payments clearly.',
    url: 'https://zenzex.com',
  },
  twitter: {
    title: 'Zenzex | Simple Invoicing Software for Faster Payments',
    description:
      'Simple invoicing for freelancers and businesses: create invoices faster, review before sending, and track payments clearly.',
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
  {
    question: 'How does payment processing work with Zenzex?',
    answer:
      'Zenzex helps you create and manage invoices. Payments are processed by your selected payment provider, and Zenzex does not hold customer funds.',
  },
];

export default async function LandingPage() {
  const waitlistEnabled = await getPublicWaitlistEnabled({ debugLog: true });
  const appUrl = 'https://zenzex.com';
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Zenzex',
    legalName: 'Telux Limited',
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
      <LandingMarketingSmoothScroll />
      {!waitlistEnabled ? <LandingWaitlistDisabledHashHandler /> : null}
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
          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-8 sm:flex"
            aria-label="Page sections"
          >
            <a
              href="#features"
              className="shrink-0 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white sm:text-sm"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="shrink-0 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white sm:text-sm"
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="shrink-0 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white sm:text-sm"
            >
              Pricing
            </a>
            {waitlistEnabled ? (
              <a
                href="#waitlist"
                className="shrink-0 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white sm:text-sm"
              >
                Waitlist
              </a>
            ) : null}
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeModeSegmented density="compact" className="max-sm:order-first" />
            <LandingMarketingMobileNav waitlistEnabled={waitlistEnabled} />
            <Link
              href="/login"
              className="max-sm:hidden shrink-0 text-xs font-medium text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 sm:text-sm"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="app-btn-primary max-sm:hidden shrink-0 whitespace-nowrap text-xs sm:text-sm"
            >
              Start for free
            </Link>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'overflow-x-hidden',
          waitlistEnabled && 'max-sm:pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]',
        )}
      >
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-3 pb-6 pt-6 text-center sm:px-4 sm:pb-20 sm:pt-20 md:pt-24">
          <div className="sm:hidden">
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
              Get paid faster. Without the stress.
            </h1>
            <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Simple invoicing to create polished invoices faster, send reminders, and track payments clearly.
            </p>
            <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-2.5">
              {waitlistEnabled ? (
                <a
                  href="#waitlist"
                  className="app-btn-primary-lg inline-flex min-h-[48px] w-full items-center justify-center"
                >
                  Join waitlist
                </a>
              ) : (
                <Link
                  href="/signup"
                  className="app-btn-primary-lg inline-flex min-h-[48px] w-full items-center justify-center"
                >
                  Start for free
                </Link>
              )}
              <a
                href="#how-it-works"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-transparent text-sm font-semibold text-indigo-700 underline-offset-4 transition-colors hover:bg-indigo-50 hover:underline dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                Explore how it works
              </a>
            </div>
          </div>

          <div className="hidden sm:block">
            <p className="text-balance text-xs font-semibold uppercase leading-snug tracking-wide text-indigo-600 dark:text-indigo-400 sm:text-sm">
              Simple invoicing software
            </p>
            <h1 className="mt-4 text-balance text-3xl font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-white sm:mt-5 sm:text-5xl sm:leading-tight md:text-6xl">
              Stop chasing clients for money.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base font-medium leading-relaxed text-slate-700 dark:text-slate-300 sm:mt-6 sm:text-lg sm:leading-relaxed">
              Get paid faster with structured invoicing for freelancers and growing businesses.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-5 sm:text-base">
              Create invoices your way from text, voice, manual entry, or screenshots in seconds. Track
              what&rsquo;s paid or overdue, send reminders, and schedule follow-ups on your terms.
            </p>
            <p className="mt-4 text-balance text-sm font-medium text-slate-800 dark:text-slate-200 sm:mt-5 sm:text-base">
              Fast workflows, with full control before anything goes out.
            </p>
            <div className="mx-auto mt-8 flex w-full max-w-lg flex-col items-stretch justify-center gap-3 px-1 sm:mt-10 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-4 sm:px-0">
              {waitlistEnabled ? (
                <a
                  href="#waitlist"
                  className="app-btn-primary-lg inline-flex w-full min-h-[48px] shrink-0 items-center justify-center sm:w-auto sm:min-w-[10.5rem] sm:min-h-0"
                >
                  Join waitlist
                </a>
              ) : null}
              <Link
                href="/signup"
                className={
                  waitlistEnabled
                    ? 'app-btn-secondary inline-flex w-full min-h-[48px] shrink-0 items-center justify-center rounded-lg px-4 text-sm font-semibold sm:w-auto sm:min-w-[10.5rem]'
                    : 'app-btn-primary-lg inline-flex w-full min-h-[48px] shrink-0 items-center justify-center sm:w-auto sm:min-w-[10.5rem] sm:min-h-0'
                }
              >
                Start for free
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex min-h-[48px] w-full shrink-0 items-center justify-center rounded-lg text-sm font-medium text-slate-600 underline-offset-4 transition-colors hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white sm:w-auto sm:px-2"
              >
                Explore how it works
              </a>
            </div>
            <p className="mt-4 text-balance text-xs font-semibold text-indigo-600 dark:text-indigo-400 sm:mt-5 sm:text-sm">
              No credit card required &bull; Setup in minutes
            </p>
          </div>
        </section>

        {/* Who it's for */}
        <section className="mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
          <p className="text-pretty text-center text-sm font-medium leading-snug text-slate-600 dark:text-slate-400 sm:hidden">
            Built for freelancers, agencies, and growing businesses.
          </p>
          <div className="mx-auto mt-0 hidden max-w-5xl border-t border-[var(--sidebar-border)] pt-8 sm:mt-0 sm:block sm:pt-10">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
                Who Zenzex is for
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
                Designed to help you create invoices faster and stay in control of payments.
              </p>
            </div>
            <div className="mx-auto mt-6 grid max-w-4xl grid-cols-3 gap-4 sm:mt-8 sm:gap-5">
              <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)] px-4 py-4 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">Freelancers</p>
              </div>
              <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)] px-4 py-4 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">Agencies</p>
              </div>
              <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--card)] px-4 py-4 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-900 dark:text-white sm:text-base">Small businesses</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-24 border-t border-[var(--sidebar-border)] py-6 sm:scroll-mt-28 sm:py-20">
          <div className="mx-auto max-w-6xl px-3 sm:px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Everything you need to run invoicing
              </h2>
              <p className="mt-3 text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
                Structured invoicing workflows so you spend less time on admin and stay in control of revenue.
              </p>
            </div>

            <div className="mx-auto mt-6 max-w-4xl sm:mt-12">
              <LandingOutstandingShowcase />
            </div>

            <LandingFeatureList />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-24 py-6 sm:scroll-mt-28 sm:py-20">
          <div className="mx-auto max-w-6xl px-3 sm:px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Your invoicing workflow
              </h2>
              <p className="mt-2 text-pretty text-sm text-slate-600 dark:text-slate-400 sm:mt-3 sm:text-base">
                Set up in minutes. Send your first invoice. Track follow-ups and payments in one clear flow.
              </p>
            </div>

            <ol className="mx-auto mt-5 max-w-md list-none space-y-4 p-0 md:hidden">
              {LANDING_HOW_IT_WORKS_COMPACT.map((step) => (
                <li key={step.n} className="flex min-w-0 gap-3 text-left">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white"
                    aria-hidden
                  >
                    {step.n}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <ol className="mx-auto mt-8 hidden max-w-4xl list-none gap-6 p-0 sm:mt-12 sm:gap-8 md:grid md:grid-cols-3 md:gap-10">
              {LANDING_HOW_IT_WORKS_STEPS.map((step) => (
                <li key={step.n} className="relative text-center md:text-left">
                  <span
                    className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white md:mx-0"
                    aria-hidden
                  >
                    {step.n}
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pain → solution */}
        <section
          aria-labelledby="landing-pain-heading"
          className="scroll-mt-24 border-t border-[var(--sidebar-border)] py-6 sm:scroll-mt-28 sm:py-12"
        >
          <div className="mx-auto max-w-xl px-3 text-center sm:px-4">
            <h2 id="landing-pain-heading" className="sr-only">
              Why Zenzex
            </h2>
            <p className="text-pretty text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200 sm:text-lg">
              Stop chasing invoices. Stop guessing your cashflow. Zenzex helps you stay in control.
            </p>
          </div>
        </section>

        {/* Waitlist */}
        {waitlistEnabled ? (
          <div className="mx-auto max-w-lg px-3 py-6 sm:py-10">
            <LandingWaitlistSection
              heading="Get early access to Zenzex"
              description="Join the waitlist and be first to use structured invoicing built for speed and simplicity."
            >
              <WaitlistForm
                source="landing"
                emailInputId={LANDING_WAITLIST_EMAIL_INPUT_ID}
                hideMarketingTitle
                explicitEmailLabel
                microcopy="No spam. Early access only."
              />
            </LandingWaitlistSection>
          </div>
        ) : null}

        {waitlistEnabled ? (
          <div className="mx-auto max-w-lg px-3 pb-6 text-center sm:hidden">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Want early access?</p>
            <a
              href="#waitlist"
              className="app-btn-primary-lg mt-3 inline-flex min-h-[48px] w-full items-center justify-center"
            >
              Join waitlist
            </a>
          </div>
        ) : null}

        <section className="border-t border-[var(--sidebar-border)] py-8 sm:py-16">
          <div className="mx-auto max-w-3xl px-3 sm:px-4">
            <h2 className="text-center text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              How Zenzex keeps invoicing predictable
            </h2>
            <ul className="mx-auto mt-6 max-w-2xl space-y-2.5 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
              <li>Every invoice is reviewed before sending.</li>
              <li>You control when invoices and reminders are sent.</li>
              <li>Payments are handled by your selected provider.</li>
              <li>Zenzex does not hold or move funds.</li>
              <li>You are responsible for the invoices you create.</li>
            </ul>
          </div>
        </section>

        <LandingPricingSection
          waitlistVisibility="anchor-only"
          publicWaitlistEnabled={waitlistEnabled}
        />

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 border-t border-[var(--sidebar-border)] py-8 sm:py-20 sm:scroll-mt-28">
          <div className="mx-auto max-w-2xl px-3 sm:px-4">
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Answers before you sign up
              </h2>
              <p className="mt-3 text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
                Quick answers on plans, billing, and payment tracking.
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
        <section className="border-t border-[var(--sidebar-border)] py-8 sm:py-24">
          <div className="mx-auto max-w-3xl px-3 text-center sm:px-4">
            <h2 className="text-balance text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Start invoicing with clarity
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-sm text-slate-600 dark:text-slate-400 sm:text-base">
              Zenzex helps you issue invoices faster, track payments clearly, and reduce manual follow-up, so you always
              know where revenue stands.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-xs text-slate-500 dark:text-slate-500 sm:text-sm">
              You control when invoices and reminders are sent.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-xs text-slate-500 dark:text-slate-500 sm:text-sm">
              No credit card required to get started.
            </p>
            <div className="mx-auto mt-8 flex w-full max-w-sm justify-center sm:mt-10 sm:max-w-none">
              <Link
                href="/signup"
                className="app-btn-primary-lg inline-flex w-full min-h-[48px] items-center justify-center sm:w-auto sm:min-h-0"
              >
                Start your free account
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--sidebar-border)] py-5 sm:py-8">
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
              <a
                href="mailto:support@zenzex.com"
                className="text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
              >
                support@zenzex.com
              </a>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                © {new Date().getFullYear()} Zenzex. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </main>
      {waitlistEnabled ? <LandingMobileStickyWaitlist /> : null}
    </div>
  );
}
