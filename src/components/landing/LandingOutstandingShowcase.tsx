'use client';

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

const CYCLE_MS = 5000;
const TRANSITION_MS = 500;

const DESKTOP_DEMO_INVOICES: {
  id: string;
  client: string;
  due: string;
  amount: string;
  status: 'paid' | 'overdue' | 'pending';
  withReminderButton?: boolean;
}[] = [
  { id: 'INV-2101', client: 'Apex Construction', due: 'May 1', amount: '$850.00', status: 'paid' },
  { id: 'INV-2102', client: 'Bright Studio', due: 'Apr 2', amount: '$1,100.00', status: 'overdue', withReminderButton: true },
  { id: 'INV-2103', client: 'Nova Digital', due: 'Apr 12', amount: '$620.00', status: 'pending' },
  { id: 'INV-2104', client: 'Urban Build Co.', due: 'Apr 18', amount: '$500.00', status: 'paid' },
  { id: 'INV-2105', client: 'Pixel Works', due: 'May 3', amount: '$410.00', status: 'pending' },
  { id: 'INV-2106', client: 'Northline Creative', due: 'Apr 28', amount: '$800.00', status: 'pending' },
];
// 6 static demo rows; sum matches Total outstanding in preview ($4,280.00)

function useMatchMedia(query: string, { defaultValue = false } = {}) {
  return useSyncExternalStore(
    (on) => {
      if (typeof window === 'undefined') {
        return () => {};
      }
      const m = window.matchMedia(query);
      m.addEventListener('change', on);
      return () => m.removeEventListener('change', on);
    },
    () => (typeof window === 'undefined' ? defaultValue : window.matchMedia(query).matches),
    () => defaultValue,
  );
}

function usePrefersReducedMotion() {
  return useMatchMedia('(prefers-reduced-motion: reduce)', { defaultValue: false });
}

function WindowChrome() {
  return (
    <div
      className="flex h-10 items-center gap-2 border-b border-slate-300/80 bg-slate-200 px-3.5 dark:border-slate-600 dark:bg-slate-700"
      aria-hidden
    >
      <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

function TotalOutstandingBlock({ size = 'default' }: { size?: 'default' | 'phone' }) {
  const isPhone = size === 'phone';
  return (
    <div
      className={cn(
        'mb-2 flex flex-col gap-1.5 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-1',
        isPhone && 'mb-2',
      )}
    >
      <div>
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400',
            isPhone && 'text-[10px]',
            !isPhone && 'sm:text-xs',
          )}
        >
          Total outstanding
        </p>
        <p
          className={cn(
            'text-xl font-bold tabular-nums text-slate-900 dark:text-white',
            isPhone && 'text-lg',
            !isPhone && 'sm:text-2xl',
          )}
        >
          $4,280.00
        </p>
      </div>
      <p
        className={cn('text-[11px] text-slate-500 dark:text-slate-400', isPhone && 'text-[10px]', !isPhone && 'sm:text-xs')}
      >
        Dashboard preview (sample data)
      </p>
    </div>
  );
}

