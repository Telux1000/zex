import { NextResponse } from 'next/server';
import { verifyCronOrResponse } from '@/lib/cron/verify-cron-request';
import { processScheduledInvoiceSends } from '@/lib/invoices/scheduled-invoice-send-cron';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

/**
 * Not registered in vercel.json by default: Vercel Hobby allows only daily crons.
 * Scheduled sends run from `/api/cron/recurring-invoices` (daily). On Pro, add
 * `{ "path": "/api/cron/scheduled-invoice-sends", "schedule": "* * * * *" }` to
 * vercel.json or call this URL from an external scheduler with the same CRON_SECRET.
 */
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
    const result = await processScheduledInvoiceSends(supabaseAdmin, new Date());
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Cron failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
