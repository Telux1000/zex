import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { askClaudeBusinessQuestion } from '@/lib/ai/insights';
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
    const question = String(body.question ?? '').trim();
    const financialWindow = parseFinancialWindowFromRequestBody(body);
    if (!businessId) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
    }
    if (!question) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 });
    }

    const gate = await assertAiInsightsAccess(supabase, businessId, user.id);
    if (!gate.ok) return gate.response;

    const result = await askClaudeBusinessQuestion(supabase, businessId, question, financialWindow);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to answer question';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
