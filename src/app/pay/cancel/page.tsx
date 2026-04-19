import Link from 'next/link';

export default function PayCancelPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          Payment cancelled
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          You can complete the payment later using the link from your invoice.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-zenzex-600 hover:underline"
        >
          Back to Zenzex
        </Link>
      </div>
    </div>
  );
}
