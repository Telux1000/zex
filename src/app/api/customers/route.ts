import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCustomerForBusiness } from '@/lib/customers/create-customer-server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  const q = (searchParams.get('q') ?? '').trim();
  const scope = (searchParams.get('scope') ?? 'active').trim().toLowerCase();
  const sort = (searchParams.get('sort') ?? 'newest').trim().toLowerCase();
  const hasEmail = (searchParams.get('has_email') ?? 'all').trim().toLowerCase();
  if (!businessId) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
  }

  const { data: business } = await supabase.from('businesses').select('id').eq('id', businessId).single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const ascending = sort === 'oldest';
  let query = supabase
    .from('customers')
    .select('*')
    .eq('business_id', business.id)
    .order('created_at', { ascending });

  if (scope === 'archived') {
    query = query.not('archived_at', 'is', null).is('anonymized_at', null);
  } else if (scope === 'anonymized') {
    query = query.not('anonymized_at', 'is', null);
  } else {
    query = query.is('archived_at', null).is('anonymized_at', null);
  }

  if (hasEmail === 'yes') {
    query = query.not('email', 'is', null);
  } else if (hasEmail === 'no') {
    query = query.is('email', null);
  }

  if (q) {
    const escaped = q.replace(/'/g, "''");
    const pattern = `'%${escaped}%'`;
    query = query.or(
      `account_number.ilike.${pattern},name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`
    );
  }

  let { data, error } = await query;
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    const lifecycleColumnMissing =
      msg.includes('archived_at') || msg.includes('anonymized_at') || msg.includes('is_active');
    if (lifecycleColumnMissing && scope !== 'active') {
      return NextResponse.json([]);
    }
    // Backward compatibility when archive columns are not migrated yet.
    if (lifecycleColumnMissing) {
      const fallback = await supabase
        .from('customers')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending });
      data = fallback.data;
      error = fallback.error;
    }
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const actorIds = Array.from(
    new Set(
      rows
        .flatMap((row) => [
          String((row as { archived_by?: string | null }).archived_by ?? '').trim(),
          String((row as { anonymized_by?: string | null }).anonymized_by ?? '').trim(),
        ])
        .filter(Boolean)
    )
  );
  let nameByActor = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', actorIds);
    nameByActor = new Map(
      (profiles ?? []).map((p) => {
        const id = String((p as { id: string }).id);
        const full = String((p as { full_name?: string | null }).full_name ?? '').trim();
        const email = String((p as { email?: string | null }).email ?? '').trim();
        return [id, full || email || id];
      })
    );
  }

  const enriched = rows.map((row) => {
    const archivedBy = String((row as { archived_by?: string | null }).archived_by ?? '').trim();
    const anonymizedBy = String((row as { anonymized_by?: string | null }).anonymized_by ?? '').trim();
    return {
      ...row,
      archived_by_name: archivedBy ? nameByActor.get(archivedBy) ?? archivedBy : null,
      anonymized_by_name: anonymizedBy ? nameByActor.get(anonymizedBy) ?? anonymizedBy : null,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Record<string, unknown>;
    const result = await createCustomerForBusiness(supabase, user.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.customer);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
