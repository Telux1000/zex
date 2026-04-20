import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund Policy | Zenzex',
  description:
    'Refund Policy for Zenzex. Payments and refunds are processed by Paddle, the merchant of record.',
};

const PADDLE_BUYER_TERMS = 'https://www.paddle.com/legal/buyer-terms';
const PADDLE_REFUND_POLICY = 'https://www.paddle.com/legal/refund-policy';

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--card)] text-[var(--foreground)]">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Refund Policy
          </h1>
          <p className="mt-4 text-slate-600 dark:text-slate-400">
            How refunds work for Zenzex purchases billed through Paddle.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">Last updated: April 20, 2026</p>
        </header>

        <div className="space-y-8 text-slate-700 dark:text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Merchant of record</h2>
            <p className="mt-2">
              Zenzex uses Paddle as its merchant of record. All payments, refunds, and transactions are
              processed and managed by Paddle.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              2. Paddle policy and consumer protection
            </h2>
            <p className="mt-2">
              All purchases are subject to Paddle&apos;s refund policy and applicable consumer protection
              laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. Refund eligibility</h2>
            <p className="mt-2">
              All purchases are eligible for a full refund if requested within 14 days of the transaction
              date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">4. Access after a refund</h2>
            <p className="mt-2">
              Upon processing a refund, access to the product or service will be terminated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">5. How to request a refund</h2>
            <p className="mt-2">
              To request a refund, customers must use the Paddle receipt, billing, or support links
              provided with their purchase, or email{' '}
              <a
                href="mailto:refunds@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                refunds@zenzex.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">6. Subscription cancellation</h2>
            <p className="mt-2">
              Subscriptions can be cancelled at any time to prevent future billing. Cancellation takes
              effect at the end of the current billing period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">7. Governing terms</h2>
            <p className="mt-2">
              This refund policy is governed by{' '}
              <a
                href={PADDLE_BUYER_TERMS}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Paddle&apos;s Buyer Terms
              </a>{' '}
              and{' '}
              <a
                href={PADDLE_REFUND_POLICY}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Refund Policy
              </a>
              . In case of conflict, Paddle&apos;s terms prevail.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">8. Terms and privacy</h2>
            <p className="mt-2">
              See also our{' '}
              <Link
                href="/terms"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
