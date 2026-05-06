import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description:
    'How refunds and subscription cancellations work for Zenzex—clear, simple, and fair.',
  alternates: {
    canonical: '/refunds',
  },
  openGraph: {
    title: 'Refund Policy | Zenzex',
    description:
      'How refunds and subscription cancellations work for Zenzex—clear, simple, and fair.',
    url: '/refunds',
  },
  twitter: {
    title: 'Refund Policy | Zenzex',
    description:
      'How refunds and subscription cancellations work for Zenzex—clear, simple, and fair.',
  },
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--card)] text-[var(--foreground)]">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Refund Policy
          </h1>
          <p className="mt-4 text-slate-600 dark:text-slate-400">
            Billing should be easy to understand. Here is how refunds and cancellations work if you need
            them.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">Last updated: April 23, 2026</p>
        </header>

        <div className="space-y-10 text-slate-700 dark:text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">14-day refund window</h2>
            <p className="mt-2 leading-relaxed">
              For paid subscriptions, you may request a <strong className="font-semibold text-slate-900 dark:text-white">full refund</strong> within{' '}
              <strong className="font-semibold text-slate-900 dark:text-white">14 days</strong> of your initial
              charge (or the first charge after you upgrade to a new paid plan). The refund applies to that
              charge only—not to earlier or later billing periods.
            </p>
            <p className="mt-2 leading-relaxed">
              Trial terms: 14-day trial on paid plans. One trial per account. Cancel anytime from billing
              settings before renewal to avoid charges.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Subscriptions</h2>
            <p className="mt-2 leading-relaxed">
              Cancel anytime from your account. You keep full access until the{' '}
              <strong className="font-semibold text-slate-900 dark:text-white">end of your current billing period</strong>, and you are not charged again after
              that.
            </p>
            <p className="mt-2 leading-relaxed">
              Zenzex subscription charges are processed by our billing providers. Zenzex does not hold
              customer invoice funds.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">After a refund</h2>
            <p className="mt-2 leading-relaxed">
              Once we process your refund, the subscription linked to that payment ends and paid features
              are turned off. You may not be able to use or export some data that was only available while
              that subscription was active.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">How to request a refund</h2>
            <p className="mt-2 leading-relaxed">
              Email{' '}
              <a
                href="mailto:refunds@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                refunds@zenzex.com
              </a>{' '}
              from the address on your Zenzex account. Include your workspace or account name and the date
              of the charge. We typically confirm within <strong className="font-semibold text-slate-900 dark:text-white">1–2 business days</strong>; refunds are
              issued to your original payment method once approved.
            </p>
            <p className="mt-2 leading-relaxed">
              We may ask for basic verification details to confirm account ownership and prevent misuse.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Fair use</h2>
            <p className="mt-2 leading-relaxed">
              We treat refund requests in good faith. We may decline a refund if we see clear signs of
              abuse—for example, repeated subscribe-and-refund cycles or use that conflicts with normal
              product use. If something is unclear, we will reach out before making a final decision.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Changes to this policy</h2>
            <p className="mt-2 leading-relaxed">
              We may update this page occasionally and will change the &quot;Last updated&quot; date when we do. New
              charges follow the version you see here at the time you pay. For past charges, the version that
              applied when you were billed still describes your refund options.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Terms and privacy</h2>
            <p className="mt-2 leading-relaxed">
              Our{' '}
              <Link
                href="/terms"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Terms of Service
              </Link>{' '}
              describe how you use Zenzex overall. Our{' '}
              <Link
                href="/privacy"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Privacy Policy
              </Link>{' '}
              explains how we handle personal information.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