function MobileInvoiceStack() {
  return (
    <div className="space-y-2 sm:space-y-2.5">
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-950/40 sm:p-3">
        <div className="flex items-start justify-between gap-2.5 sm:gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">INV-2101</p>
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Apex Construction</p>
            <p className="text-xs text-slate-500">Due May 1</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">$850.00</p>
            <span className="mt-1 inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">
              Paid
            </span>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 p-2.5 dark:border-amber-500/25 dark:bg-amber-500/10 sm:p-3">
        <div className="flex items-start justify-between gap-2.5 sm:gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">INV-2102</p>
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Bright Studio</p>
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Due Apr 2</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">$1,100.00</p>
            <span className="mt-1 inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-300">
              Overdue
            </span>
          </div>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className="mt-2.5 flex w-full min-h-[40px] cursor-default items-center justify-center rounded-md bg-indigo-600 text-sm font-semibold text-white sm:mt-3 sm:min-h-[44px] dark:bg-indigo-500"
        >
          Send Reminder
        </button>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-950/40 sm:p-3">
        <div className="flex items-start justify-between gap-2.5 sm:gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">INV-2103</p>
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">Nova Digital</p>
            <p className="text-xs text-slate-500">Due Apr 12</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">$620.00</p>
            <span className="mt-1 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              Pending
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

type DemoInvoice = (typeof DESKTOP_DEMO_INVOICES)[number];

function renderInvoiceStatusBadge(s: DemoInvoice['status']) {
  if (s === 'paid') {
    return (
      <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
        Paid
      </span>
    );
  }
  if (s === 'overdue') {
    return (
      <span className="inline-flex rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:text-amber-300">
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
      Pending
    </span>
  );
}

function DesktopTable() {
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-950/40">
      <table className="w-full min-w-[480px] text-left text-[13px] leading-snug">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
            <th className="px-3 py-2">Invoice</th>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2 text-right">Status</th>
            <th className="w-12 px-2 py-2 text-right"> </th>
          </tr>
        </thead>
        <tbody className="text-slate-700 dark:text-slate-300">
          {DESKTOP_DEMO_INVOICES.map((row, i) => {
            const n = DESKTOP_DEMO_INVOICES.length;
            return (
              <tr
                key={row.id}
                className={cn(
                  i < n - 1 && 'border-b border-slate-100 dark:border-slate-700/80',
                  row.status === 'overdue' && 'bg-amber-50/80 dark:bg-amber-500/10',
                )}
              >
                <td className="px-3 py-2 font-mono text-[0.7rem] text-slate-600 dark:text-slate-400">{row.id}</td>
                <td className="px-3 py-2">{row.client}</td>
                <td
                  className={cn(
                    'px-3 py-2',
                    row.status === 'overdue' && 'font-medium text-amber-800 dark:text-amber-200',
                    row.status !== 'overdue' && 'text-slate-500',
                  )}
                >
                  {row.due}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{row.amount}</td>
                <td className="px-3 py-2 text-right">{renderInvoiceStatusBadge(row.status)}</td>
                <td className="px-2 py-2 text-right">
                  {row.withReminderButton ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="inline-flex cursor-default rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm dark:bg-indigo-500"
                    >
                      Send Reminder
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--sidebar-border)] bg-[var(--card)] shadow-lg shadow-slate-900/[0.06] sm:rounded-xl dark:shadow-black/40">
      {children}
    </div>
  );
}

function CardBody({ variant = 'browser' }: { variant?: 'browser' | 'tablet' }) {
  return (
    <div
      className={cn(
        'bg-gradient-to-b from-slate-50 to-white p-3 sm:px-5 sm:py-4 dark:from-slate-900/80 dark:to-[var(--card)]',
        variant === 'browser' && 'border-t border-slate-200/50 dark:border-slate-600/50',
      )}
    >
      <TotalOutstandingBlock />
      <DesktopTable />
    </div>
  );
}

function CardBodyPhone() {
  return (
    <div className="w-full min-w-0 text-left">
      <TotalOutstandingBlock size="phone" />
      <MobileInvoiceStack />
    </div>
  );
}

function PhoneStatusIsland() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-2.5 z-20 h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
      aria-hidden
    />
  );
}

function PhoneStatusRow() {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between gap-2 border-b border-slate-200/50 px-4 pb-1.5 text-[0.7rem] font-semibold leading-none text-slate-900 tabular-nums dark:border-slate-600/30 dark:text-slate-100"
    >
      <span>9:41</span>
      <div className="flex min-w-0 items-center justify-end gap-0.5" aria-hidden>
        <span className="text-[0.4rem] leading-tight text-slate-500 dark:text-slate-500">●●●</span>
        <span className="inline-flex h-1.5 w-3.5 items-center justify-end rounded border border-slate-500/30 p-px pr-px dark:border-slate-500/30">
          <span className="h-1 w-[6px] max-w-full rounded-sm bg-slate-600/80 dark:bg-slate-500/80" />
        </span>
      </div>
    </div>
  );
}

function PhoneHomeIndicator() {
  return (
    <div
      className="mt-auto flex w-full shrink-0 justify-center pb-2.5 pt-0.5"
      aria-hidden
    >
      <div className="h-[5px] w-[100px] rounded-full bg-slate-900/25 dark:bg-slate-300/20" />
    </div>
  );
}

function IpadStatusBar() {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-200/90 bg-white/90 px-3 text-[0.7rem] font-semibold text-slate-800 tabular-nums dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-200">
      <span>9:41</span>
      <span className="text-[0.65rem] font-medium text-slate-500 dark:text-slate-400">Tue Apr 28</span>
      <div className="flex items-center gap-1" aria-hidden>
        <span className="text-[0.45rem] tracking-tight text-slate-400">●●●</span>
        <span className="inline-flex h-2 w-5 items-center justify-end rounded-sm border border-slate-400/50 p-px dark:border-slate-500/50">
          <span className="h-1 w-[40%] rounded-[1px] bg-slate-500 dark:bg-slate-400" />
        </span>
      </div>
    </div>
  );
}

/**
 * iPad Pro 11" class landscape (1194×834 pt). Silver shell, camera strip, glass screen.
 */
function IpadFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'mx-auto w-[min(700px,min(96vw,100%))] max-w-full shrink-0 [aspect-ratio:1194/834]',
        'min-w-0',
      )}
      aria-hidden
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[26px] bg-gradient-to-b from-zinc-200 via-zinc-300 to-zinc-400 p-2 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.55)] ring-1 ring-zinc-500/25 dark:from-zinc-700 dark:via-zinc-700 dark:to-zinc-800 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.5)] dark:ring-zinc-600/40">
        <div className="flex h-3 shrink-0 items-center justify-center" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600/80 shadow-inner dark:bg-zinc-900/80" />
        </div>
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[18px] border border-zinc-900/10 bg-zinc-900/25 p-[3px] dark:border-white/10 dark:bg-black/30">
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[14px] bg-gradient-to-b from-slate-50 to-white shadow-inner dark:from-slate-900 dark:to-slate-950">
            <IpadStatusBar />
            <div className="min-h-0 w-full flex-1 overflow-auto overscroll-contain [scrollbar-width:thin]">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * iPhone class proportions (390×844). Width is tuned so total device height ≈ 6-row desktop card
 * (no aspect distortion). Height is always from aspect ratio.
 */
