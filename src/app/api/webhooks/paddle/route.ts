import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { SubscriptionNotification } from '@paddle/paddle-node-sdk';
import { getPaddleBillingClient } from '@/lib/billing/paddle-client';
import { applyPaddleSubscriptionNotification } from '@/lib/billing/apply-paddle-subscription';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Paddle Billing notification webhook (platform SaaS subscriptions).
 *
 * Assumptions:
 * - `PADDLE_BILLING_WEBHOOK_SECRET` matches the secret in Paddle > Developer tools > Notifications.
 * - `PADDLE_BILLING_API_KEY` is set so the SDK can verify signatures via `paddle.webhooks.unmarshal`.
 * - Configure subscribed events to include `subscription.*` used below.
 */
export async function POST(req: Request) {
  const secret = process.env.PADDLE_BILLING_WEBHOOK_SECRET?.trim();
  const paddle = getPaddleBillingClient();
  if (!secret || !paddle) {
    return NextResponse.json({ error: 'Paddle billing is not configured.' }, { status: 503 });
  }

  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('paddle-signature') ?? '';

  let event: { eventType: string; data: unknown };
  try {
    event = (await paddle.webhooks.unmarshal(body, secret, signature)) as {
      eventType: string;
      data: unknown;
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid webhook';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const t = event.eventType;
  if (
    t === 'subscription.activated' ||
    t === 'subscription.canceled' ||
    t === 'subscription.created' ||
    t === 'subscription.imported' ||
    t === 'subscription.past_due' ||
    t === 'subscription.paused' ||
    t === 'subscription.resumed' ||
    t === 'subscription.trialing' ||
    t === 'subscription.updated'
  ) {
    const sub = event.data as SubscriptionNotification;
    await applyPaddleSubscriptionNotification(supabaseAdmin, sub, paddle);
  }

  return NextResponse.json({ received: true });
}
