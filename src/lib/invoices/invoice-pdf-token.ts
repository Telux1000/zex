import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const PAYLOAD_TTL_MS = 120_000; // 2 min — only long enough for headless fetch
const PAYLOAD_V = 1 as const;

type TokenPayload = {
  v: typeof PAYLOAD_V;
  invoiceId: string;
  userId: string;
  exp: number;
};

/**
 * Prefer `INVOICE_PDF_RENDER_SECRET` when set; otherwise derive a stable server-only
 * secret from the Supabase service role (always present in API routes) so production
 * works without an extra env var. Sign/verify must use the same value.
 */
function getHmacSecret(): string {
  const s = String(process.env.INVOICE_PDF_RENDER_SECRET ?? '').trim();
  if (s) return s;
  const srk = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (srk) {
    return createHash('sha256').update('zenzex:invoice-pdf-hmac-v1:').update(srk).digest('hex');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'dev-pdf-insecure-salt-not-for-prod';
  }
  throw new Error(
    'Invoice PDF: set INVOICE_PDF_RENDER_SECRET or SUPABASE_SERVICE_ROLE_KEY for HMAC token signing'
  );
}

/**
 * HMAC-protected, short-lived token for `/print/invoice-pdf` (headless only).
 * Does not include invoice contents — only who may render which id.
 */
export function createInvoicePdfRenderToken(input: { invoiceId: string; userId: string }): string {
  const exp = Date.now() + PAYLOAD_TTL_MS;
  const p: TokenPayload = {
    v: PAYLOAD_V,
    invoiceId: String(input.invoiceId),
    userId: String(input.userId),
    exp,
  };
  const json = JSON.stringify(p);
  const p64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = createHmac('sha256', getHmacSecret()).update(p64).digest();
  return `${p64}.${sig.toString('base64url')}`;
}

export function verifyInvoicePdfRenderToken(
  t: string | null | undefined
): { invoiceId: string; userId: string } | null {
  if (!t || typeof t !== 'string') return null;
  const [p64, sigB64] = t.split('.');
  if (!p64 || !sigB64) return null;
  const expected = createHmac('sha256', getHmacSecret()).update(p64).digest();
  const got = Buffer.from(String(sigB64), 'base64url');
  if (got.length !== expected.length) return null;
  if (!timingSafeEqual(got, expected)) return null;
  let p: TokenPayload;
  try {
    p = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    return null;
  }
  if (p.v !== PAYLOAD_V || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
  if (!p.invoiceId || !p.userId) return null;
  return { invoiceId: p.invoiceId, userId: p.userId };
}
