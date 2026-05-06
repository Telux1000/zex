import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase/server';
import { formatDisplayDate } from '@/lib/utils/date';
import { PublicInvoicePayButton } from '@/components/invoices/PublicInvoicePayButton';
import { MarkViewed } from '@/components/invoices/MarkViewed';
import { formatMoneyCodeFirst } from '@/lib/utils/currency';
import { findInvoiceByPublicToken } from '@/lib/invoices/public-token';
import { buildPreviewSavedBundleFromServerRows } from '@/lib/invoices/map-api-invoice-to-preview-saved';
import { PublicInvoiceDocumentClient } from '@/components/invoices/PublicInvoiceDocumentClient';
import { ZenzexLogoMark } from '@/components/branding/AppLogoInline';

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
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto max-w-xl px-4 py-20">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Could not load this invoice. Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }
  if (!resolved || !resolved.invoices) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto max-w-xl px-4 py-20">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center">
            <h1 className="text-2xl font-semibold">Invoice not found</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This link is invalid or the invoice is no longer available.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (resolved.linkExpired) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto max-w-xl px-4 py-20">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center">
            <h1 className="text-2xl font-semibold">This link has expired</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Please request a new invoice link from the sender.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const invoice = resolved.invoices as any;
  if (!invoice) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto max-w-xl px-4 py-20">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center">
            <h1 className="text-2xl font-semibold">Invoice not found</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This link is invalid or the invoice is no longer available.
            </p>
          </div>
        </div>
      </div>
    );
  }
  const id = String(invoice.id);

  const [itemsRes, businessRes, themeRes, scheduleRes] = await Promise.all([
    supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .order('sort_order'),
    supabase
      .from('businesses')
      .select(
        'id, name, logo_url, currency, address_line1, address_line2, city, state, postal_code, country, tax_id, payment_settings, invoice_settings, stripe_charges_enabled'
      )
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
    supabase
      .from('invoice_payment_schedule_items')
      .select('id, description, amount, due_date, status, paid_at')
      .eq('invoice_id', id)
      .order('due_date', { ascending: true }),
  ]);

  const items = (itemsRes.data ?? []) as Record<string, unknown>[];
  const business = (businessRes.data ?? null) as Record<string, unknown> | null;
  const theme = themeRes.data as {
    primary_color?: string;
    template?: string;
    font_family?: string;
  } | null;
  const schedule = (scheduleRes.data ?? []) as Record<string, unknown>[];

  const documentBundle = business
    ? buildPreviewSavedBundleFromServerRows({
        invoice: invoice as Record<string, unknown>,
        business,
        items,
        paymentSchedule: schedule,
      })
    : null;

  const primaryColor = theme?.primary_color ?? '#16a34a';
  const invCurrency = String(
    (invoice as { currency?: string }).currency ?? (business as { currency?: string } | null)?.currency ?? 'USD'
  );
  const amountPaid = Number((invoice as { amount_paid?: number }).amount_paid ?? 0);
  const balanceDue =
    (invoice as { balance_due?: number | null }).balance_due != null
      ? Number((invoice as { balance_due?: number | null }).balance_due)
      : Math.max(0, Number(invoice.total) - amountPaid);

  return (
    <>
      <MarkViewed token={token} invoiceId={id} status={invoice.status} />
      <div
        className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"
        style={
          {
            '--invoice-primary': primaryColor,
          } as React.CSSProperties
        }
      >
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="mb-8 flex flex-col gap-4 border-b border-[var(--card-border)] pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              {business && (business.logo_url as string | null) ? (
                <div className="relative h-12 w-32">
                  <Image
                    src={String(business.logo_url)}
                    alt={String(business.name ?? 'Business')}
                    width={128}
                    height={48}
                    className="object-contain object-left"
                  />
                </div>
              ) : (
                <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                  {String(business?.name ?? 'Invoice')}
                </span>
              )}
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-semibold">
                Invoice {invoice.invoice_number}
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Due {formatDisplayDate(invoice.due_date)}
              </p>
            </div>
          </header>

          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
            <div>
              {invoice.status === 'paid' ? (
                <>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                    Invoice Paid
                  </span>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Paid on {invoice.paid_at ? formatDisplayDate(invoice.paid_at) : '—'}
                  </p>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                    Amount due: {formatMoneyCodeFirst(balanceDue, invCurrency)}
                  </span>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Pay securely with card via Stripe.
                  </p>
                </>
              )}
            </div>
            {invoice.status !== 'paid' && (
              <PublicInvoicePayButton token={token} invoiceId={id} />
            )}
          </div>

          {documentBundle ? <PublicInvoiceDocumentClient data={documentBundle} /> : null}

          <footer className="mt-12 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center">
            <div className="flex flex-nowrap items-center justify-center gap-2">
              <ZenzexLogoMark className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
              <p className="text-sm font-medium text-[var(--muted)]">Powered by Zenzex</p>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Smart invoicing. Create invoices by chat, voice, or screenshot.
            </p>
            <Link
              href="https://www.zenzex.com/signup"
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
