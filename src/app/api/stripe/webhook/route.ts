import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/activity';
import { logAuditEvent } from '@/lib/audit-log';
import { getStripe } from '@/lib/stripe';
import { evaluateStripeConnectAccount } from '@/lib/stripe-connect';
import { computeEarlyPaymentDiscount } from '@/lib/invoices/early-payment-discount';
import { paymentAmountInBase } from '@/lib/invoices/fx-snapshot';
import { fetchExchangeMultiplier } from '@/lib/currency/exchange-frankfurter';
import { deriveInvoiceStatus } from '@/lib/invoices/status';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get('stripe-signature');
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Platform SaaS subscriptions use Paddle (`/api/webhooks/paddle`). This handler is Stripe Connect + invoice card payments only.
    if (session.mode !== 'subscription') {
    const invoiceId = session.metadata?.invoice_id;
    const businessId = session.metadata?.business_id;
    if (!invoiceId || !businessId) {
      // Not an invoice checkout; ignore (e.g. other payment modes without our metadata).
    } else {

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
    const amount = (session.amount_total ?? 0) / 100;
    const currency = (session.currency ?? 'usd').toUpperCase();
    const paidAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000);

    // Fetch invoice + business settings to apply early payment discount rules.
    const { data: inv } = await supabaseAdmin
      .from('invoices')
      .select(
        'id, invoice_number, total, amount_paid, balance_due, total_refunded, issue_date, status, currency, exchange_rate_to_base'
      )
      .eq('id', invoiceId)
      .single();
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id, payment_settings')
      .eq('id', businessId)
      .single();

    const prevPaid = Number(inv?.amount_paid ?? 0);
    const totalRefunded = Number((inv as { total_refunded?: number } | null)?.total_refunded ?? 0);
    const invTotal = Number(inv?.total ?? 0);
    const prevBalance =
      inv?.balance_due != null
        ? Number(inv.balance_due)
        : Math.max(0, invTotal - prevPaid + totalRefunded);

    const epd = computeEarlyPaymentDiscount({
      settings: (biz?.payment_settings as any) ?? null,
      issue_date: inv?.issue_date ?? null,
      now: paidAt,
      balance_due: prevBalance,
    });

    const required = epd.enabled && epd.eligible ? epd.payable_now : prevBalance;
    const isFullPayment = amount + 0.01 >= required;
    const nextPaid = Math.round((prevPaid + amount) * 100) / 100;
    const nextBalance = isFullPayment
      ? 0
      : Math.max(0, Math.round((invTotal - nextPaid + totalRefunded) * 100) / 100);
    const nextStatus = String(
      deriveInvoiceStatus({
        status: String(inv?.status ?? ''),
        total: invTotal,
        amount_paid: nextPaid,
        balance_due: nextBalance,
        total_refunded: totalRefunded,
      })
    );

    const invCur = String((inv as { currency?: string } | null)?.currency ?? 'USD').toUpperCase();
    const invRate = Number((inv as { exchange_rate_to_base?: number } | null)?.exchange_rate_to_base ?? 1);
    let p2i: number | null = null;
    if (currency !== invCur) {
      try {
        p2i = await fetchExchangeMultiplier(currency, invCur);
      } catch {
        p2i = null;
      }
    }
    const payFx = paymentAmountInBase(amount, currency, invCur, invRate, p2i);

    await supabaseAdmin.from('payments').insert({
      invoice_id: invoiceId,
      business_id: businessId,
      amount,
      currency,
      amount_in_base: payFx.amount_in_base,
      exchange_rate_to_base: invRate,
      amount_in_invoice_currency: payFx.amount_in_invoice_currency,
      exchange_rate_to_invoice: payFx.exchange_rate_to_invoice,
      stripe_payment_intent_id: paymentIntentId,
      method: 'card',
      status: 'succeeded',
      paid_at: paidAt.toISOString(),
      metadata: {
        session_id: session.id,
        original_total: Number(inv?.total ?? 0),
        early_payment_discount: epd.enabled
          ? {
              percent: epd.percent,
              days: epd.days,
              expires_on: epd.expires_on,
              eligible: epd.eligible,
              original_due: epd.original_due,
              payable_now: epd.payable_now,
              discount_amount: epd.discount_amount,
            }
          : null,
      },
    });

    await supabaseAdmin
      .from('invoices')
      .update({
        status: nextStatus,
        paid_at: isFullPayment ? new Date().toISOString() : null,
        stripe_payment_intent_id: paymentIntentId,
        amount_paid: nextPaid,
        balance_due: nextBalance,
      })
      .eq('id', invoiceId);

    await logActivity(supabaseAdmin, {
      business_id: businessId,
      type: 'invoice_paid',
      title: 'Invoice paid',
      description: `Payment received for invoice`,
      entity_type: 'invoice',
      entity_id: invoiceId,
      metadata: { amount, currency },
    });

    await logActivity(supabaseAdmin, {
      business_id: businessId,
      type: 'payment_received',
      title: `Payment received: ${currency} ${amount.toFixed(2)}`,
      entity_type: 'payment',
      entity_id: invoiceId,
      metadata: { invoice_id: invoiceId },
    });

    const invNumCheckout = String((inv as { invoice_number?: string } | null)?.invoice_number ?? invoiceId);
    await logAuditEvent(supabaseAdmin, {
      businessId: businessId,
      entityType: 'invoice',
      entityId: invoiceId,
      action: 'payment_recorded',
      performedByUserId: null,
      performedByName: 'Stripe',
      metadata: {
        invoice_number: invNumCheckout,
        amount,
        currency,
        source: 'checkout.session.completed',
      },
    });
    if (nextStatus === 'paid') {
      await logAuditEvent(supabaseAdmin, {
        businessId: businessId,
        entityType: 'invoice',
        entityId: invoiceId,
        action: 'marked_paid',
        performedByUserId: null,
        performedByName: 'Stripe',
        metadata: { invoice_number: invNumCheckout },
      });
    } else if (nextStatus === 'partially_paid') {
      await logAuditEvent(supabaseAdmin, {
        businessId: businessId,
        entityType: 'invoice',
        entityId: invoiceId,
        action: 'partially_paid',
        performedByUserId: null,
        performedByName: 'Stripe',
        metadata: { invoice_number: invNumCheckout },
      });
    }
    }
    }
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    const businessId = account.metadata?.business_id;
    if (businessId) {
      const { data: business } = await supabaseAdmin
        .from('businesses')
        .select('id, payment_settings')
        .eq('id', businessId)
        .single();

      if (business) {
        const currentSettings = (business.payment_settings as Record<string, unknown> | null) ?? {};
        const evaluation = evaluateStripeConnectAccount(account);
        const stripe_onboarding_status = evaluation.status;
        const disabledReason = account.requirements?.disabled_reason ?? null;

        const updatedSettings = {
          ...currentSettings,
          stripe_account_id: account.id,
          // payment_settings is legacy-compatible; keep in sync for invoice rendering fallbacks
          stripe_connect_status:
            stripe_onboarding_status === 'action_required'
              ? 'restricted'
              : stripe_onboarding_status === 'pending_verification'
                ? 'onboarding_in_progress'
                : stripe_onboarding_status,
          stripe_connect_disabled_reason: disabledReason,
          stripe_onboarding_status,
          stripe_charges_enabled: evaluation.charges_enabled,
          stripe_payouts_enabled: evaluation.payouts_enabled,
          stripe_details_submitted: evaluation.details_submitted,
          stripe_connected: stripe_onboarding_status === 'connected',
        };

        await supabaseAdmin
          .from('businesses')
          .update({
            payment_settings: updatedSettings,
            stripe_account_id: account.id,
            stripe_onboarding_status,
            stripe_charges_enabled: evaluation.charges_enabled,
            stripe_payouts_enabled: evaluation.payouts_enabled,
            stripe_details_submitted: evaluation.details_submitted,
          })
          .eq('id', business.id);
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const invoiceId = (pi.metadata?.invoice_id as string | undefined) ?? undefined;
    const businessId = (pi.metadata?.business_id as string | undefined) ?? undefined;
    if (invoiceId && businessId) {
      const amount = (pi.amount ?? 0) / 100;
      const currency = (pi.currency ?? 'usd').toUpperCase();

      await supabaseAdmin.from('payments').insert({
        invoice_id: invoiceId,
        business_id: businessId,
        amount,
        currency,
        stripe_payment_intent_id: pi.id,
        method: 'card',
        status: 'failed',
        metadata: { last_payment_error: pi.last_payment_error },
      });

      // Do not mark invoice paid; optionally ensure status remains sent/overdue.
      await logActivity(supabaseAdmin, {
        business_id: businessId,
        type: 'payment_received',
        title: `Card payment failed: ${currency} ${amount.toFixed(2)}`,
        entity_type: 'payment',
        entity_id: invoiceId,
        metadata: {
          invoice_id: invoiceId,
          payment_intent_id: pi.id,
          reason: pi.last_payment_error,
        },
      });
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const invoiceId = (pi.metadata?.invoice_id as string | undefined) ?? undefined;
    const businessId = (pi.metadata?.business_id as string | undefined) ?? undefined;
    if (invoiceId && businessId) {
      const amount = (pi.amount ?? 0) / 100;
      const currency = (pi.currency ?? 'usd').toUpperCase();
      const paidAt = new Date((pi.created ?? Math.floor(Date.now() / 1000)) * 1000);

      const { data: inv } = await supabaseAdmin
        .from('invoices')
        .select(
          'id, invoice_number, total, amount_paid, balance_due, issue_date, status, currency, exchange_rate_to_base'
        )
        .eq('id', invoiceId)
        .single();
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('id, payment_settings')
        .eq('id', businessId)
        .single();

      const prevPaid = Number(inv?.amount_paid ?? 0);
      const prevBalance =
        inv?.balance_due != null ? Number(inv.balance_due) : Math.max(0, Number(inv?.total ?? 0) - prevPaid);

      const epd = computeEarlyPaymentDiscount({
        settings: (biz?.payment_settings as any) ?? null,
        issue_date: inv?.issue_date ?? null,
        now: paidAt,
        balance_due: prevBalance,
      });

      const required = epd.enabled && epd.eligible ? epd.payable_now : prevBalance;
      const isFullPayment = amount + 0.01 >= required;
      const nextPaid = Math.round((prevPaid + amount) * 100) / 100;
      const nextBalance = isFullPayment ? 0 : Math.max(0, Math.round((prevBalance - amount) * 100) / 100);
      const nextStatus = isFullPayment ? 'paid' : nextPaid > 0 ? 'partially_paid' : (inv?.status ?? 'sent');

      const invCurPi = String((inv as { currency?: string } | null)?.currency ?? 'USD').toUpperCase();
      const invRatePi = Number((inv as { exchange_rate_to_base?: number } | null)?.exchange_rate_to_base ?? 1);
      let p2iPi: number | null = null;
      if (currency !== invCurPi) {
        try {
          p2iPi = await fetchExchangeMultiplier(currency, invCurPi);
        } catch {
          p2iPi = null;
        }
      }
      const payFxPi = paymentAmountInBase(amount, currency, invCurPi, invRatePi, p2iPi);

      // Idempotent insert: ignore if a succeeded payment with same intent already exists
      const { error: paymentInsertError } = await supabaseAdmin
        .from('payments')
        .insert({
          invoice_id: invoiceId,
          business_id: businessId,
          amount,
          currency,
          amount_in_base: payFxPi.amount_in_base,
          exchange_rate_to_base: invRatePi,
          amount_in_invoice_currency: payFxPi.amount_in_invoice_currency,
          exchange_rate_to_invoice: payFxPi.exchange_rate_to_invoice,
          stripe_payment_intent_id: pi.id,
          method: 'card',
          status: 'succeeded',
          paid_at: paidAt.toISOString(),
          metadata: { source: 'payment_intent.succeeded' },
        });
      void paymentInsertError; // idempotent: ignore duplicate / race on replay

      await supabaseAdmin
        .from('invoices')
        .update({
          status: nextStatus,
          paid_at: isFullPayment ? new Date().toISOString() : null,
          stripe_payment_intent_id: pi.id,
          amount_paid: nextPaid,
          balance_due: nextBalance,
        })
        .eq('id', invoiceId);

      const invNumPi = String((inv as { invoice_number?: string } | null)?.invoice_number ?? invoiceId);
      await logAuditEvent(supabaseAdmin, {
        businessId: businessId,
        entityType: 'invoice',
        entityId: invoiceId,
        action: 'payment_recorded',
        performedByUserId: null,
        performedByName: 'Stripe',
        metadata: {
          invoice_number: invNumPi,
          amount,
          currency,
          source: 'payment_intent.succeeded',
        },
      });
      if (nextStatus === 'paid') {
        await logAuditEvent(supabaseAdmin, {
          businessId: businessId,
          entityType: 'invoice',
          entityId: invoiceId,
          action: 'marked_paid',
          performedByUserId: null,
          performedByName: 'Stripe',
          metadata: { invoice_number: invNumPi },
        });
      } else if (nextStatus === 'partially_paid') {
        await logAuditEvent(supabaseAdmin, {
          businessId: businessId,
          entityType: 'invoice',
          entityId: invoiceId,
          action: 'partially_paid',
          performedByUserId: null,
          performedByName: 'Stripe',
          metadata: { invoice_number: invNumPi },
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
