'use client';

import type { SetupProgress } from '@/lib/onboarding/setup-progress';

const labels = ['Profile', 'Business', 'Currency'] as const;

export function SetupProgressMini({ progress }: { progress: SetupProgress }) {
  const done = [
    progress.profileComplete,
    progress.businessProfileComplete,
    progress.currencyComplete,
  ];
  return (
    <div className="border-t border-[var(--card-border)] px-3 py-3" role="status" aria-label="Setup progress">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Setup progress
      </p>
      <ul className="flex gap-1.5">
        {labels.map((label, i) => (
          <li key={label} className="min-w-0 flex-1">
            <span
              className={`block h-1.5 rounded-full ${
                done[i] ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-amber-300 dark:bg-amber-600/80'
              }`}
              title={`${label}: ${done[i] ? 'done' : 'to do'}`}
            />
            <span className="mt-1 block truncate text-center text-[10px] font-medium text-slate-500 dark:text-slate-400">
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
