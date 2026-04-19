import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureInvoicePublicToken } from '@/lib/invoices/public-token';

/**
 * Resolves the invoice public URL token for a quote (stored on quote or from invoice row).
 * Backfills quotes.invoice_public_token when missing.
 */
export async function resolveInvoicePublicTokenForQuote(
  supabase: SupabaseClient,
  quoteId: string,
  convertedInvoiceId: string | null | undefined,
  storedOnQuote: string | null | undefined
): Promise<string | null> {
  const invId = String(convertedInvoiceId ?? '').trim();
  if (!invId) return null;

  const fromQuote = String(storedOnQuote ?? '').trim();
  if (fromQuote) return fromQuote;

  const { data: inv } = await supabase
    .from('invoices')
    .select('public_token')
    .eq('id', invId)
    .maybeSingle();
  let tok = String((inv as { public_token?: string | null } | null)?.public_token ?? '').trim() || null;

  if (!tok) {
    try {
      tok = await ensureInvoicePublicToken(supabase as any, invId);
    } catch {
      return null;
    }
  }

  if (tok) {
    await supabase.from('quotes').update({ invoice_public_token: tok }).eq('id', quoteId);
  }

  return tok;
}
