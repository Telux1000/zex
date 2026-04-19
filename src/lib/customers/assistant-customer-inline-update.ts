import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCountryCode } from '@/lib/location';
import {
  countryFieldsForStorageFromIso,
  flagEmojiFromIso,
  resolveCountryFromUserText,
} from '@/lib/location/resolve-country-input';
import { createActivity, getChangedCustomerFields } from '@/lib/activity';
import { logAuditEvent, resolveActorDisplayName } from '@/lib/audit-log';
import { assertBusinessPermission } from '@/lib/rbac/server';
import type { CustomerInlinePatchKey } from '@/lib/customers/parse-customer-inline-edit-intent';

export type CustomerInlineRow = {
  id: string;
  business_id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  country_code?: string | null;
  preferred_currency_code?: string | null;
};

function displayNameFromRow(row: Pick<CustomerInlineRow, 'company' | 'name'>): string {
  const c = String(row.company ?? '').trim();
  const n = String(row.name ?? '').trim();
  return c || n || 'Customer';
}

/** Contact person line only when both company and a distinct contact name exist (matches create-customer semantics). */
function contactPersonFromRow(row: CustomerInlineRow): string | null {
  const company = sanitizeCustomerSnapshotField(String(row.company ?? ''));
  const name = sanitizeCustomerSnapshotField(String(row.name ?? ''));
  if (!company || !name) return null;
  if (company.toLowerCase() === name.toLowerCase()) return null;
  return name;
}

function countrySnapshotLine(row: CustomerInlineRow): string {
  const ccRaw = String(row.country_code ?? '').trim().toUpperCase();
  const flagCode = ccRaw === 'UK' ? 'GB' : ccRaw;
  const cn = sanitizeCustomerSnapshotField(String(row.country ?? ''));
  if (!cn && !ccRaw) return '—';
  return `${cn || ccRaw}${flagCode ? ` ${flagEmojiFromIso(flagCode)}` : ''}`;
}

/** Normalize pasted labels, nbsp, and stray colons so UI lines don’t show `Address: : …`. */
export function sanitizeCustomerSnapshotField(raw: string): string {
  let s = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^:\s*/, '');
  s = s.replace(/^address\s*:\s*/i, '').trim();
  s = s.replace(/^email\s*:\s*/i, '').trim();
  s = s.replace(/^phone\s*:\s*/i, '').trim();
  return s.trim();
}

/** User-visible snapshot lines (no title). */
export function formatCustomerInlineSnapshotLines(row: CustomerInlineRow): string[] {
  const company = sanitizeCustomerSnapshotField(String(row.company ?? '')) || '—';
  const email = sanitizeCustomerSnapshotField(String(row.email ?? '')) || '—';
  const phone = sanitizeCustomerSnapshotField(String(row.phone ?? '')) || '—';
  const contact = contactPersonFromRow(row);

  const l1 = sanitizeCustomerSnapshotField(String(row.address_line1 ?? ''));
  const l2 = sanitizeCustomerSnapshotField(String(row.address_line2 ?? ''));
  const city = sanitizeCustomerSnapshotField(String(row.city ?? ''));
  const st = sanitizeCustomerSnapshotField(String(row.state ?? ''));
  const zip = sanitizeCustomerSnapshotField(String(row.postal_code ?? ''));

  const ccRaw = String(row.country_code ?? '').trim().toUpperCase();
  const flagCode = ccRaw === 'UK' ? 'GB' : ccRaw;
  const cn = sanitizeCustomerSnapshotField(String(row.country ?? ''));
  const countryLine =
    cn || ccRaw
      ? `${cn || ccRaw}${flagCode ? ` ${flagEmojiFromIso(flagCode)}` : ''}${ccRaw ? ` (${ccRaw})` : ''}`
      : '—';

  const lines: string[] = [`Company name: ${company}`, `Email: ${email}`, `Phone: ${phone}`];
  if (contact) lines.push(`Contact person: ${contact}`);

  const street = [l1, l2].filter(Boolean);
  const cityRegion = [city, st, zip].filter(Boolean).join(', ');
  const addrParts: string[] = [];
  if (street.length) addrParts.push(street.join(', '));
  if (cityRegion) addrParts.push(cityRegion);
  lines.push(addrParts.length ? `Address:\n${addrParts.join('\n')}` : `Address:\n—`);

  lines.push(`Country: ${countryLine}`);
  return lines;
}

/**
 * Conversational Assistant display: bold company header + compact fields (no “Customer found” label).
 */
