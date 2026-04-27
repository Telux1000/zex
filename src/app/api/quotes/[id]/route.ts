import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createActivity } from '@/lib/activity';
import { notifyBusinessEvent } from '@/services/notifications';
import { issuePublicQuoteToken } from '@/lib/quotes/public-token';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { buildQuotePdfBase64 } from '@/services/quote-pdf';
import { updateQuoteBodySchema } from '@/lib/validations/quote';
import { syncSavedLineItemsFromUsage } from '@/lib/saved-line-items/sync-saved-line-items';
import {
  getConfirmationMethodSubtextFromVia,
  isManualConfirmationVia,
} from '@/lib/quotes/confirmation-method';
type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'accepted_customer' | 'rejected_customer';

function canTransition(from: QuoteStatus, to: QuoteStatus) {
  if (from === to) return true;
  if (from === 'draft' && to === 'sent') return true;
  // Manual decisions may be recorded directly from drafts.
  if (from === 'draft' && (to === 'accepted' || to === 'rejected')) return true;
  if (from === 'sent' && (to === 'accepted' || to === 'rejected' || to === 'expired')) return true;
  if (from === 'draft' && to === 'expired') return true;
  if (from === 'sent' && (to === 'accepted_customer' || to === 'rejected_customer')) return true;
  return false;
}

function calculateTotals(items: Array<{ quantity: number; unit_price: number; tax_percent?: number }>) {
  let subtotal = 0;
  let tax = 0;
  for (const item of items) {
    const line = Number(item.quantity) * Number(item.unit_price);
    subtotal += line;
    tax += line * (Number(item.tax_percent ?? 0) / 100);
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round((subtotal + tax) * 100) / 100,
  };
}

function deriveConfirmationChannelFromVia(via: string | null | undefined): 'phone' | 'in_person' | null {
  const method = getConfirmationMethodSubtextFromVia(via)?.toLowerCase() ?? '';
  if (method.includes('phone')) return 'phone';
  if (method.includes('in person')) return 'in_person';
  return null;
}

function confirmationChannelLabel(channel: 'email' | 'phone' | 'in_person' | null): string | null {
  if (channel === 'email') return 'email';
  if (channel === 'phone') return 'phone call';
  if (channel === 'in_person') return 'in person';
  return null;
}

async function syncSavedLineItemsFromQuote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { businessId: string; quoteId: string; currency: string }
) {
  const { data: quoteItems, error } = await supabase
    .from('quote_items')
    .select('name, description, unit_price, tax_percent')
    .eq('quote_id', args.quoteId);
  if (error || !quoteItems?.length) return;

  void syncSavedLineItemsFromUsage(supabase, {
    businessId: args.businessId,
    currency: String(args.currency || 'USD')
      .toUpperCase()
      .slice(0, 3),
    items: quoteItems.map((item) => ({
      name: String(item.name ?? ''),
      description: item.description ?? null,
      unit_label: 'item',
      unit_price: Number(item.unit_price ?? 0),
      tax_percent: Number(item.tax_percent ?? 0),
    })),
  }).catch((e) => console.error('[saved-line-items]', e));
}

