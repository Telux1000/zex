import { NextResponse } from 'next/server';
import { fetchSignupSettings } from '@/lib/auth/signup-control';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export const dynamic = 'force-dynamic';

function parseSupabaseHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || '';
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
  const isDebug = new URL(req.url).searchParams.get('debug') === '1';
  try {
    const settings = await fetchSignupSettings(admin);
    return NextResponse.json(
      {
        signup_mode: settings.signup_mode,
        signup_message: settings.signup_message,
        ...(isDebug
          ? {
              debug: {
                supabase_host: parseSupabaseHost(),
                node_env: process.env.NODE_ENV ?? 'development',
                updated_at: settings.updated_at,
              },
            }
          : {}),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[signup-context] failed to load signup settings', error);
    return NextResponse.json(
      { error: 'Could not load signup availability settings.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