export function formatCustomerConversationalSnapshot(row: CustomerInlineRow): string[] {
  const company = sanitizeCustomerSnapshotField(String(row.company ?? ''));
  const name = sanitizeCustomerSnapshotField(String(row.name ?? ''));
  const header = company || name || 'Customer';
  const contact = contactPersonFromRow(row);

  const email = sanitizeCustomerSnapshotField(String(row.email ?? '')) || '—';
  const phone = sanitizeCustomerSnapshotField(String(row.phone ?? '')) || '—';

  const l1 = sanitizeCustomerSnapshotField(String(row.address_line1 ?? ''));
  const l2 = sanitizeCustomerSnapshotField(String(row.address_line2 ?? ''));
  const city = sanitizeCustomerSnapshotField(String(row.city ?? ''));
  const st = sanitizeCustomerSnapshotField(String(row.state ?? ''));
  const zip = sanitizeCustomerSnapshotField(String(row.postal_code ?? ''));

  const ccRaw = String(row.country_code ?? '').trim().toUpperCase();
  const cn = sanitizeCustomerSnapshotField(String(row.country ?? ''));
  const countryLine = countrySnapshotLine(row);

  const lines: string[] = [`**${header}**`, '', `Email: ${email}`, `Phone: ${phone}`];
  if (contact) {
    lines.push(`Contact person: ${contact}`);
  }

  const street = [l1, l2].filter(Boolean);
  if (street.length) {
    lines.push(`Address: ${street.join(', ')}`);
  }

  const cityRegion = [city, st, zip].filter(Boolean).join(', ');
  if (cityRegion) {
    lines.push(`City / region: ${cityRegion}`);
  }

  if (cn || ccRaw) {
    lines.push(`Country: ${countryLine}`);
  }

  return lines;
}

