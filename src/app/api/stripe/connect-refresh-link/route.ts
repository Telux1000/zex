import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const CONNECT_RETURN_URL =
  process.env.STRIPE_CONNECT_RETURN_URL ?? '/settings?section=payment&stripe=return';
const CONNECT_REFRESH_URL =
  process.env.STRIPE_CONNECT_REFRESH_URL ?? '/settings?section=payment&stripe=refresh';

function toAbsoluteUrl(input: string): string {
  if (input.startsWith('http://') || input.startsWith('https://')) return input;
  if (input.startsWith('/')) return `${APP_URL}${input}`;
  return `${APP_URL}/${input}`;
}

export async function POST() {
  try {
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

    const accountLink = await stripe.accountLinks.create({
      account: business.stripe_account_id,
      type: 'account_onboarding',
      refresh_url: toAbsoluteUrl(CONNECT_REFRESH_URL),
      return_url: toAbsoluteUrl(CONNECT_RETURN_URL),
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to refresh Stripe onboarding link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

