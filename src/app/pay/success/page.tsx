import Link from 'next/link';

export default function PaySuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zenzex-100 dark:bg-zenzex-900/50">
          <svg
            className="h-6 w-6 text-zenzex-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">
          Payment successful
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Thank you for your payment. The invoice has been marked as paid.
        </p>
        <p className="mt-6 text-sm font-medium text-slate-700 dark:text-slate-300">
          Run your business with AI
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Zenzex lets you create invoices by chat, voice, or screenshot. Try it free.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-block w-full rounded-lg bg-zenzex-600 py-2.5 font-medium text-white hover:bg-zenzex-700"
        >
          Get Zenzex free
        </Link>
      </div>
    </div>
  );
}
