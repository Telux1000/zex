import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasPermission } from '@/lib/rbac/permissions';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { canEdit } from '@/lib/invoices/edit-rules';
import { InvoiceEditForm } from '@/components/invoices/InvoiceEditForm';

export default async function InvoiceEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ duplicated?: string }>;
}) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const isDuplicated = resolvedSearch?.duplicated === '1';
  const { data: row } = await supabase
    .from('invoices')
    .select(`
      *,
      invoice_items(*),
      businesses(id, name, currency, logo_url, address_line1, address_line2, city, state, postal_code, country, tax_id, payment_settings, invoice_settings, stripe_charges_enabled)
    `)
    .eq('id', id)
    .single();

  if (!row) notFound();

  const business = row.businesses as {
    id: string;
    name: string;
    currency: string;
    logo_url?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    tax_id?: string | null;
    payment_settings?: Record<string, unknown> | null;
    stripe_charges_enabled?: boolean;
  } | null;
  if (!business) notFound();

  const role = await getEffectiveBusinessRole(supabase, business.id, user.id);
  if (!role || !hasPermission(role, 'edit_invoice')) notFound();

  if (!canEdit(row.status)) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Cannot edit this invoice</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          {row.status === 'paid'
            ? 'Paid invoices cannot be edited directly. Use a credit note to make adjustments.'
            : 'Voided invoices cannot be edited.'}
        </p>
        <Link
          href={`/dashboard/invoices/${id}`}
          className="mt-4 inline-block text-zenzex-600 hover:underline"
        >
          ← Back to invoice
        </Link>
      </div>
    );
  }

  const items = (row.invoice_items ?? []) as {
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    amount: number;
    tax_percent?: number;
    unit_label?: string | null;
    assignee?: string | null;
  }[];

  const metadata = (row.metadata as {
    contact_person?: string | null;
    company?: string | null;
    billing_phone?: string | null;
    billing_address?: string | null;
    billing_city?: string | null;
    billing_state?: string | null;
    billing_postal_code?: string | null;
    billing_country?: string | null;
    delivery_company?: string | null;
    delivery_email?: string | null;
    delivery_contact_person?: string | null;
    delivery_phone?: string | null;
    delivery_address?: string | null;
    delivery_city?: string | null;
    delivery_state?: string | null;
    delivery_postal_code?: string | null;
    delivery_country?: string | null;
  } | null) ?? null;

  const { data: scheduleRows } = await supabase
    .from('invoice_payment_schedule_items')
    .select('id, description, amount, due_date, status')
    .eq('invoice_id', row.id)
    .order('due_date', { ascending: true });

  const invoiceTotal = Number(row.total) || 0;

  const initialData = {
    invoice: {
      id: row.id,
      status: row.status,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      customer_email: row.customer_email ?? null,
      issue_date: row.issue_date,
      due_date: row.due_date,
      use_payment_schedule: row.use_payment_schedule ?? false,
      amount_paid: row.amount_paid != null ? Number(row.amount_paid) : 0,
      balance_due: row.balance_due != null ? Number(row.balance_due) : Number(row.total),
      reference_po: row.reference_po ?? null,
      notes: row.notes ?? null,
      terms: row.terms ?? null,
      discount_amount: row.discount_amount != null ? Number(row.discount_amount) : 0,
      tax_amount: Number(row.tax_amount),
      subtotal: Number(row.subtotal),
      total: Number(row.total),
      currency: (row as { currency?: string }).currency ?? business.currency,
      base_currency_code:
        (row as { base_currency_code?: string }).base_currency_code ?? business.currency,
      exchange_rate_to_base:
        (row as { exchange_rate_to_base?: number }).exchange_rate_to_base != null
          ? Number((row as { exchange_rate_to_base?: number }).exchange_rate_to_base)
          : 1,
      subtotal_in_base:
        (row as { subtotal_in_base?: number }).subtotal_in_base != null
          ? Number((row as { subtotal_in_base?: number }).subtotal_in_base)
          : null,
      tax_amount_in_base:
        (row as { tax_amount_in_base?: number }).tax_amount_in_base != null
          ? Number((row as { tax_amount_in_base?: number }).tax_amount_in_base)
          : null,
      total_in_base:
        (row as { total_in_base?: number }).total_in_base != null
          ? Number((row as { total_in_base?: number }).total_in_base)
          : null,
      metadata,
      show_time_summary: !!(row as { show_time_summary?: boolean }).show_time_summary,
      template_id: (row as { template_id?: string | null }).template_id ?? null,
    },
    items: items.map((i) => ({
      name: i.name,
      description: i.description ?? null,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      tax_percent: i.tax_percent != null ? Number(i.tax_percent) : 0,
      unit_label: i.unit_label ?? 'item',
      assignee: i.assignee ?? null,
    })),
    payment_schedule: (scheduleRows ?? []).map((r) => {
      const amount = Number(r.amount ?? 0);
      return {
        id: r.id,
        description: r.description ?? '',
        percentage:
          invoiceTotal > 0 ? Math.round((amount / invoiceTotal) * 10000) / 100 : 0,
        amount,
        due_date: String(r.due_date),
        status: r.status as 'pending' | 'paid',
      };
    }),
    business: {
      id: business.id,
      name: business.name,
      currency: business.currency,
      logo_url: business.logo_url ?? null,
      address_line1: business.address_line1 ?? null,
      address_line2: business.address_line2 ?? null,
      city: business.city ?? null,
      state: business.state ?? null,
      postal_code: business.postal_code ?? null,
      country: business.country ?? null,
      tax_id: business.tax_id ?? null,
      payment_settings: business.payment_settings ?? null,
      stripe_charges_enabled: business.stripe_charges_enabled ?? false,
    },
  };

  return (
    <div className="mx-auto max-w-7xl">
      {isDuplicated && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
          Invoice duplicated successfully
        </div>
      )}
      <InvoiceEditForm invoiceId={id} initialData={initialData} invoiceNumber={row.invoice_number ?? null} />
    </div>
  );
}
