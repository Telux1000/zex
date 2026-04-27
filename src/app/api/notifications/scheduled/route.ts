import { addDays, formatISO } from 'date-fns';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { notifyBusinessEvent } from '@/services/notifications';

function asDateOnly(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Internal follow-up digests (quotes, etc.). Customer invoice payment reminders are sent only
 * from `processInvoiceReminders` + `deliverInvoicePaymentReminder` (see `/api/cron/invoice-reminders`)
 * to avoid duplicate emails.
 */
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

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id')
    .order('created_at', { ascending: true });

  for (const b of businesses ?? []) {
    const businessId = String((b as { id: string }).id);

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
        message: 'Convert accepted quotes to collect faster.',
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
