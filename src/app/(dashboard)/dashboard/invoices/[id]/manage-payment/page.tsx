import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasPermission } from '@/lib/rbac/permissions';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { ManagePaymentWorkspace } from '@/components/invoices/ManagePaymentWorkspace';

export default async function ManagePaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const { id } = await params;
  const { data: row } = await supabase
    .from('invoices')
    .select(
      `
      *,
      invoice_items(*),
      businesses(
        id,
        name,
        currency,
        logo_url,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        tax_id,
        payment_settings,
        stripe_charges_enabled
      )
    `
    )
    .eq('id', id)
    .single();

  if (!row) notFound();

  const business = row.businesses as {
    id: string;
    name: string;
    currency: string;
    logo_url?: string;
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
  if (!role || !hasPermission(role, 'manage_payments')) notFound();

  const items = (row.invoice_items ?? []) as {
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    unit_label?: string | null;
    amount: number;
    tax_percent?: number;
  }[];

  const savedBusiness = {
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
    payment_settings: (business.payment_settings as unknown) ?? null,
    stripe_charges_enabled: business.stripe_charges_enabled ?? false,
  };

  const savedInvoice = {
    invoice_number: row.invoice_number,
    reference_po: row.reference_po ?? null,
    issue_date: row.issue_date ?? '',
    due_date: row.due_date ?? '',
    paid_at: (row as { paid_at?: string | null }).paid_at ?? null,
    status: row.status,
    customer_name: row.customer_name,
    customer_email: row.customer_email ?? null,
    sourceQuoteId: (row as { source_quote_id?: string | null }).source_quote_id ?? null,
    sourceQuoteNumber: (row as { source_quote_number?: string | null }).source_quote_number ?? null,
    convertedFromQuote: (row as { converted_from_quote?: boolean | null }).converted_from_quote ?? false,
    convertedAt: (row as { converted_at?: string | null }).converted_at ?? null,
    subtotal: Number(row.subtotal),
    tax_amount: Number(row.tax_amount),
    total: Number(row.total),
    amount_paid: row.amount_paid != null ? Number(row.amount_paid) : 0,
    balance_due:
      row.balance_due != null
        ? Number(row.balance_due)
        : Math.max(0, Number(row.total) - Number(row.amount_paid ?? 0)),
    discount_amount: row.discount_amount != null ? Number(row.discount_amount) : 0,
    notes: row.notes ?? null,
    terms: row.terms ?? null,
    metadata:
      (row.metadata as {
        contact_person?: string;
        company?: string;
        billing_address?: string;
        billing_city?: string;
        billing_state?: string;
        billing_postal_code?: string;
        billing_country?: string;
        billing_phone?: string;
        use_delivery_address?: boolean | null;
        delivery_company?: string | null;
        delivery_contact_person?: string | null;
        delivery_email?: string | null;
        delivery_phone?: string | null;
        delivery_address?: string | null;
        delivery_city?: string | null;
        delivery_state?: string | null;
        delivery_postal_code?: string | null;
        delivery_country?: string | null;
      } | null) ?? null,
  };

  const savedItems = items.map((i) => ({
    name: i.name,
    description: i.description ?? null,
    quantity: i.quantity,
    unit_price: Number(i.unit_price),
    unit_label: i.unit_label ?? 'item',
    amount: Number(i.amount),
    tax_percent: i.tax_percent != null ? Number(i.tax_percent) : 0,
  }));

  const { data: scheduleRows } = await supabase
    .from('invoice_payment_schedule_items')
    .select('id, description, amount, due_date, status, paid_at, created_at')
    .eq('invoice_id', row.id)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true });

  const invoiceTotalForSchedule = Number(row.total) || 0;

  const editInitialData = {
    invoice: {
      id: row.id,
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
      metadata: savedInvoice.metadata,
      paymentSchedule: (scheduleRows ?? []).map((r) => {
        const amount = Number(r.amount ?? 0);
        return {
          id: r.id,
          description: r.description ?? '',
          percentage:
            invoiceTotalForSchedule > 0
              ? Math.round((amount / invoiceTotalForSchedule) * 10000) / 100
              : 0,
          amount,
          due_date: String(r.due_date),
          status: r.status as 'pending' | 'paid',
          paid_at: r.paid_at ? String(r.paid_at) : null,
        };
      }),
    },
    items: items.map((i) => ({
      name: i.name,
      description: i.description ?? null,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      unit_label: i.unit_label ?? 'item',
      tax_percent: i.tax_percent != null ? Number(i.tax_percent) : 0,
    })),
    payment_schedule: (scheduleRows ?? []).map((r) => {
      const amount = Number(r.amount ?? 0);
      return {
        id: r.id,
        description: r.description ?? '',
        percentage:
          invoiceTotalForSchedule > 0
            ? Math.round((amount / invoiceTotalForSchedule) * 10000) / 100
            : 0,
        amount,
        due_date: String(r.due_date),
        status: r.status as 'pending' | 'paid',
        paid_at: r.paid_at ? String(r.paid_at) : null,
      };
    }),
    business: {
      id: business.id,
      name: business.name,
      currency: business.currency,
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
      <div className="mb-6">
        <Link href={`/dashboard/invoices/${id}`} className="text-sm text-slate-500 hover:text-zenzex-600">
          ← Back to invoice
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
          Manage Payment · {row.invoice_number}
        </h1>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          Invoice preview and payment operations.
        </p>
      </div>
      <ManagePaymentWorkspace
        invoiceId={row.id}
        invoiceNumber={row.invoice_number}
        status={row.status}
        usePaymentSchedule={Boolean(row.use_payment_schedule)}
        amountPaid={Number(row.amount_paid ?? 0)}
        scheduleRows={(scheduleRows ?? []).map((r) => ({
          id: String(r.id),
          description: String(r.description ?? ''),
          amount: Number(r.amount ?? 0),
          due_date: String(r.due_date ?? ''),
          status: (r.status as 'pending' | 'paid') ?? 'pending',
          paid_at: r.paid_at ? String(r.paid_at) : null,
        }))}
        previewData={{
          business: savedBusiness,
          invoice: {
            ...savedInvoice,
            payment_schedule: (scheduleRows ?? []).map((r) => ({
              id: String(r.id),
              description: String(r.description ?? ''),
              amount: Number(r.amount ?? 0),
              due_date: String(r.due_date ?? '').slice(0, 10),
              status: r.status === 'paid' ? ('paid' as const) : ('pending' as const),
              paid_at: r.paid_at ? String(r.paid_at) : null,
            })),
          },
          items: savedItems,
        }}
        editInitialData={editInitialData}
      />
    </div>
  );
}

