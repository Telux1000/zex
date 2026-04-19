import { NextResponse } from 'next/server';
import { WebhookVerificationError } from 'standardwebhooks';
import { deliverAuthEmailFromHook, verifySupabaseSendEmailHook } from '@/lib/auth/supabase-send-email-hook';

export const dynamic = 'force-dynamic';

/**
 * Supabase Auth → Send Email hook (HTTPS).
 * When enabled in the dashboard, Supabase stops sending its own auth mail and POSTs here instead.
 * We verify the Standard Webhooks signature and send via Postmark.
 *
 * @see https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });

  try {
    const payload = verifySupabaseSendEmailHook(raw, headers);
    await deliverAuthEmailFromHook(payload);
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    console.error('[supabase-email-hook]', e);
    return NextResponse.json({ error: 'Hook processing failed' }, { status: 500 });
  }

  return NextResponse.json({});
}