async function loadOwnedQuote(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: string) {
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('id, business_id, quote_number, status, currency, total, customer_snapshot, issue_date, expiry_date, notes, subtotal, tax_amount, confirmation_channel')
    .eq('id', id)
    .single();
  if (error || !quote) return { quote: null, business: null };
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, currency')
    .eq('id', quote.business_id)
    .eq('owner_id', userId)
    .single();
  return { quote, business };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { quote, business } = await loadOwnedQuote(supabase, user.id, id);
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: full, error } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', id)
    .single();
  if (error || !full) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(full);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { quote, business } = await loadOwnedQuote(supabase, user.id, id);
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const parsed = updateQuoteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const p = parsed.data;
  const updates: Record<string, unknown> = {};
  if (p.customer_id !== undefined) updates.customer_id = p.customer_id;
  if (p.customer_snapshot !== undefined) updates.customer_snapshot = p.customer_snapshot;
  if (p.issue_date !== undefined) updates.issue_date = p.issue_date;
  if (p.expiry_date !== undefined) updates.expiry_date = p.expiry_date;
  if (p.notes !== undefined) updates.notes = p.notes;
  if (p.currency !== undefined) updates.currency = p.currency;

  if (p.status !== undefined) {
    const from = quote.status as QuoteStatus;
    const to = p.status as QuoteStatus;
    if (!canTransition(from, to)) {
      return NextResponse.json({ error: `Invalid transition: ${from} -> ${to}` }, { status: 400 });
    }
    if (from !== to) {
      updates.status = to;
      if (to === 'accepted') {
        const accepted_via_raw = p.accepted_via;
        const accepted_via = accepted_via_raw ? String(accepted_via_raw).trim() : '';
        const otherCustom = accepted_via.startsWith('manual_other:') ? accepted_via.slice('manual_other:'.length) : '';
        if (!accepted_via) return NextResponse.json({ error: 'How was this confirmed? is required' }, { status: 400 });
        if (accepted_via.startsWith('manual_other:') && !otherCustom.trim()) {
          return NextResponse.json({ error: 'Please specify' }, { status: 400 });
        }
        updates.accepted_at = new Date().toISOString();
        updates.accepted_via = accepted_via;
        updates.accepted_note = p.accepted_note?.trim() ? p.accepted_note.trim() : null;
        updates.confirmation_channel = deriveConfirmationChannelFromVia(accepted_via);
      }
      if (to === 'rejected') {
        const rejected_via_raw = p.rejected_via;
        const rejected_via = rejected_via_raw ? String(rejected_via_raw).trim() : '';
        const otherCustom = rejected_via.startsWith('manual_other:') ? rejected_via.slice('manual_other:'.length) : '';
        if (!rejected_via) return NextResponse.json({ error: 'How was this confirmed? is required' }, { status: 400 });
        if (rejected_via.startsWith('manual_other:') && !otherCustom.trim()) {
          return NextResponse.json({ error: 'Please specify' }, { status: 400 });
        }
        updates.rejected_at = new Date().toISOString();
        updates.rejected_via = rejected_via;
        updates.rejection_reason = p.rejection_reason?.trim() ? p.rejection_reason.trim() : null;
        updates.confirmation_channel = deriveConfirmationChannelFromVia(rejected_via);
      }
    }
  }

  if (p.items) {
    const totals = calculateTotals(p.items);
    if (totals.total <= 0) {
      return NextResponse.json({ error: 'Quote total must be greater than zero.' }, { status: 400 });
    }
    updates.subtotal = totals.subtotal;
    updates.tax_amount = totals.tax;
    updates.total = totals.total;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase.from('quotes').update(updates).eq('id', id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (p.items) {
    await supabase.from('quote_items').delete().eq('quote_id', id);
    for (let i = 0; i < p.items.length; i++) {
      const item = p.items[i];
      const amount = Number(item.quantity) * Number(item.unit_price);
      await supabase.from('quote_items').insert({
        quote_id: id,
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount,
        tax_percent: item.tax_percent ?? 0,
        sort_order: i,
      });
    }
    const nextCur = String(updates.currency ?? quote.currency ?? 'USD')
      .toUpperCase()
      .slice(0, 3);
    void syncSavedLineItemsFromUsage(supabase, {
      businessId: String(quote.business_id),
      currency: nextCur,
      items: p.items.map((item) => ({
        name: item.name,
        description: item.description ?? null,
        unit_label: 'item',
        unit_price: item.unit_price,
        tax_percent: item.tax_percent ?? 0,
      })),
    }).catch((e) => console.error('[saved-line-items]', e));
  }

  if (!p.items && p.status && (p.status === 'sent' || p.status === 'accepted')) {
    await syncSavedLineItemsFromQuote(supabase, {
      businessId: String(quote.business_id),
      quoteId: String(quote.id),
      currency: String(updates.currency ?? quote.currency ?? 'USD'),
    });
  }

  if (p.status && p.status !== quote.status) {
    const num = quote.quote_number;
    const eventType =
      p.status === 'sent'
        ? 'quote_sent'
        : p.status === 'accepted'
          ? 'quote_accepted'
          : p.status === 'rejected'
            ? 'quote_rejected'
            : p.status === 'expired'
              ? 'quote_expired'
              : null;
    if (eventType) {
      const line =
        p.status === 'sent'
          ? `Quote ${num} sent`
          : p.status === 'accepted'
            ? `Quote ${num} accepted`
            : p.status === 'rejected'
              ? `Quote ${num} rejected`
              : `Quote ${num} expired`;
      let title = line;
      let description: string | null = line;
      if (p.status === 'accepted') {
        const channel = deriveConfirmationChannelFromVia(p.accepted_via ?? null);
        const channelText = confirmationChannelLabel(channel);
        title = channelText ? `Quote accepted manually via ${channelText}` : 'Quote accepted manually';
        description = p.accepted_note?.trim() ? p.accepted_note.trim() : title;
      }
      if (p.status === 'rejected') {
        const channel = deriveConfirmationChannelFromVia(p.rejected_via ?? null);
        const channelText = confirmationChannelLabel(channel);
        title = channelText ? `Quote rejected manually via ${channelText}` : 'Quote rejected manually';
        description = p.rejection_reason?.trim() ? p.rejection_reason.trim() : title;
      }
      await createActivity(supabase, {
        business_id: business.id,
        eventType,
        title,
        description,
        entityType: 'quote',
        entityId: quote.id,
        amount: Number(quote.total ?? 0),
        currencyCode: String(updates.currency ?? quote.currency ?? 'USD'),
        metadata: {
          quote_number: num,
          ...(p.status === 'accepted'
            ? {
                accepted_at: updates.accepted_at,
                accepted_via: p.accepted_via ?? null,
                confirmation_channel: deriveConfirmationChannelFromVia(p.accepted_via ?? null),
                ...(isManualConfirmationVia(p.accepted_via ?? null)
                  ? {
                      statusSource: 'manual',
                      confirmationMethod: getConfirmationMethodSubtextFromVia(p.accepted_via ?? null),
                      confirmationNote: p.accepted_note?.trim() ? p.accepted_note.trim() : null,
                      statusUpdatedAt: updates.accepted_at,
                    }
                  : {}),
              }
            : {}),
          ...(p.status === 'rejected'
            ? {
                rejected_at: updates.rejected_at,
                rejected_via: p.rejected_via ?? null,
                confirmation_channel: deriveConfirmationChannelFromVia(p.rejected_via ?? null),
                ...(isManualConfirmationVia(p.rejected_via ?? null)
                  ? {
                      statusSource: 'manual',
                      confirmationMethod: getConfirmationMethodSubtextFromVia(p.rejected_via ?? null),
                      confirmationNote: p.rejection_reason?.trim() ? p.rejection_reason.trim() : null,
                      statusUpdatedAt: updates.rejected_at,
                    }
                  : {}),
              }
            : {}),
        },
      });

      const customerSnapshot = (quote.customer_snapshot ?? {}) as {
        name?: string;
        email?: string | null;
      };

      if (p.status === 'sent') {
        const businessName = String((business as { name?: string | null } | null)?.name ?? '').trim();
        const resolvedTotal = Number(updates.total ?? quote.total ?? 0);
        const resolvedCurrency = String(updates.currency ?? quote.currency ?? (business as { currency?: string } | null)?.currency ?? 'USD');
        const appUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');
        const admin = getSupabaseServiceAdmin();
        let quoteToken = '';
        if (admin) quoteToken = await issuePublicQuoteToken(admin as any, String(quote.id));
        const quoteUrl = appUrl && quoteToken ? `${appUrl}/quote/view/${quoteToken}` : '';
        const quotePdfBase64 = await buildQuotePdfBase64({
          businessName,
          quoteNumber: String(num),
          issueDate: String(quote.issue_date ?? ''),
          expiryDate: quote.expiry_date ? String(quote.expiry_date) : null,
          customerName: String(customerSnapshot.name ?? ''),
          customerEmail: String(customerSnapshot.email ?? ''),
          currency: resolvedCurrency,
          subtotal: Number(quote.subtotal ?? 0),
          tax: Number(quote.tax_amount ?? 0),
          total: resolvedTotal,
          notes: String(quote.notes ?? ''),
          items: ((await supabase.from('quote_items').select('name, description, quantity, unit_price, tax_percent, amount').eq('quote_id', quote.id)).data ?? []) as any,
        });

        await notifyBusinessEvent(supabase, {
          businessId: business.id,
          eventType: 'quote_sent',
          title: `Quote ${num} sent`,
          message: `Quote ${num} was sent to ${String(customerSnapshot.name ?? 'customer')}.`,
          entityType: 'quote',
          entityId: quote.id,
          severity: 'info',
          groupKey: `quote_sent:${quote.id}:${String(updates.status ?? p.status)}`,
          email: {
            to: customerSnapshot.email ?? null,
            subject: businessName ? `Quote ${num} from ${businessName}` : `Quote ${num} from your business`,
            textBody: `Quote ${num} has been shared with you.`,
            templateEnvKey: 'POSTMARK_TEMPLATE_QUOTE_SENT',
            templateModel: {
              quoteNumber: num,
              quoteId: quote.id,
              quoteUrl,
              businessName,
              customerName: String(customerSnapshot.name ?? ''),
              customerEmail: String(customerSnapshot.email ?? ''),
              total: resolvedTotal,
              currency: resolvedCurrency,
              issueDate: String(quote.issue_date ?? ''),
              expiryDate: String(quote.expiry_date ?? ''),
              notes: String(quote.notes ?? ''),
              message: `Quote ${num} has been shared with you.`,
            },
            tag: 'quote_sent',
            attachments: [
              {
                Name: `Quote-${num}.pdf`,
                Content: quotePdfBase64,
                ContentType: 'application/pdf',
              },
            ],
          },
        });
      }

      if (p.status === 'accepted') {
        await notifyBusinessEvent(supabase, {
          businessId: business.id,
          eventType: 'quote_accepted',
          title: `Quote ${num} accepted`,
          message: `Quote ${num} was accepted and may be ready for invoice conversion.`,
          entityType: 'quote',
          entityId: quote.id,
          severity: 'warning',
          actionLabel: 'Convert to invoice',
          actionTarget: `/dashboard/quotes/${quote.id}`,
          groupKey: `quote_accepted:${quote.id}`,
          internalEmail: {
            subject: `Quote accepted: ${num}`,
            textBody: `Quote ${num} has been accepted.`,
            templateEnvKey: 'POSTMARK_TEMPLATE_QUOTE_ACCEPTED_INTERNAL',
            templateModel: {
              quoteNumber: num,
              customerName: String(customerSnapshot.name ?? ''),
            },
            tag: 'quote_accepted',
          },
        });
      }

      if (p.status === 'rejected') {
        await notifyBusinessEvent(supabase, {
          businessId: business.id,
          eventType: 'quote_rejected',
          title: `Quote ${num} rejected`,
          message: `Quote ${num} was rejected.`,
          entityType: 'quote',
          entityId: quote.id,
          severity: 'warning',
          actionLabel: 'Review quote',
          actionTarget: `/dashboard/quotes/${quote.id}`,
          groupKey: `quote_rejected:${quote.id}`,
          internalEmail: {
            subject: `Quote rejected: ${num}`,
            textBody: `Quote ${num} has been rejected.`,
            tag: 'quote_rejected',
          },
        });
      }
    }
  }

  const { data: full } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', id)
    .single();
  return NextResponse.json(full);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { quote, business } = await loadOwnedQuote(supabase, user.id, id);
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase.from('quotes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
