import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { getBusinessBaseCurrency } from '@/lib/business/base-currency';
import { businessHasFinancialRecords } from '@/lib/business/financial-guard';
import { mergeFinanceSettings, normalizeAllowedCurrencies } from '@/lib/business/finance-settings';
import { wallTimeToUtcIso } from '@/lib/invoices/scheduled-send-time';
import {
  INDUSTRY_OTHER_KEY,
  getIndustryLabelFromKey,
  isKnownIndustryKey,
} from '@/lib/business/industry-options';

function stripDefaultCurrencyFromInvoiceSettings(settings: unknown): unknown {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
  const o = { ...(settings as Record<string, unknown>) };
  delete o.default_currency;
  return o;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const gate = await assertBusinessPermission(supabase, id, user.id, 'manage_settings');
  if (!gate.ok) return gate.response;

  const { data: exists } = await supabase.from('businesses').select('id').eq('id', id).single();
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: current } = await supabase
    .from('businesses')
    .select('currency, invoice_settings, finance_settings')
    .eq('id', id)
    .single();

  const body = await req.json();
  const simpleKeys = [
    'name',
    'logo_url',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'postal_code',
    'country',
    'tax_id',
    'tax_name',
    'email',
    'phone',
    'industry_key',
    'industry_label',
    'industry_other_text',
    'website',
    'registration_number',
    'payment_settings',
    'tax_settings',
    'customer_settings',
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const k of simpleKeys) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  if (body.industry_key !== undefined) {
    const nextIndustryKey = String(body.industry_key ?? '').trim();
    if (!nextIndustryKey) {
      updates.industry_key = null;
      updates.industry_label = null;
      updates.industry_other_text = null;
    } else {
      if (!isKnownIndustryKey(nextIndustryKey)) {
        return NextResponse.json({ error: 'Invalid industry.' }, { status: 400 });
      }
      const canonicalLabel = getIndustryLabelFromKey(nextIndustryKey);
      if (!canonicalLabel) {
        return NextResponse.json({ error: 'Invalid industry.' }, { status: 400 });
      }
      updates.industry_key = nextIndustryKey;
      updates.industry_label = canonicalLabel;
      if (nextIndustryKey !== INDUSTRY_OTHER_KEY) {
        updates.industry_other_text = null;
      }
    }
  }

  if (body.industry_other_text !== undefined) {
    const other = String(body.industry_other_text ?? '').trim();
    const effectiveIndustryKey =
      updates.industry_key !== undefined
        ? String(updates.industry_key ?? '').trim()
        : String(body.industry_key ?? '').trim();
    if (effectiveIndustryKey === INDUSTRY_OTHER_KEY) {
      updates.industry_other_text = other || null;
    } else {
      updates.industry_other_text = null;
    }
  }

  if (body.timezone !== undefined) {
    const raw = String(body.timezone ?? '').trim();
    if (!raw || raw.length > 120) {
      return NextResponse.json({ error: 'Invalid timezone.' }, { status: 400 });
    }
    try {
      wallTimeToUtcIso('2000-06-01', '12:00', raw);
    } catch {
      return NextResponse.json({ error: 'Invalid IANA timezone.' }, { status: 400 });
    }
    updates.timezone = raw;
  }

  if (body.currency !== undefined) {
    const next = String(body.currency).trim().toUpperCase();
    if (!next || next.length !== 3) {
      return NextResponse.json({ error: 'Invalid currency code.' }, { status: 400 });
    }
    const prev = getBusinessBaseCurrency({
      currency: current?.currency ?? null,
      invoice_settings: current?.invoice_settings as { default_currency?: string | null } | null,
    });
    if (next !== prev && (await businessHasFinancialRecords(supabase, id))) {
      return NextResponse.json(
        {
          error:
            'Base currency cannot be changed while invoices, quotes, or expenses exist. Contact support for a migration.',
        },
        { status: 409 }
      );
    }
    updates.currency = next;
  }

  if (body.invoice_settings !== undefined) {
    updates.invoice_settings = stripDefaultCurrencyFromInvoiceSettings(body.invoice_settings);
  }

  if (body.finance_settings !== undefined && typeof body.finance_settings === 'object' && body.finance_settings) {
    const effectiveBase =
      (updates.currency as string | undefined) ??
      getBusinessBaseCurrency({
        currency: current?.currency ?? null,
        invoice_settings: current?.invoice_settings as { default_currency?: string | null } | null,
      });
    const patch = body.finance_settings as { allowed_currencies?: unknown };
    const merged = mergeFinanceSettings(current?.finance_settings, {});
    if (patch.allowed_currencies !== undefined) {
      const norm = normalizeAllowedCurrencies(patch.allowed_currencies, effectiveBase);
      if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });
      merged.allowed_currencies = norm.value;
    }
    updates.finance_settings = merged;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }

  const { data, error } = await supabase.from('businesses').update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
