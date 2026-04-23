import { NextResponse } from 'next/server';
import { fetchSignupSettings } from '@/lib/auth/signup-control';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseSupabaseHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || '';
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

async function readSignupContext(req: Request) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
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
                generated_at: new Date().toISOString(),
              },
            }
          : {}),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error) {
    console.error('[signup-context] failed to load signup settings', error);
    return NextResponse.json(
      { error: 'Could not load signup availability settings.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }
}

export async function GET(req: Request) {
  return readSignupContext(req);
}

export async function POST(req: Request) {
  return readSignupContext(req);
}
