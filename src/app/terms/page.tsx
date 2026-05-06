import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for Zenzex, invoicing, payment tracking, and automation operated by Telux Limited.',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'Terms of Service | Zenzex',
    description:
      'Terms of Service for Zenzex, invoicing, payment tracking, and automation operated by Telux Limited.',
    url: '/terms',
  },
  twitter: {
    title: 'Terms of Service | Zenzex',
    description:
      'Terms of Service for Zenzex, invoicing, payment tracking, and automation operated by Telux Limited.',
  },
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
            These Terms govern your use of Zenzex. They apply to everyone who accesses or uses the service.
            Please read them carefully.
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">Last updated: April 23, 2026</p>
        </header>

        <div className="space-y-8 text-slate-700 dark:text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">1. Introduction</h2>
            <p className="mt-2 leading-relaxed">
              By creating an account, visiting, or using Zenzex, including any website or application offered
              at{' '}
              <a
                href="https://zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                zenzex.com
              </a>
              you agree to these Terms. If you use Zenzex on behalf of an organization, you represent that
              you have authority to bind it, and &quot;you&quot; includes that organization. If you do not agree, do
              not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">2. About us</h2>
            <p className="mt-2 leading-relaxed">
              Zenzex is provided by <strong className="font-semibold text-slate-900 dark:text-white">Telux Limited</strong> (&quot;Telux&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;). Our public website is{' '}
              <a
                href="https://zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                https://zenzex.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">3. The service</h2>
            <p className="mt-2 leading-relaxed">
              Zenzex is online software for invoicing, payment tracking, reminders, and financial
              summaries and insights based on information you provide. Certain features use intelligent
              automation to help you create invoices from text, voice, or file uploads and to streamline
              routine workflows.
            </p>
            <p className="mt-2 leading-relaxed">
              Zenzex provides <strong className="font-semibold text-slate-900 dark:text-white">tools only</strong>. It does{' '}
              <strong className="font-semibold text-slate-900 dark:text-white">not</strong> provide financial, accounting, tax, or legal advice, and it does not make
              recommendations tailored to your situation. You are responsible for your business decisions,
              regulatory compliance, and the accuracy of anything you send to customers or regulators.
            </p>
            <p className="mt-2 leading-relaxed">
              You are responsible for reviewing invoice drafts and confirming each invoice, recipient, and
              reminder before it is sent. Zenzex helps manage invoicing workflows, but you remain responsible
              for invoice content and delivery choices.
            </p>
            <p className="mt-2 leading-relaxed">
              Payments related to your invoices are processed by your selected payment provider. Zenzex does
              not hold, custody, or transfer customer funds on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">4. Eligibility and account registration</h2>
            <p className="mt-2 leading-relaxed">
              You must meet the legal age and capacity requirements in your place of residence and be able
              to enter a binding contract. You agree to provide accurate account information and to keep it
              current. You are responsible for safeguarding credentials and for activity on your account
              except where that activity results solely from our error or misuse of our systems.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">5. Access to the service</h2>
            <p className="mt-2 leading-relaxed">
              Subject to these Terms and the limits of your plan, Telux grants you a limited, non-exclusive,
              non-transferable, non-sublicensable, revocable right to access and use Zenzex for your internal
              business purposes for as long as your subscription or trial is active. You may not resell,
              lease, time-share, or otherwise commercialize access to Zenzex except with our prior written
              consent.
            </p>
            <p className="mt-2 leading-relaxed">
              Automated or assisted features may produce drafts, calculations, reminders, or summaries. Those
              outputs may be incomplete or wrong. You must review and verify all outputs before you rely on
              them, share them externally, or use them for compliance, tax, accounting, or legal filings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">6. Acceptable use</h2>
            <p className="mt-2 leading-relaxed">You will not, and will not permit others to:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed">
              <li>use Zenzex for unlawful, fraudulent, deceptive, harassing, or abusive purposes;</li>
              <li>create, send, or schedule fraudulent invoices or misleading payment requests;</li>
              <li>attempt unauthorized access to Zenzex, another customer&apos;s data, or our networks or systems;</li>
              <li>probe, scan, or test vulnerabilities without our prior written approval;</li>
              <li>interfere with or disrupt the integrity, performance, or security of the service;</li>
              <li>reverse engineer, decompile, or disassemble any part of Zenzex except where mandatory law
                prohibits this restriction;</li>
              <li>extract or attempt to extract source code, models, or trade secrets from the service;</li>
              <li>use bots, scrapers, crawlers, or other automation to access the service in a way that
                overloads it, impairs others&apos; use, or bypasses intended access paths or rate limits;</li>
              <li>copy, frame, or mirror the service except as allowed by these Terms or by integrated sharing
                tools we provide;</li>
              <li>remove, alter, or obscure proprietary notices;</li>
              <li>distribute malware, spam, or content you do not have the right to use.</li>
            </ul>
            <p className="mt-2 leading-relaxed">
              We may investigate suspected misuse and work with authorities when the law requires it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              7. Subscription, billing, and renewals
            </h2>
            <p className="mt-2 leading-relaxed">
              Paid subscriptions renew automatically on the billing cycle shown in your account or at
              checkout (for example, monthly or yearly). By subscribing, you authorize Telux to charge your
              chosen payment method for all recurring fees, applicable taxes, and add-ons you select, until
              you cancel in line with these Terms.
            </p>
            <p className="mt-2 leading-relaxed">
              Fees are quoted exclusive of taxes unless we state otherwise. You are responsible for any
              sales, use, value-added, or similar taxes imposed on your subscription, excluding taxes on
              Telux&apos;s net income.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">8. Failed payments and suspension</h2>
            <p className="mt-2 leading-relaxed">
              If a charge is declined or reversed, we may retry it and notify you. We may suspend or limit
              access to paid features until the outstanding balance is paid. Suspension does not erase
              amounts you already owe for periods in which you used the service, except where our Refund
              Policy at{' '}
              <Link
                href="/refunds"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                /refunds
              </Link>{' '}
              provides otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">9. Cancellations and plan changes</h2>
            <p className="mt-2 leading-relaxed">
              You may cancel a paid subscription at any time using the controls in your account, where
              available. Cancellation stops future renewals. Unless the Refund Policy or mandatory law
              requires otherwise, fees for the billing period in progress are not refunded when you cancel
              mid-cycle.
            </p>
            <p className="mt-2 leading-relaxed">
              The current cancellation workflow is available from billing settings in your Zenzex account.
              If you cannot access billing settings, contact support@zenzex.com from your account email and
              we will assist.
            </p>
            <p className="mt-2 leading-relaxed">
              We may change plan names, prices, or feature bundles from time to time. Price changes take
              effect at the next renewal after notice, unless a law that applies to you requires a different
              approach.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">10. Refunds</h2>
            <p className="mt-2 leading-relaxed">
              Refunds, if any, are described exclusively in our Refund Policy at{' '}
              <Link
                href="/refunds"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                /refunds
              </Link>
              . Where the Refund Policy and these Terms differ on refund topics, the Refund Policy prevails.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">11. Intellectual property</h2>
            <p className="mt-2 leading-relaxed">
              Zenzex, including its software, visual design, documentation, and branding, is owned by Telux or
              its licensors and is protected worldwide by intellectual property laws. Except for the limited
              license in Section 5, these Terms grant you no rights in Telux&apos;s intellectual property.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">12. Customer data</h2>
            <p className="mt-2 leading-relaxed">
              You keep your rights in the business data you submit to Zenzex (&quot;Customer Data&quot;). You grant
              Telux a worldwide, royalty-free license to host, copy, process, transmit, display, and otherwise
              use Customer Data solely to operate, secure, and improve the service; communicate with you;
              comply with law; and enforce these Terms.
            </p>
            <p className="mt-2 leading-relaxed">
              You confirm that you have the rights, consents, and notices needed to submit Customer Data and
              that doing so does not infringe anyone else&apos;s rights or violate applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">13. Privacy</h2>
            <p className="mt-2 leading-relaxed">
              Our Privacy Policy at{' '}
              <Link
                href="/privacy"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                /privacy
              </Link>{' '}
              explains how we collect, use, and share personal information. By using Zenzex, you acknowledge
              that policy where it applies to you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              14. Service availability and updates
            </h2>
            <p className="mt-2 leading-relaxed">
              We design Zenzex for high availability but do not promise uninterrupted or error-free
              operation. Downtime may result from maintenance, upgrades, internet issues, third-party
              providers, security incidents, or events outside our reasonable control.
            </p>
            <p className="mt-2 leading-relaxed">
              We may ship updates, deprecate legacy features, or adjust usage limits to keep the product
              secure and competitive. If a change materially reduces core functionality of a paid plan you
              rely on, we will give reasonable advance notice when practicable, unless immediate action is
              required for security or legal reasons.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">15. Disclaimers</h2>
            <p className="mt-2 leading-relaxed">
              To the fullest extent permitted by applicable law, Zenzex is provided &quot;as is&quot; and &quot;as
              available.&quot; Except where these Terms expressly state otherwise, Telux disclaims all warranties,
              whether express, implied, or statutory, including implied warranties of merchantability, fitness
              for a particular purpose, title, quiet enjoyment, accuracy, and non-infringement.
            </p>
            <p className="mt-2 leading-relaxed">
              We do not warrant that the service will meet every business requirement, that integrations with
              third-party systems will always work, or that defects will be corrected on a specific schedule.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">16. Limitation of liability</h2>
            <p className="mt-2 leading-relaxed">
              To the maximum extent permitted by applicable law, Telux and its affiliates, directors,
              officers, employees, and contractors will not be liable for any indirect, incidental, special,
              consequential, exemplary, or punitive damages, or for loss of profits, revenues, goodwill,
              data, or business opportunities, arising out of or related to Zenzex or these Terms, even if we
              have been informed of the possibility of such damages.
            </p>
            <p className="mt-2 leading-relaxed">
              To the maximum extent permitted by applicable law, Telux&apos;s aggregate liability for all
              claims arising out of or relating to Zenzex or these Terms in any twelve-month period is
              limited to the greater of (a) the fees you paid Telux for Zenzex during that period or (b) one
              hundred United States dollars (USD 100) if you paid no fees during that period.
            </p>
            <p className="mt-2 leading-relaxed">
              Some jurisdictions do not allow certain exclusions or caps; in those cases Telux&apos;s liability is
              limited to the minimum extent permitted by the laws that apply to you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">17. Indemnity</h2>
            <p className="mt-2 leading-relaxed">
              You will defend, indemnify, and hold harmless Telux and its affiliates, officers, and employees
              from third-party claims, damages, losses, and reasonable legal fees arising from your Customer
              Data, your breach of these Terms, or your violation of law or third-party rights, except to the
              extent caused by Telux&apos;s willful misconduct or gross negligence.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              18. Suspension and termination
            </h2>
            <p className="mt-2 leading-relaxed">
              We may suspend or terminate your access if you materially breach these Terms, create a security
              or legal risk, fail to cure a payment issue after notice when reasonable, or if we must comply
              with law. We may discontinue Zenzex altogether with reasonable advance notice when feasible.
            </p>
            <p className="mt-2 leading-relaxed">
              When access ends, your license ends with it. Customer Data may be deleted or retained as
              described in the Privacy Policy and as permitted or required by applicable law. Where export
              tools exist, you are responsible for retrieving data you need before access lapses.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">19. Governing law and disputes</h2>
            <p className="mt-2 leading-relaxed">
              These Terms are governed by the laws of the jurisdiction where Telux Limited is established,
              without regard to conflict-of-law rules that would apply another jurisdiction&apos;s laws, subject to
              the following paragraph.
            </p>
            <p className="mt-2 leading-relaxed">
              Nothing in these Terms limits any non-waivable consumer or other rights that apply to you
              solely because of your country or region of residence. Except where mandatory law requires
              otherwise, you and Telux agree that the courts located in the same jurisdiction as Telux&apos;s
              establishment have exclusive jurisdiction over disputes arising out of or relating to these
              Terms or Zenzex.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">20. Changes to the Terms</h2>
            <p className="mt-2 leading-relaxed">
              We may update these Terms periodically. We will post the new version on this page and revise
              the &quot;Last updated&quot; date. For material changes we will provide reasonable notice (for example,
              by email or in-product message). If you disagree with an update, you should stop using Zenzex
              and cancel any paid plan before the effective date. Continued use after the effective date
              means you accept the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">21. General</h2>
            <p className="mt-2 leading-relaxed">
              If a provision is held unenforceable, the remainder stays in effect. You may not assign these
              Terms without Telux&apos;s consent; Telux may assign them in connection with a merger, financing, or
              sale of assets. Notices to you may be sent to the email associated with your account. These
              Terms, together with the Privacy Policy and Refund Policy where referenced, are the entire
              agreement about Zenzex and replace earlier understandings on the same subject.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">22. Contact</h2>
            <p className="mt-2 leading-relaxed">
              Legal notices and questions about these Terms:{' '}
              <a
                href="mailto:legal@zenzex.com"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                legal@zenzex.com
              </a>
              . Refund requests follow the process at{' '}
              <Link
                href="/refunds"
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                /refunds
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
