import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateInsightsWithFallback } from '@/lib/ai/ai-service-server';
import { parseFinancialWindowFromRequestBody } from '@/lib/ai/insights-financial-window';
import { assertAiInsightsAccess } from '@/lib/rbac/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const businessId = body.business_id as string | undefined;
    const financialWindow = parseFinancialWindowFromRequestBody(body);

    if (!businessId) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
    }

    const gate = await assertAiInsightsAccess(supabase, businessId, user.id);
    if (!gate.ok) return gate.response;

    const { insights } = await generateInsightsWithFallback(supabase, businessId, financialWindow);
    return NextResponse.json({ insights });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Insights generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
