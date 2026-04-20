import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Zenzex',
  description:
    'Privacy Policy describing how Telux Pty Ltd handles personal information for Zenzex.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--card)] text-[var(--foreground)]">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-slate-600 dark:text-slate-400">
            This Privacy Policy explains how Telux Pty Ltd collects, uses, stores, and protects
            personal information in connection with Zenzex.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">Last updated: April 20, 2026</p>
        </header>

        <div className="space-y-8 text-slate-700 dark:text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Introduction</h2>
            <p className="mt-2">
              This Privacy Policy applies to our website at{' '}
              <a
                href="https://zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                https://zenzex.com
              </a>{' '}
              and to Zenzex services operated by Telux Pty Ltd.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. Information we collect</h2>
            <p className="mt-2">We may collect:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Account information, such as login credentials and profile details.</li>
              <li>Contact information, such as name, email address, and business details.</li>
              <li>Billing-related information needed for subscriptions and payment processing.</li>
              <li>Device and usage information, such as browser type, pages visited, and timestamps.</li>
              <li>Cookies and analytics information used to operate and improve the service.</li>
              <li>Communications and support data from messages, requests, and feedback.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. How we use information</h2>
            <p className="mt-2">
              We use information to provide and maintain Zenzex, process billing, secure accounts, deliver
              customer support, analyze performance, communicate service updates, and meet legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              4. Legal bases where applicable
            </h2>
            <p className="mt-2">
              Where required by applicable law, we process personal information based on contractual
              necessity, legitimate interests, consent, and compliance with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">5. Sharing of information</h2>
            <p className="mt-2">We may share information with:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Payment processors to handle subscription payments and related transactions.</li>
              <li>Analytics providers that help us understand product usage and improve services.</li>
              <li>Infrastructure and service providers that host, secure, and support the platform.</li>
              <li>Legal or regulatory authorities where disclosure is required by law or legal process.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">6. Data retention</h2>
            <p className="mt-2">
              We retain personal information for as long as reasonably necessary to provide Zenzex,
              maintain records, resolve disputes, enforce agreements, and comply with legal requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">7. Data security</h2>
            <p className="mt-2">
              We use administrative, technical, and organizational safeguards designed to protect personal
              information. No method of transmission or storage is completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              8. International data transfers
            </h2>
            <p className="mt-2">
              Personal information may be processed in countries other than your own. Where required, we
              use appropriate safeguards for international transfers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">9. Your rights</h2>
            <p className="mt-2">Depending on your location, you may have rights to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Access personal information we hold about you.</li>
              <li>Correct inaccurate or incomplete personal information.</li>
              <li>Request deletion of personal information, subject to legal exceptions.</li>
              <li>Object to or restrict certain processing where applicable.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">10. Cookies and analytics</h2>
            <p className="mt-2">
              We use cookies and similar technologies to keep you signed in, remember preferences, measure
              usage, and improve Zenzex. You can manage cookie settings through your browser.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">11. Children&apos;s privacy</h2>
            <p className="mt-2">
              Zenzex is not directed to children, and we do not knowingly collect personal information from
              children where prohibited by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">12. Changes to this policy</h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. We will post the revised version on this
              page and update the “Last updated” date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">13. Contact us</h2>
            <p className="mt-2">
              For privacy questions or requests, contact{' '}
              <a
                href="mailto:privacy@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                privacy@zenzex.com
              </a>
              .
            </p>
            <p className="mt-2">
              For terms and billing context, see{' '}
              <Link
                href="/terms"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/refunds"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Refund Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
