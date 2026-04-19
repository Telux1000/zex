import type { SupabaseClient } from '@supabase/supabase-js';
import { accountNumberPrefixFromBusinessName, generateNextAccountNumber } from '@/lib/customers';
import { isSupportedCurrency } from '@/lib/currency/supported';
import { createActivity } from '@/lib/activity';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import { notifyBusinessEvent } from '@/services/notifications';
import {
  parseCustomerReminderSettings,
  serializeCustomerReminderSettings,
} from '@/lib/invoices/reminder-settings';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';
import type { Customer } from '@/lib/database.types';
import { normalizeCountryCode } from '@/lib/location/normalizeCountryCode';
import {
  countryFieldsForStorageFromIso,
  resolveCountryFromUserText,
} from '@/lib/location/resolve-country-input';

export type CreateCustomerForBusinessResult =
  | { ok: true; customer: Customer }
  | { ok: false; status: number; error: string };

/**
 * Single entry point for creating a customer row with the same validation, defaults,
 * activity/audit/notifications as `POST /api/customers`.
 */
export async function createCustomerForBusiness(
  supabase: SupabaseClient,
  actorUserId: string,
  body: Record<string, unknown>
): Promise<CreateCustomerForBusinessResult> {
  const businessId = body.business_id != null ? String(body.business_id).trim() : '';
  const name = body.name != null ? String(body.name).trim() : '';
  const companyRaw = body.company != null ? String(body.company).trim() : '';
  const email = body.email != null ? String(body.email).trim() : '';
  const company =
    companyRaw && name && companyRaw.toLowerCase() === name.toLowerCase() ? '' : companyRaw;

  if (!businessId || (!company && !name)) {
    return {
      ok: false,
      status: 400,
      error: 'Missing business_id. Provide at least Company name or Contact name.',
    };
  }
  if (!email) {
    return { ok: false, status: 400, error: 'Email is required' };
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, currency, invoice_settings')
    .eq('id', businessId)
    .single();
  if (!business) {
    return { ok: false, status: 404, error: 'Business not found' };
  }

  const companyBaseCurrency = getBusinessBaseCurrency(
    business as {
      currency?: string | null;
      invoice_settings?: { default_currency?: string | null } | null;
    }
  );

  const createGate = await assertBusinessPermission(supabase, businessId, actorUserId, 'create_customer');
  if (!createGate.ok) {
    const manageGate = await assertBusinessPermission(supabase, businessId, actorUserId, 'manage_customers');
    if (!manageGate.ok) {
      return {
        ok: false,
        status: manageGate.response.status,
        error: manageGate.response.status === 404 ? 'Not found' : 'Forbidden',
      };
    }
  }

  const { data: auth } = await supabase.auth.getUser();
  const actorName =
    (await resolveActorDisplayName(supabase, actorUserId)) ?? auth.user?.email ?? 'User';
  const prefix = accountNumberPrefixFromBusinessName(business.name ?? null);
  const account_number = await generateNextAccountNumber(supabase, business.id, prefix);

  let preferred_currency_code: string | null = null;
  if (body.preferred_currency_code != null && String(body.preferred_currency_code).trim() !== '') {
    const c = String(body.preferred_currency_code).trim().toUpperCase();
    if (!isSupportedCurrency(c)) {
      return { ok: false, status: 400, error: 'Unsupported preferred_currency_code' };
    }
    preferred_currency_code = c;
  } else {
    preferred_currency_code = companyBaseCurrency;
  }

  let reminderInsert: Record<string, unknown> = {};
  if (body.reminder_settings !== undefined) {
    const parsed = parseCustomerReminderSettings(body.reminder_settings);
    if (!parsed) {
      return { ok: false, status: 400, error: 'Invalid reminder_settings' };
    }
    reminderInsert = { reminder_settings: serializeCustomerReminderSettings(parsed) };
  }

  const explicitCode =
    body.country_code != null && String(body.country_code).trim()
      ? String(body.country_code).trim()
      : '';
  const rawCountry = body.country != null && String(body.country).trim() ? String(body.country).trim() : '';
  let country: string | null = null;
  let country_code: string | null = null;
  if (explicitCode) {
    const c = normalizeCountryCode(explicitCode);
    if (c) {
      const pair = countryFieldsForStorageFromIso(c);
      country = pair.country;
      country_code = pair.country_code;
    }
  } else if (rawCountry) {
    const r = resolveCountryFromUserText(rawCountry);
    if (r.tier === 'high') {
      const pair = countryFieldsForStorageFromIso(r.code);
      country = pair.country;
      country_code = pair.country_code;
    } else {
      const c = normalizeCountryCode(rawCountry);
      if (c) {
        const pair = countryFieldsForStorageFromIso(c);
        country = pair.country;
        country_code = pair.country_code;
      } else {
        country = rawCountry;
        country_code = null;
      }
    }
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      business_id: business.id,
      account_number,
      name: name || '',
      email,
      company: company || null,
      phone: body.phone != null && String(body.phone).trim() !== '' ? String(body.phone).trim() : null,
      address_line1: body.address_line1 != null ? String(body.address_line1).trim() || null : null,
      address_line2: body.address_line2 != null ? String(body.address_line2).trim() || null : null,
      city: body.city != null ? String(body.city).trim() || null : null,
      state: body.state != null ? String(body.state).trim() || null : null,
      postal_code: body.postal_code != null ? String(body.postal_code).trim() || null : null,
      country,
      country_code,
      notes: body.notes != null ? String(body.notes).trim() || null : null,
      preferred_currency_code,
      ...reminderInsert,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!customer) {
    return { ok: false, status: 500, error: 'Failed to create customer' };
  }

  const row = customer as Customer;

  await createActivity(supabase, {
    business_id: business.id,
    eventType: 'customer_created',
    title: `Customer ${company || name || row.account_number} created`,
    description: 'New customer profile added',
    entityType: 'customer',
    entityId: row.id,
    metadata: {
      customer_name: company || name || row.account_number,
    },
  });

  const customerLabel =
    String(company || name || (row.account_number ?? '')).trim() || 'customer';
  await logAuditEvent(supabase, {
    businessId: business.id,
    entityType: 'customer',
    entityId: String(row.id),
    action: 'created',
    performedByUserId: actorUserId,
    performedByName: actorName,
    metadata: { customer_label: customerLabel },
  });

  await notifyBusinessEvent(supabase, {
    businessId: business.id,
    eventType: 'customer_created',
    title: `Customer ${company || name || row.account_number} created`,
    message: 'New customer profile added.',
    entityType: 'customer',
    entityId: row.id,
    severity: 'info',
    groupKey: `customer_created:${row.id}`,
  });

  return { ok: true, customer: row };
}
