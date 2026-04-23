import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Zenzex',
  description:
    'How Telux Pty Ltd collects, uses, and protects personal information when you use Zenzex.',
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
            This Privacy Policy describes how Telux Pty Ltd (&quot;Telux&quot;, &quot;we&quot;, &quot;us&quot;) handles personal
            information when you use Zenzex, including our website and applications at{' '}
            <a
              href="https://zenzex.com"
              className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              https://zenzex.com
            </a>
            . We aim to be transparent and practical—if anything is unclear, contact us using the details at
            the end of this page.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">Last updated: April 23, 2026</p>
        </header>

        <div className="space-y-8 text-slate-700 dark:text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Introduction</h2>
            <p className="mt-2 leading-relaxed">
              Telux Pty Ltd is the operator of Zenzex and, for the purposes described here, acts as the
              controller of personal information we collect about visitors, account holders, and authorized
              users of a workspace. This policy should be read together with our{' '}
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
              , which explain how the service works and how billing-related requests are handled.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. Information we collect</h2>
            <p className="mt-2 leading-relaxed">
              The information we process depends on how you use Zenzex. It commonly includes:
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Account information</strong> — name,
                email address, password or authentication tokens, role, workspace identifiers, and settings
                you configure in the product.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Contact information</strong> — business
                name, postal address, phone number, and similar details you add to your profile or invoices.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Billing and subscription information</strong>{' '}
                — plan tier, subscription status, trial dates, invoices we issue to you, and limited payment
                metadata supplied by trusted billing partners (we do not store full payment card numbers on
                our own servers when a partner tokenizes that data).
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Device and usage information</strong>{' '}
                — IP address, approximate location derived from IP, browser or app version, device type,
                diagnostic logs, feature usage, performance metrics, and timestamps that help us operate and
                secure the service.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Cookies and similar technologies</strong>{' '}
                — data from cookies, local storage, or pixels used for authentication, preferences, analytics,
                and reliability monitoring.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Communications and support</strong> — the
                contents of emails, in-product messages, support tickets, and feedback you send us.
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Data you submit through the service</strong>{' '}
                — invoicing and payment records, customer or vendor contact details you enter, uploaded files,
                reminder templates, notes, and other business content processed so Zenzex can provide
                invoicing, payment tracking, automated reminders, and in-product summaries and insights.
              </li>
            </ul>
            <p className="mt-2 leading-relaxed">
              You should not submit sensitive categories of personal information (such as health data) unless
              a feature explicitly requires it and you have a lawful basis to do so.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. How we use information</h2>
            <p className="mt-2 leading-relaxed">We use personal information to:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
              <li>provide, host, and maintain Zenzex, including syncing data across devices you authorize;</li>
              <li>authenticate users, prevent fraud, monitor abuse, and protect account security;</li>
              <li>process subscriptions, trials, upgrades, downgrades, and related billing events;</li>
              <li>
                run product features such as automated reminders, reporting, and in-product summaries and
                insights derived from data you store in Zenzex;
              </li>
              <li>improve performance, reliability, and usability, including through aggregated or de-identified
                analytics where permitted;</li>
              <li>communicate with you about service updates, security notices, support responses, and (where
                allowed) relevant product information;</li>
              <li>comply with law, respond to lawful requests, and enforce our agreements, including the{' '}
                <Link
                  href="/terms"
                  className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Terms of Service
                </Link>
                .
              </li>
            </ul>
            <p className="mt-2 leading-relaxed">
              We do <strong className="font-semibold text-slate-900 dark:text-white">not</strong> sell your personal information, and we do not use it for third-party
              behavioral advertising unrelated to Zenzex.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">4. Legal bases where applicable</h2>
            <p className="mt-2 leading-relaxed">
              In regions that require a stated legal basis (for example, the European Economic Area, United
              Kingdom, or Switzerland), we rely on one or more of the following, as appropriate:
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Contract</strong> — processing needed to
                deliver Zenzex and perform our agreement with you or your organization;
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Legitimate interests</strong> — securing
                the service, understanding aggregate usage, improving features, and communicating about the
                product, where those interests are not overridden by your rights;
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Consent</strong> — where we ask for it
                for optional activities such as certain marketing communications or non-essential cookies;
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Legal obligation</strong> — processing
                required to meet tax, accounting, or regulatory duties, or to respond to valid legal process.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">5. Sharing of information</h2>
            <p className="mt-2 leading-relaxed">
              We share personal information only when needed to run Zenzex or as the law requires. Categories
              of recipients include:
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Service providers</strong> — vendors that
                host infrastructure, provide authentication, deliver email or SMS, process payments and
                subscriptions, perform analytics, assist with customer support, or provide security monitoring,
                each bound by contractual confidentiality and processing obligations;
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Professional advisers</strong> — lawyers,
                auditors, or insurers where confidentiality obligations apply;
              </li>
              <li>
                <strong className="font-semibold text-slate-900 dark:text-white">Authorities and others</strong> — courts,
                regulators, or parties to a transaction involving Telux (such as a merger), when disclosure is
                legally required or permitted.
              </li>
            </ul>
            <p className="mt-2 leading-relaxed">
              We may publish aggregated statistics that cannot reasonably identify you or your customers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">6. Data retention</h2>
            <p className="mt-2 leading-relaxed">
              We keep personal information only as long as reasonably necessary to deliver the service,
              maintain business records, resolve disputes, troubleshoot issues, demonstrate compliance, and
              enforce our agreements. Retention periods vary by data type: for example, billing records may be
              kept longer than transient logs. When retention is no longer needed, we delete or de-identify
              information in line with this policy and applicable law.
            </p>
            <p className="mt-2 leading-relaxed">
              You may request deletion of your account and associated personal information by emailing{' '}
              <a
                href="mailto:privacy@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                privacy@zenzex.com
              </a>
              . We will honor requests where no overriding legal obligation requires us to retain specific
              records.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">7. Data security</h2>
            <p className="mt-2 leading-relaxed">
              We implement administrative, technical, and organizational measures designed to protect personal
              information against unauthorized access, alteration, disclosure, or destruction. Examples
              include access controls, encryption in transit where appropriate, logging, and vendor security
              reviews.
            </p>
            <p className="mt-2 leading-relaxed">
              No system is perfectly secure. You are responsible for maintaining the confidentiality of your
              account credentials and for promptly notifying us if you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">8. International data transfers</h2>
            <p className="mt-2 leading-relaxed">
              Telux operates globally. Personal information may be processed in countries other than where you
              live, including where our service providers maintain facilities. When we transfer personal
              information from regions that require extra safeguards, we use mechanisms recognized under
              applicable law—such as standard contractual clauses approved by relevant regulators, adequacy
              decisions where available, or supplementary measures when needed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">9. Your rights</h2>
            <p className="mt-2 leading-relaxed">
              Depending on where you live, you may have the right to request access to, correction of, or
              deletion of your personal information; to object to or ask us to restrict certain processing; or
              to receive a portable copy of information you provided, where technically feasible. You may
              also withdraw consent where processing was consent-based, without affecting the lawfulness of
              earlier processing.
            </p>
            <p className="mt-2 leading-relaxed">
              To exercise these rights, contact{' '}
              <a
                href="mailto:privacy@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                privacy@zenzex.com
              </a>
              . We may need to verify your identity before responding. If you are unsatisfied with our
              answer, you may lodge a complaint with your local data protection authority where that right
              exists.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">10. Cookies and analytics</h2>
            <p className="mt-2 leading-relaxed">
              We use cookies and similar technologies to keep sessions secure, remember preferences, measure
              how Zenzex performs, and understand aggregated product usage. Some analytics may be handled by
              subprocessors subject to our instructions.
            </p>
            <p className="mt-2 leading-relaxed">
              You can control many cookies through your browser settings. Blocking essential cookies may affect
              login or core functionality.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">11. Children&apos;s privacy</h2>
            <p className="mt-2 leading-relaxed">
              Zenzex is built for businesses and is not directed to children. We do not knowingly collect
              personal information from anyone under the age at which they may validly use the service in
              their region. If you believe we have collected information from a child in error, contact us and
              we will take appropriate steps to delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">12. Changes to this policy</h2>
            <p className="mt-2 leading-relaxed">
              We may update this Privacy Policy to reflect changes to Zenzex, our practices, or legal
              requirements. We will post the revised version on this page and update the &quot;Last updated&quot; date.
              If a change materially affects how we use personal information, we will provide additional
              notice when the law requires it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">13. Contact us</h2>
            <p className="mt-2 leading-relaxed">
              Privacy questions and requests:{' '}
              <a
                href="mailto:privacy@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                privacy@zenzex.com
              </a>
            </p>
            <p className="mt-2 leading-relaxed">
              Related documents:{' '}
              <Link
                href="/terms"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Terms of Service
              </Link>
              ,{' '}
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
