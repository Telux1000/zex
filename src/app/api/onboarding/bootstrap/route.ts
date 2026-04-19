import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { SETTINGS_BUSINESS_SELECT } from '@/lib/business/settings-business-select';
import { isSupportedCurrency } from '@/lib/currency/supported';
import {
  getGeoCountryCodeFromRequestHeaders,
  getRequestLocaleCountryCodeFromHeaders,
} from '@/lib/location/suggested-country-from-request';

/**
 * Ensures the authenticated user has a primary business (owner-created).
 * Idempotent: returns existing primary business if already present.
 * Creates default invoice theme when inserting a new business.
 *
 * Uses the service role for DB writes after session verification. RLS would
 * allow inserts with owner_id = auth.uid(), but the user-scoped Supabase
 * client in Route Handlers does not always attach the JWT to PostgREST the
 * same way as auth.getUser(); the service client avoids flaky RLS denials
 * while the server still enforces owner_id = verified user id only.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const h = headers();
  const geoCountryCode = getGeoCountryCodeFromRequestHeaders(h);
  const requestLocaleCountryCode = getRequestLocaleCountryCodeFromHeaders(h);
  const suggestedCountryCode = geoCountryCode;

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 503 });
  }

  const { data: ownedRows, error: ownedErr } = await admin
    .from('businesses')
    .select(SETTINGS_BUSINESS_SELECT)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);
  if (ownedErr) return NextResponse.json({ error: ownedErr.message }, { status: 500 });
  const owned = ownedRows?.[0];
  if (owned) {
    return NextResponse.json({
      business: owned,
      created: false,
      geoCountryCode,
      requestLocaleCountryCode,
      suggestedCountryCode,
    });
  }

  const { data: memberRows, error: memberErr } = await admin
    .from('business_members')
    .select(`businesses (${SETTINGS_BUSINESS_SELECT})`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);
  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
  const memberBizRaw = memberRows?.[0]?.businesses;
  const memberBiz =
    memberBizRaw && typeof memberBizRaw === 'object' && !Array.isArray(memberBizRaw)
      ? (memberBizRaw as { id?: string })
      : null;
  if (memberBiz?.id) {
    return NextResponse.json({
      business: memberBizRaw,
      created: false,
      geoCountryCode,
      requestLocaleCountryCode,
      suggestedCountryCode,
    });
  }

  let body: {
    currency?: string;
    business_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const rawCur = String(body.currency ?? 'USD').trim().toUpperCase();
  const currency = isSupportedCurrency(rawCur) ? rawCur : 'USD';

  /** Intentionally empty until the user enters a legal/business name (no profile/email-derived default). */
  const name = String(body.business_name ?? '').trim();
  const email = String(body.email ?? '').trim() || null;
  const phone = String(body.phone ?? '').trim() || null;

  const { data: inserted, error: insertErr } = await admin
    .from('businesses')
    .insert({
      owner_id: user.id,
      name,
      currency,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    })
    .select('id')
    .single();

  if (insertErr || !inserted?.id) {
    return NextResponse.json({ error: insertErr?.message ?? 'Could not create business' }, { status: 500 });
  }

  const { error: themeErr } = await admin.from('invoice_themes').insert({
    business_id: inserted.id,
    name: 'Default',
    template: 'minimal',
    is_default: true,
  });
  if (themeErr) {
    return NextResponse.json({ error: themeErr.message }, { status: 500 });
  }

  const { data: business, error: loadErr } = await admin
    .from('businesses')
    .select(SETTINGS_BUSINESS_SELECT)
    .eq('id', inserted.id)
    .single();

  if (loadErr || !business) {
    return NextResponse.json({ error: loadErr?.message ?? 'Business created but could not load' }, { status: 500 });
  }

  return NextResponse.json({
    business,
    created: true,
    geoCountryCode,
    requestLocaleCountryCode,
    suggestedCountryCode,
  });
}
