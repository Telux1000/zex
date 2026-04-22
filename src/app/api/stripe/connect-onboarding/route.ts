import { NextResponse } from 'next/server';
import { resolveAppBaseUrl } from '@/lib/auth/signup-resend';
import { createClient } from '@/lib/supabase/server';
import { isStripeConnectRestApiEnabled } from '@/lib/integrations/stripe-connect/connect-rest-enabled';

const CONNECT_RETURN_URL = process.env.STRIPE_CONNECT_RETURN_URL ?? '/settings?section=payment&stripe=return';
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
          message: 'Set STRIPE_CONNECT_ENABLED=true to enable merchant card payouts via Stripe Connect.',
        },
        { status: 503 }
      );
    }

    const { getStripe } = await import('@/lib/stripe');

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: business } = await supabase
      .from('businesses')
      .select('id, payment_settings, stripe_account_id')
      .eq('owner_id', user.id)
      .limit(1)
      .single();

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const currentSettings = (business.payment_settings as Record<string, unknown> | null) ?? {};
    let accountId =
      (business.stripe_account_id as string | undefined) ??
      (currentSettings.stripe_account_id as string | undefined) ??
      undefined;

    if (!accountId) {
      try {
        const account = await getStripe().accounts.create({
          type: 'standard',
          email: user.email ?? undefined,
          metadata: {
            business_id: business.id,
          },
        });
        accountId = account.id;
      } catch (err) {
        const stripeError = err as { message?: string; code?: string } | null;
        const message = stripeError?.message ?? 'Failed to start Stripe onboarding';
        const code = stripeError?.code;

        const isConnectNotEnabled =
          code === 'platform_account_invalid' ||
          (typeof message === 'string' &&
            message.toLowerCase().includes('signed up for connect'));

        if (isConnectNotEnabled) {
          return NextResponse.json(
            {
              error: 'Stripe Connect is not enabled for this platform.',
              error_code: 'connect_not_enabled',
              message:
                'Stripe Connect is not enabled for this platform yet. Enable Connect in your Stripe Dashboard before onboarding businesses.',
            },
            { status: 400 }
          );
        }

        return NextResponse.json(
          {
            error: message,
          },
          { status: 500 }
        );
      }
    }

    const updatedSettings = {
      ...currentSettings,
      enable_stripe_card: true,
      stripe_account_id: accountId,
      stripe_connect_status: 'onboarding_required',
      stripe_onboarding_status: 'onboarding_required',
      stripe_connected: false,
    };

    await supabase
      .from('businesses')
      .update({
        payment_settings: updatedSettings,
        stripe_account_id: accountId,
        stripe_onboarding_status: 'onboarding_required',
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
      })
      .eq('id', business.id);
    const appUrl = resolveAppBaseUrl(new URL(req.url).origin) ?? 'http://localhost:3000';

    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: toAbsoluteUrl(CONNECT_REFRESH_URL, appUrl),
      return_url: toAbsoluteUrl(CONNECT_RETURN_URL, appUrl),
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to start Stripe onboarding';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
