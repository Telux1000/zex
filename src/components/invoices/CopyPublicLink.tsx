'use client';

import { useState } from 'react';
import Link from 'next/link';

export function CopyPublicLink({ invoiceId }: { invoiceId: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/i/${invoiceId}`
      : `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/i/${invoiceId}`;

  async function copyToClipboard() {
    const fullUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/i/${invoiceId}`
        : url;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: open in new tab so user can copy from address bar
      window.open(fullUrl, '_blank');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/i/${invoiceId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-zenzex-600 hover:underline"
      >
        View as client
      </Link>
      <span className="text-slate-400">·</span>
      <button
        type="button"
        onClick={copyToClipboard}
        className="text-sm text-slate-600 hover:text-zenzex-600 dark:text-slate-400 dark:hover:text-zenzex-400"
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}
