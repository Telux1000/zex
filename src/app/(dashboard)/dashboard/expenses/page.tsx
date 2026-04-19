import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import ExpensesTable from '@/components/expenses/ExpensesTable';
import type { ExpenseRow } from '@/components/expenses/ExpenseFormModal';

export default async function ExpensesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const business = await getPrimaryBusinessForUser(user.id);

  if (!business?.id) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-400">Set up your business first.</p>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from('expenses')
    .select(
      'id, business_id, expense_date, description, category, amount, attachment_url, attachment_name, attachment_type, attachment_size, notes'
    )
    .eq('business_id', business.id)
    .order('expense_date', { ascending: false });

  const initialExpenses = (rows ?? []) as ExpenseRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Expenses</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Track business spending by date, category, and amount.
        </p>
      </div>

      <ExpensesTable
        businessId={business.id}
        currency={business.currency ?? 'USD'}
        initialExpenses={initialExpenses}
      />
    </div>
  );
}
