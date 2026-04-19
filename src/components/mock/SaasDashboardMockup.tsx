'use client';

import {
  Activity,
  Bell,
  ChevronDown,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Search,
  Settings,
  Sparkles,
  Star,
  Users,
  Wallet,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Customers', icon: Users, active: false },
  { label: 'Quotes', icon: FileText, active: false },
  { label: 'Invoices', icon: Receipt, active: false },
  { label: 'AI Insights', icon: Sparkles, active: false },
  { label: 'Activity', icon: Activity, active: false },
  { label: 'Expenses', icon: Wallet, active: false },
  { label: 'Settings', icon: Settings, active: false },
] as const;

function RevenueLineChart() {
  const w = 520;
  const h = 220;
  const pad = { t: 24, r: 16, b: 32, l: 48 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const revenuePts = [0.12, 0.35, 0.28, 0.55, 0.48, 0.72, 0.65, 0.88, 0.82, 0.95];
  const paymentsPts = [0.22, 0.25, 0.42, 0.38, 0.52, 0.58, 0.55, 0.68, 0.75, 0.78];

  const toPath = (values: number[]) => {
    const n = values.length;
    const step = innerW / (n - 1);
    const pts = values.map((v, i) => ({
      x: pad.l + i * step,
      y: pad.t + innerH * (1 - v),
    }));
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-full w-full max-h-[240px] text-neutral-400"
      aria-hidden
    >
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = pad.t + innerH * t;
        return (
          <line
            key={t}
            x1={pad.l}
            y1={y}
            x2={w - pad.r}
            y2={y}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="4 6"
            opacity={0.35}
          />
        );
      })}
      <path
        d={toPath(revenuePts)}
        fill="none"
        stroke="#737373"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={toPath(paymentsPts)}
        fill="none"
        stroke="#a3a3a3"
        strokeWidth={2}
        strokeDasharray="6 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x={pad.l} y={h - 8} className="fill-neutral-400 text-[10px]">
        Jan
      </text>
      <text x={w / 2 - 12} y={h - 8} className="fill-neutral-400 text-[10px]">
        Jun
      </text>
      <text x={w - pad.r - 20} y={h - 8} className="fill-neutral-400 text-[10px]">
        Dec
      </text>
    </svg>
  );
}