export async function fetchCustomerInlineRow(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string
): Promise<CustomerInlineRow | null> {
  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, business_id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, country_code, preferred_currency_code'
    )
    .eq('id', customerId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CustomerInlineRow;
}

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Light guard: enough digits for a phone, not an invoice number. */
export function isPlausibleCustomerPhone(value: string): boolean {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export type ApplyCustomerInlinePatchResult =
  | { ok: true; row: CustomerInlineRow }
  | { ok: false; userMessage: string };

/**
 * Apply a single-field update for Assistant inline edit.
 * Mirrors `/api/customers/[id]` PATCH rules; uses `manage_customers` RBAC (not owner-only).
 */
export async function applyAssistantCustomerInlinePatch(
  supabase: SupabaseClient,
  args: {
    userId: string;
    businessId: string;
    customerId: string;
    key: CustomerInlinePatchKey;
    value: string;
  }
): Promise<ApplyCustomerInlinePatchResult> {
  const gate = await assertBusinessPermission(supabase, args.businessId, args.userId, 'manage_customers');
  if (!gate.ok) {
    return { ok: false, userMessage: 'You do not have permission to edit customers.' };
  }

  const { data: customer, error: loadErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', args.customerId)
    .single();

  if (loadErr || !customer) {
    return { ok: false, userMessage: 'I could not find that customer anymore.' };
  }

  if (String((customer as { business_id?: string }).business_id) !== args.businessId) {
    return { ok: false, userMessage: 'I could not find that customer anymore.' };
  }

  const body: Record<string, unknown> = {};
  const v = args.value.trim();

  switch (args.key) {
    case 'email':
      if (!SIMPLE_EMAIL.test(v)) {
        return { ok: false, userMessage: 'That does not look like a valid email. Try again with a full address.' };
      }
      body.email = v;
      break;
    case 'country': {
      if (!v) {
        body.country = null;
        body.country_code = null;
        break;
      }
      const r = resolveCountryFromUserText(v);
      if (r.tier === 'high') {
        const pair = countryFieldsForStorageFromIso(r.code);
        body.country = pair.country;
        body.country_code = pair.country_code;
        break;
      }
      const c = normalizeCountryCode(v);
      if (c) {
        const pair = countryFieldsForStorageFromIso(c);
        body.country = pair.country;
        body.country_code = pair.country_code;
      } else {
        body.country = v;
        body.country_code = null;
      }
      break;
    }
    case 'phone':
      if (v && !isPlausibleCustomerPhone(v)) {
        return {
          ok: false,
          userMessage: 'That does not look like a phone number. Try a number with digits only (e.g. +44 …).',
        };
      }
      body.phone = v ? v : null;
      break;
    case 'name':
      body.name = v;
      break;
    case 'company':
      body.company = v ? v : null;
      break;
    case 'address_line1':
      body.address_line1 = v ? sanitizeCustomerSnapshotField(v) : null;
      break;
    case 'address_line2':
      body.address_line2 = v ? sanitizeCustomerSnapshotField(v) : null;
      break;
    case 'city':
      body.city = v ? sanitizeCustomerSnapshotField(v) : null;
      break;
    case 'state':
      body.state = v ? sanitizeCustomerSnapshotField(v) : null;
      break;
    case 'postal_code':
      body.postal_code = v ? sanitizeCustomerSnapshotField(v) : null;
      break;
    default:
      return { ok: false, userMessage: 'That field cannot be updated here.' };
  }

  if ('name' in body || 'company' in body) {
    const cur = customer as Record<string, unknown>;
    const nextName =
      'name' in body ? String(body.name ?? '').trim() : String(cur.name ?? '').trim();
    const companyIn =
      'company' in body
        ? body.company == null || body.company === ''
          ? ''
          : String(body.company).trim()
        : String(cur.company ?? '').trim();
    let nextCompany = companyIn;
    if (nextCompany && nextName && nextCompany.toLowerCase() === nextName.toLowerCase()) {
      nextCompany = '';
    }
    body.name = nextName;
    body.company = nextCompany || null;
  }

  const nextEmail =
    body.email !== undefined ? String(body.email ?? '').trim() : String((customer as { email?: string }).email ?? '').trim();
  const nm =
    body.name !== undefined ? String(body.name ?? '').trim() : String((customer as { name?: string }).name ?? '').trim();
  const co =
    body.company !== undefined
      ? body.company == null || body.company === ''
        ? ''
        : String(body.company).trim()
      : String((customer as { company?: string | null }).company ?? '').trim();
  if (!nextEmail) {
    return { ok: false, userMessage: 'Every customer needs an email — say a new address to change it.' };
  }
  if (!co && !nm.trim()) {
    return { ok: false, userMessage: 'I need at least a company name or a contact name.' };
  }

  const { data: updated, error: upErr } = await supabase
    .from('customers')
    .update(body)
    .eq('id', args.customerId)
    .eq('business_id', args.businessId)
    .select(
      'id, business_id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, country_code, preferred_currency_code'
    )
    .single();

  if (upErr || !updated) {
    return { ok: false, userMessage: 'Could not save that change. Try again.' };
  }

  const row = updated as CustomerInlineRow;

  await createActivity(supabase, {
    business_id: args.businessId,
    eventType: 'customer_updated',
    title: `Customer ${displayNameFromRow(row)} updated`,
    description: 'Details updated via Assistant',
    entityType: 'customer',
    entityId: row.id,
    metadata: { source: 'assistant_inline' },
  });

  const actorName = (await resolveActorDisplayName(supabase, args.userId)) ?? 'User';
  await logAuditEvent(supabase, {
    businessId: args.businessId,
    entityType: 'customer',
    entityId: String(row.id),
    action: 'updated',
    performedByUserId: args.userId,
    performedByName: actorName,
    metadata: {
      changed: getChangedCustomerFields(customer as Record<string, unknown>, updated as Record<string, unknown>),
    },
  });

  return { ok: true, row };
}

export async function applyAssistantCustomerClearAddress(
  supabase: SupabaseClient,
  args: { userId: string; businessId: string; customerId: string }
): Promise<ApplyCustomerInlinePatchResult> {
  const gate = await assertBusinessPermission(supabase, args.businessId, args.userId, 'manage_customers');
  if (!gate.ok) {
    return { ok: false, userMessage: 'You do not have permission to edit customers.' };
  }

  const { data: customer, error: loadErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', args.customerId)
    .single();

  if (loadErr || !customer) {
    return { ok: false, userMessage: 'I could not find that customer anymore.' };
  }
  if (String((customer as { business_id?: string }).business_id) !== args.businessId) {
    return { ok: false, userMessage: 'I could not find that customer anymore.' };
  }

  const { data: updated, error: upErr } = await supabase
    .from('customers')
    .update({
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      country_code: null,
    })
    .eq('id', args.customerId)
    .eq('business_id', args.businessId)
    .select(
      'id, business_id, name, company, email, phone, address_line1, address_line2, city, state, postal_code, country, country_code, preferred_currency_code'
    )
    .single();

  if (upErr || !updated) {
    return { ok: false, userMessage: 'Could not clear the address. Try again.' };
  }

  const row = updated as CustomerInlineRow;

  await createActivity(supabase, {
    business_id: args.businessId,
    eventType: 'customer_updated',
    title: `Customer ${displayNameFromRow(row)} updated`,
    description: 'Address cleared via Assistant',
    entityType: 'customer',
    entityId: row.id,
    metadata: { source: 'assistant_inline' },
  });

  const actorName = (await resolveActorDisplayName(supabase, args.userId)) ?? 'User';
  await logAuditEvent(supabase, {
    businessId: args.businessId,
    entityType: 'customer',
    entityId: String(row.id),
    action: 'updated',
    performedByUserId: args.userId,
    performedByName: actorName,
    metadata: {
      changed: getChangedCustomerFields(customer as Record<string, unknown>, updated as Record<string, unknown>),
    },
  });

  return { ok: true, row };
}

export { displayNameFromRow };
