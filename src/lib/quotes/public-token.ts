import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generatePublicQuoteToken() {
  return randomBytes(32).toString('base64url');
}

export async function issuePublicQuoteToken(supabase: SupabaseClient, quoteId: string) {
  const token = generatePublicQuoteToken();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const { error } = await supabase.from('quote_public_tokens').upsert(
    {
      quote_id: quoteId,
      token_hash: tokenHash,
      consumed_at: null,
      updated_at: now,
    },
    { onConflict: 'quote_id' }
  );
  if (error) throw new Error(error.message);
  return token;
}

export async function findQuoteByPublicToken(supabase: SupabaseClient, token: string) {
  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('quote_public_tokens')
    .select('quote_id, expires_at, consumed_at, quotes(*)')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const expiresAt = (data as { expires_at?: string | null }).expires_at;
  const linkExpired = Boolean(expiresAt && expiresAt <= nowIso);
  return {
    ...(data as unknown as { quote_id: string; quotes: Record<string, unknown>; expires_at?: string | null }),
    linkExpired,
  };
}
