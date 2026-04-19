import { NextResponse } from 'next/server';
import { verifyCronOrResponse } from '@/lib/cron/verify-cron-request';
import { processInvoiceReminders } from '@/lib/invoices/reminder-cron';
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

  try {
    const result = await processInvoiceReminders(supabaseAdmin, new Date());
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Cron failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Vercel Cron invokes GET; external schedulers often use POST. */
export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
