import { NextResponse } from 'next/server';
import { verifyCronOrResponse } from '@/lib/cron/verify-cron-request';
import { processInvoiceReminders } from '@/lib/invoices/reminder-cron';
import { processScheduledInvoiceSends } from '@/lib/invoices/scheduled-invoice-send-cron';
import { processDueRecurringInvoiceRules } from '@/lib/recurring-invoice/process-due-rules';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

async function handleCron(req: Request) {
  const denied = verifyCronOrResponse(req);
  if (denied) return denied;

  const supabaseAdmin = getSupabaseServiceAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Server missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
      { status: 503 }
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  try {
    const recurring = await processDueRecurringInvoiceRules(supabaseAdmin, todayIso);
    const scheduledInvoiceSends = await processScheduledInvoiceSends(supabaseAdmin, new Date());
    const invoiceReminders = await processInvoiceReminders(supabaseAdmin, new Date());
    return NextResponse.json({ recurring, scheduledInvoiceSends, invoiceReminders });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Cron failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Vercel Cron invokes GET; external schedulers may use POST. */
export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
