import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transcribeAndParseInvoice } from '@/lib/ai/voice-pipeline';
import { createInvoiceFromParsed } from '@/lib/invoices/create-from-parsed';
import { resolveCustomerMatchFromAiInput, isInvalidGenericCustomerName } from '@/lib/customers/match-from-text';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';
import { assertInvoiceCreationReadiness } from '@/lib/onboarding/invoice-readiness-server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('audio') as File | null;
    const businessId = formData.get('business_id') as string | null;

    if (!file || !businessId) {
      return NextResponse.json(
        { error: 'Missing audio file or business_id' },
        { status: 400 }
      );
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('id, currency, invoice_settings')
      .eq('id', businessId)
      .eq('owner_id', user.id)
      .single();
    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    const readiness = await assertInvoiceCreationReadiness(supabase, String(businessId));
    if (!readiness.ok) return readiness.response;

    const reportingCurrency = getBusinessBaseCurrency(
      business as {
        currency?: string | null;
        invoice_settings?: { default_currency?: string | null } | null;
      }
    );

    const buffer = Buffer.from(await file.arrayBuffer());
    const { transcript, parsed } = await transcribeAndParseInvoice(buffer);
    const { data: customerRows } = await supabase
      .from('customers')
      .select(
        'id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, preferred_currency_code, created_at'
      )
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(60);
    const requestedCustomerId = String(formData.get('customer_id') ?? '').trim() || null;
    const selectedCustomer = requestedCustomerId
      ? ((customerRows ?? []) as any[]).find((c: any) => String(c.id) === requestedCustomerId) ?? null
      : null;
    if (selectedCustomer) {
      const resolvedParsed = {
        ...parsed,
        customer_name: String(selectedCustomer.company || selectedCustomer.name || '').trim(),
        customer_email:
          String(selectedCustomer.email || parsed.customer_email || '').trim() ||
          parsed.customer_email,
        currency:
          String(selectedCustomer.preferred_currency_code || parsed.currency || '')
            .trim()
            .toUpperCase() || parsed.currency,
      };
      const invoice = await createInvoiceFromParsed(supabase, {
        businessId: business.id,
        currency: reportingCurrency,
        parsed: resolvedParsed,
        customerId: String(selectedCustomer.id),
        themeId: (formData.get('theme_id') as string) || null,
        actorUserId: user.id,
        source: 'assistant',
      });
      return NextResponse.json({
        transcript,
        parsed: resolvedParsed,
        invoice,
        customer_match: { confidence: 'high', customer_id: String(selectedCustomer.id) },
      });
    }

    const customerNameRaw = String(parsed.customer_name ?? '').trim();
    const customerName = isInvalidGenericCustomerName(customerNameRaw) ? '' : customerNameRaw;
    const matchResult = resolveCustomerMatchFromAiInput(
      customerName,
      transcript,
      (customerRows ?? []) as any[]
    );
    let resolvedCustomerId: string | null = null;
    let resolvedParsed = { ...parsed, customer_name: '', customer_email: '' };
    const suggestions =
      matchResult.matches.length > 0
        ? matchResult.matches
        : ((customerRows ?? []) as any[]).slice(0, 8);
    if (matchResult.confidence === 'high' && matchResult.match) {
      const m = matchResult.match as any;
      resolvedCustomerId = String(m.id);
      resolvedParsed = {
        ...parsed,
        customer_name: String(m.company || m.name || customerName).trim(),
        customer_email: String(m.email || parsed.customer_email || '').trim() || parsed.customer_email,
        currency:
          String(m.preferred_currency_code || parsed.currency || '').trim().toUpperCase() ||
          parsed.currency,
      };
    }

    const invoice = await createInvoiceFromParsed(supabase, {
      businessId: business.id,
      currency: reportingCurrency,
      parsed: resolvedParsed,
      customerId: resolvedCustomerId,
      themeId: (formData.get('theme_id') as string) || null,
      actorUserId: user.id,
      source: 'assistant',
    });

    return NextResponse.json({
      transcript,
      parsed: resolvedParsed,
      invoice,
      customer_match: {
        confidence: customerName ? matchResult.confidence : 'low',
        prompt:
          customerName && matchResult.confidence === 'medium'
            ? 'Did you mean:'
            : 'Customer not specified',
        suggestions: suggestions.map((c: any) => ({
          id: String(c.id),
          label: String(c.company || c.name || '').trim(),
          email: String(c.email || '').trim() || null,
          currency: c.preferred_currency_code
            ? String(c.preferred_currency_code).trim().toUpperCase()
            : null,
        })),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
