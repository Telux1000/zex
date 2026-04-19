import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateClaudeInsights } from '@/lib/ai/insights';
import { parseFinancialWindowFromRequestBody } from '@/lib/ai/insights-financial-window';
import { logActivity } from '@/lib/activity';
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

    const insights = await generateClaudeInsights(supabase, businessId, financialWindow);
    await logActivity(supabase, {
      business_id: businessId,
      type: 'ai_insight_generated',
      title: `${insights.length} Claude insights generated`,
      metadata: { count: insights.length, provider: 'claude' },
    });

    return NextResponse.json({ insights });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate Claude insights';
    console.error('Claude insights error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
