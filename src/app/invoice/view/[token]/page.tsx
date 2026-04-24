import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase/server';
import { formatDisplayDate } from '@/lib/utils/date';
import { PublicInvoicePayButton } from '@/components/invoices/PublicInvoicePayButton';
import { MarkViewed } from '@/components/invoices/MarkViewed';
import { InvoicePaymentMethods } from '@/components/invoices/InvoicePaymentMethods';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { formatMoneyCodeFirst } from '@/lib/utils/currency';
import { findInvoiceByPublicToken } from '@/lib/invoices/public-token';
import { PublicInvoiceBillToBlock } from '@/components/invoices/PublicInvoiceBillToBlock';
import { ForcePublicDocumentLight } from '@/components/public/ForcePublicDocumentLight';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PublicInvoiceTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createServiceClient();
  let resolved;
  try {
    resolved = await findInvoiceByPublicToken(supabase as any, token);
  } catch {
    return (
      <>
        <ForcePublicDocumentLight />
        <div className="min-h-screen bg-white text-slate-900">
          <div className="mx-auto max-w-xl px-4 py-20">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
              <p className="mt-2 text-sm text-slate-600">Could not load this invoice. Please try again later.</p>
            </div>
          </div>
        </div>
      </>
    );
  }
  if (!resolved || !resolved.invoices) {
    return (
      <>
        <ForcePublicDocumentLight />
        <div className="min-h-screen bg-white text-slate-900">
          <div className="mx-auto max-w-xl px-4 py-20">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <h1 className="text-2xl font-semibold text-slate-900">Invoice not found</h1>
              <p className="mt-2 text-sm text-slate-600">
                This link is invalid or the invoice is no longer available.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }
  if (resolved.linkExpired) {
    return (
      <>
        <ForcePublicDocumentLight />
        <div className="min-h-screen bg-white text-slate-900">
          <div className="mx-auto max-w-xl px-4 py-20">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <h1 className="text-2xl font-semibold text-slate-900">This link has expired</h1>
              <p className="mt-2 text-sm text-slate-600">
                Please request a new invoice link from the sender.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const invoice = resolved.invoices as any;
  if (!invoice) {
    return (
      <>
        <ForcePublicDocumentLight />
        <div className="min-h-screen bg-white text-slate-900">
          <div className="mx-auto max-w-xl px-4 py-20">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <h1 className="text-2xl font-semibold text-slate-900">Invoice not found</h1>
              <p className="mt-2 text-sm text-slate-600">
                This link is invalid or the invoice is no longer available.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }
  const id = String(invoice.id);

  const [itemsRes, businessRes, themeRes] = await Promise.all([
    supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .order('sort_order'),
    supabase
      .from('businesses')
      .select('id, name, logo_url, currency, address_line1, city, state, postal_code, country, payment_settings, stripe_charges_enabled')
      .eq('id', invoice.business_id)
      .single(),
    invoice.theme_id
      ? supabase.from('invoice_themes').select('*').eq('id', invoice.theme_id).single()
      : supabase
          .from('invoice_themes')
          .select('*')
          .eq('business_id', invoice.business_id)
          .eq('is_default', true)
          .maybeSingle(),
  ]);

  const items = (itemsRes.data ?? []) as {
    name: string;
    quantity: number;
    unit_price: number;
    amount: number;
    description?: string | null;
  }[];
  const business = businessRes.data as {
    name: string;
    logo_url?: string | null;
    currency: string;
    address_line1?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    payment_settings?: Record<string, unknown> | null;
    stripe_charges_enabled?: boolean;
  } | null;
  const theme = themeRes.data as {
    primary_color?: string;
    template?: string;
    font_family?: string;
  } | null;

  const primaryColor = theme?.primary_color ?? '#16a34a';
  const invCurrency = String((invoice as { currency?: string }).currency ?? business?.currency ?? 'USD');
  const amountPaid = Number((invoice as any).amount_paid ?? 0);
  const balanceDue =
    (invoice as any).balance_due != null
      ? Number((invoice as any).balance_due)
      : Math.max(0, Number(invoice.total) - amountPaid);
  const epd = computeEarlyPaymentDiscount({
    settings: (business?.payment_settings as any) ?? null,
    issue_date: (invoice as any).issue_date ?? null,
    now: new Date(),
    balance_due: balanceDue,
  });

  return (
    <>
      <MarkViewed token={token} invoiceId={id} status={invoice.status} />
      <ForcePublicDocumentLight />
      <div
        className="min-h-screen bg-slate-50 text-slate-900"
        style={
          {
            '--invoice-primary': primaryColor,
          } as React.CSSProperties
        }
      >
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              {business?.logo_url ? (
                <div className="relative h-12 w-32">
                  <Image
                    src={business.logo_url}
                    alt={business.name}
                    width={128}
                    height={48}
                    className="object-contain object-left"
                  />
                </div>
              ) : (
                <span
                  className="text-2xl font-bold"
                  style={{ color: primaryColor }}
                >
                  {business?.name ?? 'Invoice'}
                </span>
              )}
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-semibold text-slate-900">
                Invoice {invoice.invoice_number}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Due {formatDisplayDate(invoice.due_date)}
              </p>
            </div>
          </header>

          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              {invoice.status === 'paid' ? (
                <>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                    Invoice Paid
                  </span>
                  <p className="mt-2 text-sm text-slate-600">
                    Paid on {invoice.paid_at ? formatDisplayDate(invoice.paid_at) : '—'}
                  </p>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                    Amount due: {formatMoneyCodeFirst(Number(invoice.total), invCurrency)}
                  </span>
                  <p className="mt-2 text-sm text-slate-600">
                    Pay securely with card via Stripe.
                  </p>
                </>
              )}
            </div>
            {invoice.status !== 'paid' && (
              <PublicInvoicePayButton token={token} invoiceId={id} />
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-6">
              <div className="grid gap-8 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    From
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {business?.name}
                  </p>
                  {(business?.address_line1 || business?.city) && (
                    <p className="mt-1 text-sm text-slate-600">
                      {[
                        business?.address_line1,
                        [business?.city, business?.state].filter(Boolean).join(', '),
                        business?.postal_code,
                        business?.country,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <div>
                  <PublicInvoiceBillToBlock invoice={invoice} />
                </div>
              </div>
            </div>

            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">
                    Item
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">
                    Qty
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">
                    Rate
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-slate-500">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-sm text-slate-500">
                          {item.description}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">
                      {formatMoneyCodeFirst(Number(item.unit_price), invCurrency)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900">
                      {formatMoneyCodeFirst(Number(item.amount), invCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-slate-200 px-6 py-4">
              <div className="flex flex-col items-end gap-2 text-right">
                <div>
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="text-2xl font-semibold text-indigo-600">
                    {formatMoneyCodeFirst(Number(invoice.total), invCurrency)}
                  </p>
                </div>

                {epd.enabled && (
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Original total</span>
                      <span className="tabular-nums">{formatMoneyCodeFirst(Number(invoice.total), invCurrency)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-slate-600">
                      <span>Early payment discount ({epd.percent}% · expires {epd.expires_on ?? '—'})</span>
                      <span className="tabular-nums">−{formatMoneyCodeFirst(epd.eligible ? epd.discount_amount : 0, invCurrency)}</span>
                    </div>
                    <div className="mt-1 flex justify-between font-semibold text-slate-900">
                      <span>Effective payable</span>
                      <span className="tabular-nums">{formatMoneyCodeFirst(epd.eligible ? epd.payable_now : epd.original_due, invCurrency)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {epd.eligible ? 'Valid only if paid before expiry.' : 'Discount not available (expired).'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {invoice.notes && (
              <div className="border-t border-slate-200 px-6 py-4">
                <p className="text-xs font-medium uppercase text-slate-500">
                  Notes
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {invoice.notes}
                </p>
              </div>
            )}

            <InvoicePaymentMethods
              settings={(business?.payment_settings as unknown) ?? null}
              stripeChargesEnabled={business?.stripe_charges_enabled}
              publicDocument
            />
          </div>

          <footer className="mt-12 rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              Powered by Zenzex
            </p>
            <p className="mt-1 text-sm text-slate-500">
              AI-powered invoicing. Create invoices by chat, voice, or screenshot.
            </p>
            <Link
              href="/signup"
              className="app-link-accent mt-4 inline-block text-sm underline-offset-4 hover:underline"
            >
              Try Zenzex free →
            </Link>
          </footer>
        </div>
      </div>
    </>
  );
}
