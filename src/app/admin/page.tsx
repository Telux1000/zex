import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { ADMIN_NAV } from '@/lib/admin/nav-config';
import { AdminContentCard } from '@/components/admin/AdminContentCard';

export default function AdminPage() {
  const links = ADMIN_NAV.filter((n) => n.href !== '/admin');

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <LayoutDashboard className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Operations console</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Subscriber accounts, billing, and support — separated from tenant workspace data. Sensitive actions are
            audited.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex gap-3 rounded-lg border border-zinc-200/90 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{item.label}</p>
                <p className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-500">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <AdminContentCard>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Scope</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This console is for Zenzex platform operations. It does not replace subscriber dashboards or invoice customer
          management inside workspaces.
        </p>
      </AdminContentCard>
    </div>
  );
}
