import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generatePublicInvoiceToken() {
  return randomBytes(32).toString('base64url');
}

/** Ensure invoices.public_token is set; returns the raw token for URLs. */
export async function ensureInvoicePublicToken(supabase: SupabaseClient, invoiceId: string) {
  const { data: row, error: selErr } = await supabase
    .from('invoices')
    .select('public_token')
    .eq('id', invoiceId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  const existing = (row as { public_token?: string | null } | null)?.public_token;
  if (existing) return existing;

  for (let attempt = 0; attempt < 6; attempt++) {
    const token = generatePublicInvoiceToken();
    const { data: updated, error: updErr } = await supabase
      .from('invoices')
      .update({ public_token: token })
      .eq('id', invoiceId)
      .is('public_token', null)
      .select('public_token')
      .maybeSingle();
    if (updErr && !String(updErr.message ?? '').toLowerCase().includes('unique')) {
      throw new Error(updErr.message);
    }
    const set = (updated as { public_token?: string | null } | null)?.public_token;
    if (set) return set;
    const { data: again } = await supabase
      .from('invoices')
      .select('public_token')
      .eq('id', invoiceId)
      .maybeSingle();
    const retry = (again as { public_token?: string | null } | null)?.public_token;
    if (retry) return retry;
  }
  throw new Error('Could not assign public token');
}

/** @deprecated use ensureInvoicePublicToken — persists on invoices.public_token */
export async function issuePublicInvoiceToken(supabase: SupabaseClient, invoiceId: string) {
  return ensureInvoicePublicToken(supabase, invoiceId);
}

export async function findInvoiceByPublicToken(supabase: SupabaseClient, token: string) {
  if (!token || token.length < 8) return null;

  const { data: byColumn, error: colErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (colErr) throw new Error(colErr.message);
  if (byColumn) {
    return {
      invoice_id: String((byColumn as { id: string }).id),
      invoices: byColumn as Record<string, unknown>,
      linkExpired: false as const,
    };
  }

  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();
  const { data: legacy, error: legErr } = await supabase
    .from('invoice_public_tokens')
    .select('invoice_id, expires_at, invoices(*)')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (legErr) {
    if (String(legErr.message ?? '').toLowerCase().includes('relation') || legErr.code === '42P01') {
      return null;
    }
    throw new Error(legErr.message);
  }
  if (!legacy) return null;
  const expiresAt = (legacy as { expires_at?: string | null }).expires_at;
  const linkExpired = Boolean(expiresAt && expiresAt <= nowIso);
  const rawInv = (legacy as { invoices?: unknown }).invoices;
  const inv = Array.isArray(rawInv) ? rawInv[0] : rawInv;
  if (!inv || typeof inv !== 'object') return null;
  return {
    invoice_id: String((legacy as { invoice_id: string }).invoice_id),
    invoices: inv as Record<string, unknown>,
    expires_at: expiresAt,
    linkExpired,
  };
}
