import { NextResponse } from 'next/server';

/**
 * Legacy URL compatibility. Event processing is disabled; active SaaS webhooks are
 * `/api/webhooks/flutterwave` and `/api/webhooks/paystack`.
 */
export async function POST() {
  return NextResponse.json(
    {
      received: true,
      deprecated: true,
      message: 'This URL is deprecated. Configure Flutterwave, Paystack, and Stripe Connect for current billing.',
    },
    { status: 200 }
  );
}
