import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import { fetchOnboardingEntryState } from '@/lib/onboarding/entry-state';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const primaryBusiness = await getPrimaryBusinessForUser(user.id);
  const state = await fetchOnboardingEntryState(supabase, user.id, primaryBusiness);

  return NextResponse.json(state);
}
