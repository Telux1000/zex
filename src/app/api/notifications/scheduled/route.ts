import { addDays, formatISO } from 'date-fns';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildInvoiceEmailSubject } from '@/lib/invoices/email-subject';
import { notifyBusinessEvent } from '@/services/notifications';

function asDateOnly(iso: string) {
  return iso.slice(0, 10);
}

export async function POST(req: Request) {
  const secret = process.env.NOTIFICATION_CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = await createServiceClient();
  const now = new Date();
  const today = asDateOnly(formatISO(now));
  const inThreeDays = asDateOnly(formatISO(addDays(now, 3)));

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name')
    .order('created_at', { ascending: true });

  for (const b of businesses ?? []) {
    const businessId = String((b as any).id);
    const { data: dueSoon } = await supabase
      .from('invoices')
      .select('id, invoice_number, due_date, customer_email, customer_name, total, currency, status, balance_due')
      .eq('business_id', businessId)
      .in('status', ['sent', 'viewed', 'partially_paid', 'overdue'])
      .gte('due_date', today)
      .lte('due_date', inThreeDays)
      .gt('balance_due', 0)
      .limit(50);

    for (const inv of dueSoon ?? []) {
      const customerEmail = String((inv as any).customer_email ?? '').trim();
      if (!customerEmail) continue;
      const invoiceNumber = String((inv as any).invoice_number ?? '');
      const dueDate = String((inv as any).due_date ?? '');
      await notifyBusinessEvent(supabase, {
        businessId,
        eventType: 'payment_reminder_upcoming',
        title: `Payment reminder: ${invoiceNumber}`,
        message: `Invoice ${invoiceNumber} is due on ${dueDate}.`,
        entityType: 'invoice',
        entityId: String((inv as any).id),
        severity: 'info',
        groupKey: `payment_reminder:${String((inv as any).id)}:${dueDate}`,
        email: {
          to: customerEmail,
          subject: buildInvoiceEmailSubject({
            state: 'reminder',
            invoiceNumber,
            companyName: String((b as any)?.name ?? ''),
            dueDate,
          }),
          textBody: `Invoice ${invoiceNumber} is due on ${dueDate}.`,
          templateEnvKey: 'POSTMARK_TEMPLATE_PAYMENT_REMINDER',
          templateModel: {
            invoiceNumber,
            companyName: String((b as any)?.name ?? ''),
            dueDate,
            customerName: String((inv as any).customer_name ?? ''),
            amountDue: Number((inv as any).balance_due ?? (inv as any).total ?? 0),
            currency: String((inv as any).currency ?? 'USD'),
            paymentUrl: '',
            paymentLinkText: 'View payment link',
            hasPaymentUrl: false,
          },
          tag: 'payment_reminder_upcoming',
        },
      });
    }

    const { data: overdue } = await supabase
      .from('invoices')
      .select('id, invoice_number, due_date, customer_email, customer_name, total, currency, status, balance_due')
      .eq('business_id', businessId)
      .in('status', ['sent', 'viewed', 'partially_paid', 'overdue'])
      .lt('due_date', today)
      .gt('balance_due', 0)
      .limit(50);

    for (const inv of overdue ?? []) {
      const customerEmail = String((inv as any).customer_email ?? '').trim();
      if (!customerEmail) continue;
      const invoiceNumber = String((inv as any).invoice_number ?? '');
      const dueDate = String((inv as any).due_date ?? '');
      await notifyBusinessEvent(supabase, {
        businessId,
        eventType: 'invoice_overdue_reminder',
        title: `Invoice overdue: ${invoiceNumber}`,
        message: `Invoice ${invoiceNumber} is overdue since ${dueDate}.`,
        entityType: 'invoice',
        entityId: String((inv as any).id),
        severity: 'warning',
        actionLabel: 'Review invoice',
        actionTarget: `/dashboard/invoices/${String((inv as any).id)}`,
        groupKey: `overdue_reminder:${String((inv as any).id)}:${today}`,
        email: {
          to: customerEmail,
          subject: buildInvoiceEmailSubject({
            state: 'overdue',
            invoiceNumber,
            companyName: String((b as any)?.name ?? ''),
            dueDate,
          }),
          textBody: `Invoice ${invoiceNumber} is overdue since ${dueDate}.`,
          templateEnvKey: 'POSTMARK_TEMPLATE_OVERDUE_REMINDER',
          templateModel: {
            invoiceNumber,
            companyName: String((b as any)?.name ?? ''),
            dueDate,
            customerName: String((inv as any).customer_name ?? ''),
            balanceDue: Number((inv as any).balance_due ?? 0),
          },
          tag: 'invoice_overdue_reminder',
        },
      });
    }

    const { data: staleQuotes } = await supabase
      .from('quotes')
      .select('id, quote_number, status, issue_date, expiry_date, customer_snapshot')
      .eq('business_id', businessId)
      .in('status', ['draft', 'sent'])
      .lt('issue_date', asDateOnly(formatISO(addDays(now, -14))))
      .limit(50);

    if ((staleQuotes ?? []).length > 0) {
      await notifyBusinessEvent(supabase, {
        businessId,
        eventType: 'stale_quote_followup',
        title: `${(staleQuotes ?? []).length} quotes need follow-up`,
        message: 'Several quotes are stale and likely need follow-up.',
        entityType: 'quote',
        entityId: String((staleQuotes ?? [])[0]?.id ?? ''),
        severity: 'warning',
        actionLabel: 'Review quotes',
        actionTarget: '/dashboard/quotes',
        groupKey: `stale_quote_followup:${(staleQuotes ?? []).length}:${today}`,
        internalEmail: {
          subject: 'Stale quotes need follow-up',
          textBody: `You have ${(staleQuotes ?? []).length} stale quotes that may need follow-up.`,
          templateEnvKey: 'POSTMARK_TEMPLATE_STALE_QUOTES_INTERNAL',
          templateModel: {
            count: (staleQuotes ?? []).length,
          },
          tag: 'stale_quote_followup',
        },
      });
    }

    const { data: acceptedPending } = await supabase
      .from('quotes')
      .select('id, quote_number, status, converted_invoice_id, accepted_at')
      .eq('business_id', businessId)
      .eq('status', 'accepted')
      .is('converted_invoice_id', null)
      .limit(50);

    if ((acceptedPending ?? []).length > 0) {
      await notifyBusinessEvent(supabase, {
        businessId,
        eventType: 'accepted_quote_ready_for_invoice',
        title: `${(acceptedPending ?? []).length} accepted quotes are ready to invoice`,
        message: 'Convert accepted quotes to invoices to collect faster.',
        entityType: 'quote',
        entityId: String((acceptedPending ?? [])[0]?.id ?? ''),
        severity: 'warning',
        actionLabel: 'Convert to invoice',
        actionTarget: '/dashboard/quotes',
        groupKey: `accepted_quote_ready_for_invoice:${(acceptedPending ?? []).length}:${today}`,
        internalEmail: {
          subject: 'Accepted quotes are ready to invoice',
          textBody: `${(acceptedPending ?? []).length} accepted quotes are waiting for conversion.`,
          tag: 'accepted_quote_ready_for_invoice',
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

