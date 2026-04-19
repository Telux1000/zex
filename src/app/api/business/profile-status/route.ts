import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { businessRowToValidationInput, validateBusinessProfileInput } from '@/lib/business/profile';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ isComplete: false }, { status: 401 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, address_line1, city, state, country, email, phone')
    .eq('owner_id', user.id)
    .single();

  const snap = businessRowToValidationInput(business ?? null);
  const validation = validateBusinessProfileInput(snap);
  return NextResponse.json({
    isComplete: validation.valid,
    fieldErrors: validation.valid ? undefined : validation.fieldErrors,
  });
}

