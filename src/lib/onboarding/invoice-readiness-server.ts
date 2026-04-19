import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBusinessProfileComplete } from '@/lib/business/profile';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';
import { isSupportedCurrency } from '@/lib/currency/supported';

export type InvoiceSetupMissing = 'business_profile' | 'currency' | 'customer';

export type InvoiceSetupProbeResult =
  | { ok: true }
  | { ok: false; notFound: true }
  | { ok: false; missing: InvoiceSetupMissing }
  | { ok: false; customersQueryFailed: string };

/**
 * Same checks as invoice creation readiness, but returns structured result so callers
 * (e.g. Assistant invoice wizard) can branch — e.g. start in-chat customer creation
 * when the only gap is “no customers yet”.
 */
export async function probeInvoiceCreationSetup(
  supabase: SupabaseClient,
  businessId: string
): Promise<InvoiceSetupProbeResult> {
  const { data: business, error } = await supabase
    .from('businesses')
    .select(
      'id, name, currency, address_line1, city, state, country, email, phone, invoice_settings'
    )
    .eq('id', businessId)
    .maybeSingle();

  if (error || !business) {
    return { ok: false, notFound: true };
  }

  if (!isBusinessProfileComplete(business)) {
    return { ok: false, missing: 'business_profile' };
  }

  const baseCur = getBusinessBaseCurrency(
    business as {
      currency?: string | null;
      invoice_settings?: { default_currency?: string | null } | null;
    }
  );
  if (!isSupportedCurrency(baseCur)) {
    return { ok: false, missing: 'currency' };
  }

  const { count, error: cErr } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);

  if (cErr) {
    return { ok: false, customersQueryFailed: cErr.message };
  }

  if ((count ?? 0) < 1) {
    return { ok: false, missing: 'customer' };
  }

  return { ok: true };
}

/**
 * Enforces the same rules as client-side invoice creation: business profile fields,
 * supported base currency, and at least one customer for the business.
 */
export async function assertInvoiceCreationReadiness(
  supabase: SupabaseClient,
  businessId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const probe = await probeInvoiceCreationSetup(supabase, businessId);
  if (probe.ok) return { ok: true };

  if ('notFound' in probe && probe.notFound) {
    return { ok: false, response: NextResponse.json({ error: 'Business not found' }, { status: 404 }) };
  }

  if ('customersQueryFailed' in probe) {
    return {
      ok: false,
      response: NextResponse.json({ error: probe.customersQueryFailed }, { status: 500 }),
    };
  }

  if (probe.missing === 'business_profile') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Complete your business profile before creating invoices.',
          code: 'invoice_setup_incomplete',
          missing: ['business_profile' as const],
        },
        { status: 403 }
      ),
    };
  }

  if (probe.missing === 'currency') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Set a supported base currency before creating invoices.',
          code: 'invoice_setup_incomplete',
          missing: ['currency' as const],
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Add a customer before creating invoices.',
        code: 'invoice_setup_incomplete',
        missing: ['customer' as const],
      },
      { status: 403 }
    ),
  };
}
