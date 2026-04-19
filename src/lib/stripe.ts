import Stripe from 'stripe';

let stripeSingleton: Stripe | null = null;

/** Lazily construct Stripe so `next build` does not require STRIPE_SECRET_KEY at import time. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, { typescript: true });
  }
  return stripeSingleton;
}

export async function createPaymentLink(params: {
  invoiceId: string;
  invoiceNumber: string;
  businessId: string;
  amount: number; // in dollars
  currency: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: Math.round(params.amount * 100),
          product_data: {
            name: `Invoice ${params.invoiceNumber}`,
            description: `Payment for invoice ${params.invoiceNumber}`,
          },
        },
        quantity: 1,
      },
    ],
    customer_email: params.customerEmail ?? undefined,
    metadata: {
      invoice_id: params.invoiceId,
      business_id: params.businessId,
    },
    payment_intent_data: {
      metadata: {
        invoice_id: params.invoiceId,
        business_id: params.businessId,
      },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return { url: session.url, sessionId: session.id };
}
