import { NextResponse } from 'next/server';
import { fetchSignupSettings } from '@/lib/auth/signup-control';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
  const settings = await fetchSignupSettings(admin);
  return NextResponse.json(
    {
      signup_mode: settings.signup_mode,
      signup_message: settings.signup_message,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
