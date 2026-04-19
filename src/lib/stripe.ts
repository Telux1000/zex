import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

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
  const session = await stripe.checkout.sessions.create({
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
