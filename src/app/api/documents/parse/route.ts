import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseInvoiceFromImage } from '@/lib/ai/document-parser';
import { createInvoiceFromParsed } from '@/lib/invoices/create-from-parsed';
import { resolveCustomerMatchFromAiInput, isInvalidGenericCustomerName } from '@/lib/customers/match-from-text';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { assertWorkspaceCoreWriteAccess } from '@/lib/billing/subscription-access';
import { assertInvoiceCreationReadiness } from '@/lib/onboarding/invoice-readiness-server';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const businessId = formData.get('business_id') as string | null;
    const imageUrl = formData.get('image_url') as string | null;

    if (!businessId) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
    }

    const gate = await assertBusinessPermission(supabase, String(businessId), user.id, 'create_invoice');
    if (!gate.ok) return gate.response;

    const readiness = await assertInvoiceCreationReadiness(supabase, String(businessId));
    if (!readiness.ok) return readiness.response;

    const { data: business } = await supabase
      .from('businesses')
      .select('id, owner_id, currency, invoice_settings')
      .eq('id', businessId)
      .maybeSingle();
    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    const subGate = await assertWorkspaceCoreWriteAccess(
      supabase,
      String((business as { owner_id: string }).owner_id)
    );
    if (!subGate.ok) return subGate.response;
    const reportingCurrency = getBusinessBaseCurrency(
      business as {
        currency?: string | null;
        invoice_settings?: { default_currency?: string | null } | null;
      }
    );

    let base64: string | undefined;
    const resolveCustomerMatch = async (parsed: any, sourceText: string) => {
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
        return {
          customerId: String(selectedCustomer.id),
          parsed: {
            ...parsed,
            customer_name: String(selectedCustomer.company || selectedCustomer.name || '').trim(),
            customer_email:
              String(selectedCustomer.email || parsed.customer_email || '').trim() ||
              parsed.customer_email,
            currency:
              String(selectedCustomer.preferred_currency_code || parsed.currency || '')
                .trim()
                .toUpperCase() || parsed.currency,
          },
          customer_match: {
            confidence: 'high',
            customer_id: String(selectedCustomer.id),
          },
        };
      }
      const customerNameRaw = String(parsed.customer_name ?? '').trim();
      const customerName = isInvalidGenericCustomerName(customerNameRaw) ? '' : customerNameRaw;
      const matchResult = resolveCustomerMatchFromAiInput(
        customerName,
        sourceText,
        (customerRows ?? []) as any[]
      );
      if (matchResult.confidence === 'high' && matchResult.match) {
        const m = matchResult.match as any;
        return {
          customerId: String(m.id),
          parsed: {
            ...parsed,
            customer_name: String(m.company || m.name || customerName).trim(),
            customer_email: String(m.email || parsed.customer_email || '').trim() || parsed.customer_email,
            currency:
              String(m.preferred_currency_code || parsed.currency || '').trim().toUpperCase() ||
              parsed.currency,
          },
        };
      }
      const suggestions =
        matchResult.matches.length > 0
          ? matchResult.matches
          : ((customerRows ?? []) as any[]).slice(0, 8);
      return {
        customerId: null,
        parsed: {
          ...parsed,
          customer_name: '',
          customer_email: '',
        },
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
      };
    };

    if (imageUrl && imageUrl.startsWith('http')) {
      const parsed = await parseInvoiceFromImage(imageUrl);
      const resolved = await resolveCustomerMatch(parsed, String(parsed.customer_name ?? ''));
      const invoice = await createInvoiceFromParsed(supabase, {
        businessId: business.id,
        currency: reportingCurrency,
        parsed: resolved.parsed,
        customerId: resolved.customerId,
        themeId: (formData.get('theme_id') as string) || null,
        actorUserId: user.id,
        source: 'assistant',
      });
      return NextResponse.json({ parsed: resolved.parsed, invoice, customer_match: resolved.customer_match });
    }

    if (file) {
      const buf = await file.arrayBuffer();
      base64 = Buffer.from(buf).toString('base64');
    }
    if (!base64) return NextResponse.json({ error: 'Missing file or image_url' }, { status: 400 });

    const parsed = await parseInvoiceFromImage(base64);
    const resolved = await resolveCustomerMatch(parsed, String(parsed.customer_name ?? ''));
    const invoice = await createInvoiceFromParsed(supabase, {
      businessId: business.id,
      currency: reportingCurrency,
      parsed: resolved.parsed,
      customerId: resolved.customerId,
      themeId: (formData.get('theme_id') as string) || null,
      actorUserId: user.id,
      source: 'assistant',
    });

    return NextResponse.json({ parsed: resolved.parsed, invoice, customer_match: resolved.customer_match });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Document parse failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
