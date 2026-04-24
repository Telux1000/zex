import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

const COPY: Record<string, { title: string; body: string }> = {
  account_suspended: {
    title: 'Account temporarily unavailable',
    body: 'This workspace has been suspended by Zenzex. Your data is preserved. If you believe this is an error, contact support.',
  },
  account_deactivated: {
    title: 'Account deactivated',
    body: 'This workspace has been deactivated by Zenzex. Your data is preserved for audit and support. Contact us if you need help.',
  },
  user_suspended: {
    title: 'Access temporarily restricted',
    body: 'Your access to this product has been suspended by Zenzex. Contact your administrator or support.',
  },
  user_deactivated: {
    title: 'Access disabled',
    body: 'Your access has been disabled by Zenzex. Contact support if you need assistance.',
  },
  system_emergency_lockdown: {
    title: 'Temporarily restricted access',
    body: 'We’ve temporarily restricted access while we address a critical issue. Please try again later.',
  },
};

export default function AccountUnavailablePage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const key = searchParams.reason ?? 'account_suspended';
  const text = COPY[key] ?? COPY.account_suspended;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-12">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{text.title}</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{text.body}</p>
      <Link
        href="/login"
        className="mt-8 inline-flex w-fit rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Back to sign in
      </Link>
    </div>
  );
}
