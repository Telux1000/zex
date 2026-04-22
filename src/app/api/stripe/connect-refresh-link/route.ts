import { NextResponse } from 'next/server';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';
import { createClient } from '@/lib/supabase/server';
import { isStripeConnectRestApiEnabled } from '@/lib/integrations/stripe-connect/connect-rest-enabled';

const CONNECT_RETURN_URL =
  process.env.STRIPE_CONNECT_RETURN_URL ?? '/settings?section=payment&stripe=return';
const CONNECT_REFRESH_URL =
  process.env.STRIPE_CONNECT_REFRESH_URL ?? '/settings?section=payment&stripe=refresh';

function toAbsoluteUrl(input: string, appUrl: string): string {
  if (input.startsWith('http://') || input.startsWith('https://')) return input;
  if (input.startsWith('/')) return `${appUrl}${input}`;
  return `${appUrl}/${input}`;
}

export async function POST(req: Request) {
  try {
    if (!isStripeConnectRestApiEnabled()) {
      return NextResponse.json(
        {
          error: 'Stripe Connect is disabled for this deployment.',
          code: 'stripe_connect_disabled',
          message: 'Set STRIPE_CONNECT_ENABLED=true to enable Connect onboarding links.',
        },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: business } = await supabase
      .from('businesses')
      .select('id, stripe_account_id')
      .eq('owner_id', user.id)
      .limit(1)
      .single();

    if (!business?.stripe_account_id) {
      return NextResponse.json(
        { error: 'No Stripe account to refresh onboarding for.' },
        { status: 400 }
      );
    }
    const appUrl = resolveAppBaseUrl(new URL(req.url).origin) ?? 'http://localhost:3000';

    const { getStripe } = await import('@/lib/stripe');

    const accountLink = await getStripe().accountLinks.create({
      account: business.stripe_account_id,
      type: 'account_onboarding',
      refresh_url: toAbsoluteUrl(CONNECT_REFRESH_URL, appUrl),
      return_url: toAbsoluteUrl(CONNECT_RETURN_URL, appUrl),
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to refresh Stripe onboarding link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
