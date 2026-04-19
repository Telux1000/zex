import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` (see Vercel cron docs).
 * Also accepts `x-cron-secret` for external schedulers.
 */
export function verifyCronOrResponse(req: Request): NextResponse | null {
  const raw = process.env.CRON_SECRET;
  if (!raw || !String(raw).trim()) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 501 });
  }
  const secret = String(raw).trim();
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return null;

  const m = auth?.match(/^Bearer\s+(\S+)\s*$/i);
  const token = m?.[1] ?? req.headers.get('x-cron-secret')?.trim();
  if (token && timingSafeEqualUtf8(token, secret)) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
