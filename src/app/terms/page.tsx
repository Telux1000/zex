import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | Zenzex',
  description:
    'Terms of Service for Zenzex, a software service operated by Telux Pty Ltd.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-[var(--card)] text-[var(--foreground)]">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-slate-600 dark:text-slate-400">
            These Terms of Service govern access to and use of Zenzex, a software service
            operated by Telux Pty Ltd.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">Last updated: April 20, 2026</p>
        </header>

        <div className="space-y-8 text-slate-700 dark:text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Introduction</h2>
            <p className="mt-2">
              These Terms apply when you access or use Zenzex. By using the service, you agree to these
              Terms. If you do not agree, do not use Zenzex.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. Who we are</h2>
            <p className="mt-2">Zenzex is operated by Telux Pty Ltd.</p>
            <p className="mt-2">
              Website:{' '}
              <a
                href="https://zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                https://zenzex.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              3. Eligibility and account registration
            </h2>
            <p className="mt-2">
              You must be legally able to enter into a binding agreement to use Zenzex. You are
              responsible for providing accurate registration details and for keeping your account
              credentials secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">4. Access to the service</h2>
            <p className="mt-2">
              We grant you a limited, non-exclusive, non-transferable right to access and use Zenzex in
              accordance with these Terms and your selected plan.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">5. Acceptable use</h2>
            <p className="mt-2">
              You must not misuse Zenzex, attempt unauthorized access, interfere with service operation,
              or use the platform for unlawful, fraudulent, or abusive activities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              6. Subscription, billing, and renewals
            </h2>
            <p className="mt-2">
              Paid plans are billed in advance on a recurring basis. By subscribing, you authorize us to
              charge your selected payment method for applicable fees, taxes, and renewals until
              cancellation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              7. Cancellations and plan changes
            </h2>
            <p className="mt-2">
              You may cancel your subscription at any time through your account settings where available.
              Cancellation stops future renewals but does not automatically provide a refund for the
              current billing period unless required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">8. Refunds</h2>
            <p className="mt-2">
              Refunds are handled under our Refund Policy. Please review{' '}
              <Link
                href="/refunds"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                /refunds
              </Link>{' '}
              for full details.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">9. Intellectual property</h2>
            <p className="mt-2">
              Zenzex, including software, branding, and related content, is owned by or licensed to
              Telux Pty Ltd and protected by applicable intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">10. Customer data</h2>
            <p className="mt-2">
              You retain your rights to data you submit to Zenzex. You grant us the rights needed to host,
              process, and transmit that data solely to provide and improve the service and to meet legal
              obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">11. Privacy</h2>
            <p className="mt-2">
              Our collection and use of personal information is described in our Privacy Policy at{' '}
              <Link
                href="/privacy"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                /privacy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              12. Service availability and updates
            </h2>
            <p className="mt-2">
              We work to keep Zenzex available and reliable, but we do not guarantee uninterrupted service.
              We may update, modify, or discontinue features from time to time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">13. Disclaimers</h2>
            <p className="mt-2">
              Zenzex is provided on an &quot;as is&quot; and &quot;as available&quot; basis to the extent permitted
              by law. We disclaim warranties that are not expressly stated in these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              14. Limitation of liability
            </h2>
            <p className="mt-2">
              To the maximum extent permitted by law, Telux Pty Ltd is not liable for indirect, incidental,
              special, consequential, or punitive damages, or for loss of profits, revenue, data, or
              goodwill arising from use of Zenzex.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              15. Suspension and termination
            </h2>
            <p className="mt-2">
              We may suspend or terminate access if you violate these Terms, create risk for the platform
              or other users, or where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              16. Governing law and disputes
            </h2>
            <p className="mt-2">
              These Terms are governed by the laws of Republic of South Africa, without regard to
              conflict of law principles. Disputes will be handled in the courts of that jurisdiction,
              unless otherwise required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">17. Contact us</h2>
            <p className="mt-2">
              For legal questions, contact{' '}
              <a
                href="mailto:legal@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                legal@zenzex.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
