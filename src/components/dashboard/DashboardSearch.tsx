'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Search } from 'lucide-react';

export function DashboardSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/dashboard/invoices?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative min-w-0 flex-1 sm:max-w-xl"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:left-3" />
      <input
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Search invoices, customers..."
        className="h-10 w-full min-w-0 rounded-lg border border-[var(--card-border)] bg-[var(--sidebar)] py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] sm:pl-10 sm:pr-4 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </form>
  );
}
