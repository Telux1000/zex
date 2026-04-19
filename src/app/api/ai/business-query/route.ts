import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBusinessQuery } from '@/lib/ai/business-query';
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
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const businessId = body.business_id as string | undefined;
    const financialWindow = parseFinancialWindowFromRequestBody(body);

    if (!question || !businessId) {
      return NextResponse.json({ error: 'Missing question or business_id' }, { status: 400 });
    }

    const gate = await assertAiInsightsAccess(supabase, businessId, user.id);
    if (!gate.ok) return gate.response;

    const result = await resolveBusinessQuery(question, supabase, businessId, financialWindow);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
