import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupportedCurrency } from '@/lib/currency/supported';
import { normalizeCountryCode } from '@/lib/location/normalizeCountryCode';
import {
  countryFieldsForStorageFromIso,
  resolveCountryFromUserText,
} from '@/lib/location/resolve-country-input';
import { createActivity, getChangedCustomerFields } from '@/lib/activity';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import {
  parseCustomerReminderSettings,
  serializeCustomerReminderSettings,
} from '@/lib/invoices/reminder-settings';
import { canHardDeleteCustomer, hardDeleteCustomer } from '@/lib/customers/customer-lifecycle';
import { assertCustomerLifecycleAccess } from '@/lib/customers/customer-lifecycle-guard';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', customer.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const hardDelete = await canHardDeleteCustomer(supabase, id);
  return NextResponse.json({
    ...customer,
    canHardDeleteCustomer: hardDelete,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', customer.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';

  const body = await req.json();
  const nameRaw = body.name !== undefined ? String(body.name ?? '').trim() : undefined;
  const companyRaw = body.company !== undefined ? String(body.company ?? '').trim() : undefined;
  const companyNormalized =
    companyRaw !== undefined && nameRaw !== undefined && companyRaw && nameRaw && companyRaw.toLowerCase() === nameRaw.toLowerCase()
      ? ''
      : companyRaw;
  if (nameRaw !== undefined) body.name = nameRaw;
  if (companyNormalized !== undefined) body.company = companyNormalized;
  const allowed = [
    'name', 'email', 'company', 'phone',
    'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'country_code',
    'notes', 'preferred_currency_code',
  ];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      const v = body[k];
      if (k === 'preferred_currency_code') {
        if (v === '' || v == null) updates[k] = null;
        else {
          const c = String(v).trim().toUpperCase();
          if (!isSupportedCurrency(c)) {
            return NextResponse.json({ error: 'Unsupported preferred_currency_code' }, { status: 400 });
          }
          updates[k] = c;
        }
      } else {
        updates[k] = v === '' || v == null ? (k === 'name' ? '' : null) : String(v).trim();
      }
    }
  }
  if (updates.country !== undefined) {
    const val = updates.country;
    if (val === null || val === '') {
      updates.country = null;
      updates.country_code = null;
    } else {
      const raw = String(val).trim();
      const r = resolveCountryFromUserText(raw);
      if (r.tier === 'high') {
        const p = countryFieldsForStorageFromIso(r.code);
        updates.country = p.country;
        updates.country_code = p.country_code;
      } else {
        const c = normalizeCountryCode(raw);
        if (c) {
          const p = countryFieldsForStorageFromIso(c);
          updates.country = p.country;
          updates.country_code = p.country_code;
        }
      }
    }
  } else if (updates.country_code !== undefined) {
    const raw = updates.country_code;
    if (raw === null || raw === '') {
      updates.country_code = null;
    } else {
      const c = normalizeCountryCode(String(raw));
      if (c) {
        const p = countryFieldsForStorageFromIso(c);
        updates.country = p.country;
        updates.country_code = p.country_code;
      }
    }
  }
  if (body.reminder_settings !== undefined) {
    const parsed = parseCustomerReminderSettings(body.reminder_settings);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid reminder_settings' }, { status: 400 });
    }
    updates.reminder_settings = serializeCustomerReminderSettings(parsed);
  }
  if (updates.preferred_currency_code !== undefined) {
    const oldPref = String(
      (customer as { preferred_currency_code?: string | null }).preferred_currency_code ?? ''
    )
      .trim()
      .toUpperCase();
    const raw = updates.preferred_currency_code;
    const newPref = raw === null || raw === '' ? '' : String(raw).trim().toUpperCase();
    if (oldPref !== newPref) {
      const [invRes, quoteRes] = await Promise.all([
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_id', id),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('customer_id', id),
      ]);
      const invCount = invRes.count ?? 0;
      const quoteCount = quoteRes.count ?? 0;
      if (invCount > 0 || quoteCount > 0) {
        return NextResponse.json(
          {
            error:
              'Preferred currency cannot be changed while this customer has invoices or quotes. Existing documents keep their transaction currency.',
            code: 'customer_currency_locked',
          },
          { status: 409 }
        );
      }
    }
  }
  if (updates.name !== undefined) updates.name = updates.name === null ? '' : updates.name;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }
  const { data: current } = await supabase.from('customers').select('name, company, email').eq('id', id).single();
  const finalName = updates.name !== undefined ? String(updates.name) : (current?.name ?? '');
  const finalCompany = updates.company !== undefined ? (updates.company ? String(updates.company) : null) : (current?.company ?? null);
  const finalEmail = updates.email !== undefined ? String(updates.email ?? '').trim() : String(current?.email ?? '').trim();
  if (!finalCompany && !finalName.trim()) {
    return NextResponse.json({ error: 'At least one of Company name or Contact name is required' }, { status: 400 });
  }
  if (!finalEmail) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const { data: updated, error: err } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const changed = getChangedCustomerFields(
    customer as Record<string, unknown>,
    updated as Record<string, unknown>
  );
  if (changed.length > 0) {
    const name = String((updated as any).company || (updated as any).name || id);
    await createActivity(supabase, {
      business_id: String((business as any).id),
      eventType: 'customer_updated',
      title: `Customer ${name} updated`,
      description: `Updated ${changed.slice(0, 2).join(', ')}`,
      entityType: 'customer',
      entityId: String(id),
      metadata: { changed_fields: changed },
    });
    await logAuditEvent(supabase, {
      businessId: String((business as any).id),
      entityType: 'customer',
      entityId: String(id),
      action: 'updated',
      performedByUserId: user.id,
      performedByName: actorName,
      metadata: { customer_label: name, changed_fields: changed },
    });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const access = await assertCustomerLifecycleAccess(supabase, id, user.id);
  if (!access.ok) return access.response;

  const actorName = (await resolveActorDisplayName(supabase, user.id)) ?? user.email ?? 'User';
  const decision = await hardDeleteCustomer({
    supabase,
    customerId: id,
    actorUserId: user.id,
    actorName,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error:
          'Customer cannot be permanently deleted because billing records exist. Archive or anonymize this customer instead.',
        blockers: decision.blockers,
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
