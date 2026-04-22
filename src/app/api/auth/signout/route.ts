import { createClient } from '@/lib/supabase/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const envUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');
  const baseUrl = envUrl || request.nextUrl.origin;
  return NextResponse.redirect(`${baseUrl}/login`, 302);
}

export async function GET(request: NextRequest) {
  return signOut(request);
}

export async function POST(request: NextRequest) {
  return signOut(request);
}