function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'mx-auto w-[min(236px,min(78vw,100%))] max-w-full shrink-0 [aspect-ratio:390/844]',
        'min-w-0',
      )}
      aria-hidden
    >
      <div className="flex h-full w-full max-w-full flex-col overflow-hidden rounded-[48px] bg-zinc-950 p-2.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.45),0_8px_20px_rgba(0,0,0,0.25)] ring-1 ring-zinc-800/50">
        <div
          className={cn(
            'relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-[34px] border border-white/10',
            'bg-gradient-to-b from-slate-50 to-white',
            'dark:from-slate-900/95 dark:to-slate-950/98 dark:border-white/5',
          )}
        >
          <div className="relative h-[2.75rem] shrink-0" aria-hidden>
            <PhoneStatusIsland />
            <PhoneStatusRow />
          </div>
          <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3.5 pb-2 pt-2 [scrollbar-gutter:stable] [scrollbar-width:thin]">
            {children}
          </div>
          <PhoneHomeIndicator />
        </div>
      </div>
    </div>
  );
}

const transitionLayer = (active: boolean) =>
  cn(
    'ease-out will-change-[opacity,transform] motion-reduce:transform-none',
    'transition-[opacity,transform] [transition-duration:var(--t,500ms)]',
    active
      ? 'z-[2] translate-y-0 scale-100 opacity-100'
      : 'pointer-events-none z-0 translate-y-1.5 scale-[0.98] opacity-0',
  );

type ShowcaseView = 'desktop' | 'ipad' | 'phone';

function nextShowcaseView(v: ShowcaseView): ShowcaseView {
  if (v === 'desktop') return 'ipad';
  if (v === 'ipad') return 'phone';
  return 'desktop';
}

function StaticNarrow() {
  return (
    <CardShell>
      <WindowChrome />
      <div className="border-t border-slate-200/50 bg-gradient-to-b from-slate-50 to-white p-3 sm:p-6 dark:border-slate-600/50 dark:from-slate-900/80 dark:to-[var(--card)]">
        <TotalOutstandingBlock />
        <MobileInvoiceStack />
      </div>
    </CardShell>
  );
}

function StaticDesktop() {
  return (
    <CardShell>
      <WindowChrome />
      <CardBody />
    </CardShell>
  );
}

function DesktopShowcaseLoop() {
  const reduceMotion = usePrefersReducedMotion();
  const isMdUp = useMatchMedia('(min-width: 768px)', { defaultValue: false });
  const [view, setView] = useState<ShowcaseView>('desktop');
  const [hoverPause, setHoverPause] = useState(false);

  const canAnimate = !reduceMotion;

  useEffect(() => {
    if (!canAnimate || hoverPause || !isMdUp) {
      return;
    }
    const id = setInterval(() => {
      setView((v) => nextShowcaseView(v));
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [canAnimate, hoverPause, isMdUp]);

  useEffect(() => {
    if (!canAnimate || !isMdUp) {
      setView('desktop');
    }
  }, [canAnimate, isMdUp]);

  if (!canAnimate) {
    return <StaticDesktop />;
  }

  return (
    <div
      onPointerEnter={() => setHoverPause(true)}
      onPointerLeave={() => setHoverPause(false)}
      className="relative w-full max-w-full overflow-x-clip [contain:layout]"
    >
      <p className="sr-only">
        A preview of the same dashboard, cycling between a desktop browser, an iPad, and an iPhone. The animation
        pauses when you point at it. On small screens or with reduced motion, a static view is used instead.
      </p>
      <div
        className="relative mx-auto w-full min-h-[min(34.5rem,92svh)]"
        role="presentation"
        style={{ ['--t' as string]: `${TRANSITION_MS}ms` } as CSSProperties}
      >
        <div
          className={cn(
            'absolute inset-0 flex min-h-[min(34.5rem,92svh)] w-full items-center justify-center p-0',
            transitionLayer(view === 'desktop'),
          )}
        >
          <div className="w-full max-w-4xl">
            <StaticDesktop />
          </div>
        </div>
        <div
          className={cn(
            'absolute inset-0 flex min-h-[min(34.5rem,92svh)] w-full items-center justify-center px-1 py-2 sm:px-2',
            transitionLayer(view === 'ipad'),
          )}
        >
          <IpadFrame>
            <CardBody variant="tablet" />
          </IpadFrame>
        </div>
        <div
          className={cn(
            'absolute inset-0 flex min-h-[min(34.5rem,92svh)] w-full items-center justify-center p-1 sm:p-2',
            transitionLayer(view === 'phone'),
          )}
        >
          <PhoneFrame>
            <CardBodyPhone />
          </PhoneFrame>
        </div>
      </div>
    </div>
  );
}

export function LandingOutstandingShowcase() {
  return (
    <>
      <div className="md:hidden" aria-label="Sample dashboard, mobile view">
        <StaticNarrow />
      </div>
      <div className="hidden md:block">
        <DesktopShowcaseLoop />
      </div>
    </>
  );
}
