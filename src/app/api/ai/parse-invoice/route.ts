import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseInvoiceFromText } from '@/lib/ai/invoice-parser';
import { createInvoiceFromParsed } from '@/lib/invoices/create-from-parsed';
import { resolveCustomerMatchFromAiInput, isInvalidGenericCustomerName } from '@/lib/customers/match-from-text';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { assertWorkspaceCoreWriteAccess } from '@/lib/billing/subscription-access';
import { assertInvoiceCreationReadiness } from '@/lib/onboarding/invoice-readiness-server';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';
import { ZodError } from 'zod';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 });

    const businessId = body.business_id;
    if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });

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

    const parsed = await parseInvoiceFromText(text);
    const { data: customerRows } = await supabase
      .from('customers')
      .select(
        'id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, preferred_currency_code, created_at'
      )
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(60);
    const requestedCustomerId = String(body.customer_id ?? '').trim() || null;
    const selectedCustomer = requestedCustomerId
      ? ((customerRows ?? []) as any[]).find((c: any) => String(c.id) === requestedCustomerId) ?? null
      : null;
    if (selectedCustomer) {
      const normalizedParsed = {
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
        parsed: normalizedParsed,
        customerId: String(selectedCustomer.id),
        themeId: body.theme_id ?? null,
        actorUserId: user.id,
        source: 'assistant',
      });
      return NextResponse.json({
        parsed: normalizedParsed,
        invoice,
        customer_match: { confidence: 'high', customer_id: String(selectedCustomer.id) },
      });
    }

    const parsedCustomerNameRaw = String(parsed.customer_name ?? '').trim();
    const customerName = isInvalidGenericCustomerName(parsedCustomerNameRaw)
      ? ''
      : parsedCustomerNameRaw;
    const matchResult = resolveCustomerMatchFromAiInput(
      customerName,
      text,
      (customerRows ?? []) as any[]
    );

    if (matchResult.confidence === 'high' && matchResult.match) {
      const m = matchResult.match as any;
      const normalizedParsed = {
        ...parsed,
        customer_name: String(m.company || m.name || customerName).trim(),
        customer_email: String(m.email || parsed.customer_email || '').trim() || parsed.customer_email,
        currency:
          String(m.preferred_currency_code || parsed.currency || '').trim().toUpperCase() ||
          parsed.currency,
      };
      const invoice = await createInvoiceFromParsed(supabase, {
        businessId: business.id,
        currency: reportingCurrency,
        parsed: normalizedParsed,
        customerId: String(m.id),
        themeId: body.theme_id ?? null,
        actorUserId: user.id,
        source: 'assistant',
      });
      return NextResponse.json({
        parsed: normalizedParsed,
        invoice,
        customer_match: { confidence: 'high', customer_id: String(m.id) },
      });
    }

    const suggestions =
      matchResult.matches.length > 0
        ? matchResult.matches
        : ((customerRows ?? []) as any[]).slice(0, 8);
    const cleanedParsed = {
      ...parsed,
      customer_name: '',
      customer_email: '',
    };
    const invoice = await createInvoiceFromParsed(supabase, {
      businessId: business.id,
      currency: reportingCurrency,
      parsed: cleanedParsed,
      customerId: null,
      themeId: body.theme_id ?? null,
      actorUserId: user.id,
      source: 'assistant',
    });

    return NextResponse.json({
      parsed: cleanedParsed,
      invoice,
      customer_match: {
        confidence: customerName ? matchResult.confidence : 'low',
        prompt:
          customerName && matchResult.confidence === 'medium'
            ? 'Did you mean:'
            : 'Customer not specified',
        suggestions: suggestions.map((c: any) => ({
          id: String((c as any).id),
          label: String((c as any).company || (c as any).name || '').trim(),
          email: String((c as any).email || '').trim() || null,
          currency: (c as any).preferred_currency_code
            ? String((c as any).preferred_currency_code).trim().toUpperCase()
            : null,
        })),
      },
    });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invoice details are incomplete',
          code: 'invoice_parse_validation',
          issues: e.issues.map((i) => ({
            path: i.path,
            message: i.message,
            code: i.code,
          })),
        },
        { status: 422 }
      );
    }
    const message = e instanceof Error ? e.message : 'Parse failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
