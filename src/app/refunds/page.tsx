import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund Policy | Zenzex',
  description:
    'Refund Policy for Zenzex subscriptions and services offered by Telux Pty Ltd.',
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
            This Refund Policy explains when refunds may be available for purchases of Zenzex
            subscriptions or services from Telux Pty Ltd.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">Last updated: April 20, 2026</p>
        </header>

        <div className="space-y-8 text-slate-700 dark:text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Overview</h2>
            <p className="mt-2">
              This policy applies to charges for Zenzex paid subscriptions and related services purchased
              from Telux Pty Ltd through{' '}
              <a
                href="https://zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                zenzex.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. Subscription charges</h2>
            <p className="mt-2">
              Subscription fees are charged in advance for the selected billing cycle. Unless required by
              law, fees already paid are generally non-refundable once the billing period has started.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. Renewal billing</h2>
            <p className="mt-2">
              Subscriptions renew automatically at the end of each billing period unless canceled before
              the renewal date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              4. When refunds may be granted
            </h2>
            <p className="mt-2">
              Approved refunds are reviewed case by case in the event of duplicate charges, proven billing
              errors, or exceptional circumstances required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              5. Non-refundable situations
            </h2>
            <p className="mt-2">Refunds are generally not provided for:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Unused time in an active billing period.</li>
              <li>Change of mind after the billing period begins.</li>
              <li>Failure to cancel before a renewal charge is processed.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              6. Billing errors and duplicate charges
            </h2>
            <p className="mt-2">
              If you believe you were billed incorrectly or charged more than once, contact us promptly so
              we can investigate and resolve the issue.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">7. Cancellations</h2>
            <p className="mt-2">
              Canceling a subscription stops future renewals but does not automatically entitle you to a
              prorated refund for the current billing period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">8. Chargebacks</h2>
            <p className="mt-2">
              Before initiating a chargeback, please contact us to resolve billing concerns directly.
              Initiating a chargeback may result in temporary suspension of account access during review.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              9. How to request a refund
            </h2>
            <p className="mt-2">
              Refund requests must be submitted to{' '}
              <a
                href="mailto:refunds@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                refunds@zenzex.com
              </a>
              . Please include the account email, transaction date, amount, and reason for your request.
            </p>
            <p className="mt-2">
              If a refund is approved, it will be returned to the original payment method where possible.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">10. Contact us</h2>
            <p className="mt-2">
              For refund-related questions, contact{' '}
              <a
                href="mailto:refunds@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                refunds@zenzex.com
              </a>
              .
            </p>
            <p className="mt-2">
              You can also review our{' '}
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