export function SaasDashboardMockup() {
  return (
    <div className="min-h-screen bg-neutral-200/80 p-6 text-neutral-700 antialiased">
      <div className="mx-auto flex h-[min(1024px,calc(100vh-3rem))] w-full max-w-[1440px] overflow-hidden rounded-xl border border-neutral-300/80 bg-neutral-100 shadow-sm">
        {/* Sidebar */}
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-neutral-300 bg-neutral-50">
          <div className="flex h-16 items-center border-b border-neutral-200 px-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-500">
              Logo
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 p-3">
            {navItems.map(({ label, icon: Icon, active }) => (
              <button
                key={label}
                type="button"
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? 'border border-neutral-300 bg-white text-neutral-900 shadow-[0_1px_0_rgba(0,0,0,0.04)]'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                    active
                      ? 'border-neutral-300 bg-neutral-100 text-neutral-700'
                      : 'border-neutral-200 bg-white text-neutral-500'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                {label}
              </button>
            ))}
          </nav>
          <div className="p-3 pt-0">
            <div className="rounded-xl border border-neutral-300 bg-white p-4">
              <p className="text-sm font-semibold text-neutral-800">Upgrade Plan</p>
              <p className="mt-1 text-xs text-neutral-500">Go Premium</p>
              <button
                type="button"
                className="mt-3 w-full rounded-lg border border-neutral-300 bg-neutral-50 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                View plans
              </button>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col bg-neutral-100">
          {/* Top bar */}
          <header className="flex h-16 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white/90 px-6 backdrop-blur-sm">
            <div className="relative min-w-0 flex-1 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                readOnly
                placeholder="Search invoices, customers..."
                className="h-10 w-full rounded-lg border border-neutral-300 bg-neutral-50 pl-10 pr-4 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300"
              />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-neutral-500 hover:border-neutral-200 hover:bg-neutral-50"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-neutral-500 hover:border-neutral-200 hover:bg-neutral-50"
                aria-label="Messages"
              >
                <MessageSquare className="h-5 w-5" strokeWidth={1.5} />
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-neutral-300 bg-neutral-200 px-1 text-[10px] font-semibold text-neutral-700">
                  3
                </span>
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-neutral-500 hover:border-neutral-200 hover:bg-neutral-50"
                aria-label="Activity"
              >
                <Activity className="h-5 w-5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-neutral-500 hover:border-neutral-200 hover:bg-neutral-50"
                aria-label="Profile"
              >
                <Users className="h-5 w-5" strokeWidth={1.5} />
              </button>
              <div
                className="ml-2 h-9 w-9 shrink-0 rounded-full border-2 border-neutral-300 bg-gradient-to-br from-neutral-200 to-neutral-300"
                aria-hidden
              />
            </div>
          </header>

          <main className="flex-1 overflow-auto p-6">
            {/* Main header row */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                  Welcome back, User 👋
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                  Here is your business overview today.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 shadow-[0_1px_0_rgba(0,0,0,0.03)] hover:bg-neutral-50"
              >
                This Month
                <ChevronDown className="h-4 w-4 text-neutral-500" />
              </button>
            </div>

            {/* Stats */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { title: 'Total Revenue', value: '$00,000', sub: null },
                { title: 'Outstanding Invoices', value: '$00,000', sub: '5 Pending' },
                { title: 'Overdue Payments', value: '$00,000', sub: '3 Overdue' },
                { title: 'Cash Flow Forecast', value: '$00,000', sub: 'Next 7 Days' },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-neutral-300 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {card.title}
                  </p>
                  <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">
                    {card.value}
                  </p>
                  {card.sub ? (
                    <p className="mt-2 text-xs text-neutral-500">{card.sub}</p>
                  ) : (
                    <div className="mt-2 h-4" />
                  )}
                </div>
              ))}
            </div>

            {/* Middle row */}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-neutral-300 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)] lg:col-span-2">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-neutral-900">Revenue Overview</h2>
                  <div className="flex items-center gap-4 text-xs text-neutral-500">
                    <span className="flex items-center gap-2">
                      <span className="h-0.5 w-6 rounded-full bg-neutral-600" />
                      Revenue
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-0.5 w-6 rounded-full border border-dashed border-neutral-400 bg-transparent" />
                      Payments
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 p-4">
                  <RevenueLineChart />
                </div>
              </div>
              <div className="rounded-xl border border-neutral-300 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50">
                    <Star className="h-4 w-4 text-neutral-500" strokeWidth={1.75} />
                  </span>
                  <h2 className="text-sm font-semibold text-neutral-900">AI Insights</h2>
                </div>
                <p className="text-sm leading-relaxed text-neutral-600">
                  Insight goes here with some brief description.
                </p>
                <div className="mt-4 space-y-2">
                  <div className="h-2 rounded-full bg-neutral-200" />
                  <div className="h-2 w-4/5 rounded-full bg-neutral-100" />
                  <div className="h-2 w-3/5 rounded-full bg-neutral-100" />
                </div>
              </div>
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-neutral-300 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)] lg:col-span-2">
                <h2 className="mb-4 text-sm font-semibold text-neutral-900">Recent Invoices</h2>
                <div className="overflow-hidden rounded-lg border border-neutral-200">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50/90">
                        <th className="px-4 py-3 font-medium text-neutral-600">Invoice / Customer</th>
                        <th className="px-4 py-3 font-medium text-neutral-600">Date</th>
                        <th className="px-4 py-3 font-medium text-neutral-600">Amount</th>
                        <th className="px-4 py-3 font-medium text-neutral-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 bg-white">
                      {[
                        ['INV-001 · Acme Co.', 'Mar 12, 2026', '$1,240.00', 'Paid'],
                        ['INV-002 · Northwind', 'Mar 11, 2026', '$890.50', 'Pending'],
                        ['INV-003 · Globex LLC', 'Mar 10, 2026', '$2,100.00', 'Overdue'],
                      ].map(([inv, date, amt, status]) => (
                        <tr key={inv} className="hover:bg-neutral-50/80">
                          <td className="px-4 py-3 text-neutral-800">{inv}</td>
                          <td className="px-4 py-3 text-neutral-500">{date}</td>
                          <td className="px-4 py-3 font-medium tabular-nums text-neutral-800">{amt}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                                status === 'Paid'
                                  ? 'border-neutral-300 bg-neutral-100 text-neutral-700'
                                  : status === 'Pending'
                                    ? 'border-neutral-200 bg-white text-neutral-600'
                                    : 'border-neutral-400 bg-neutral-200 text-neutral-800'
                              }`}
                            >
                              {status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-300 bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
                <h2 className="mb-4 text-sm font-semibold text-neutral-900">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Create Invoice', icon: Receipt },
                    { label: 'Create Quote', icon: FileText },
                    { label: 'Add Customer', icon: Users },
                    { label: 'Record Expenses', icon: CreditCard },
                  ].map(({ label, icon: Icon }) => (
                    <button
                      key={label}
                      type="button"
                      className="flex flex-col items-start gap-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-3 text-left text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-white"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
                <hr className="my-5 border-neutral-200" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Today&apos;s Tasks
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-neutral-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
                    Task 1
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
                    Task 2
                  </li>
                </ul>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default SaasDashboardMockup;
