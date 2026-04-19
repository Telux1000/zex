import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateInsights } from '@/lib/ai/insights-engine';
import { parseFinancialWindowFromRequestBody } from '@/lib/ai/insights-financial-window';
import { logActivity } from '@/lib/activity';
import { assertAiInsightsAccess } from '@/lib/rbac/server';
import { featureUpgradeMessage, getUserBillingPlan, hasPlanFeature } from '@/lib/billing/plans';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const billingPlan = await getUserBillingPlan(supabase, user.id);
    if (!hasPlanFeature(billingPlan, 'advanced_insights')) {
      return NextResponse.json(
        {
          error: featureUpgradeMessage('advanced_insights'),
          code: 'plan_feature_advanced_insights',
          current_plan: billingPlan,
          cta: 'Upgrade',
        },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const businessId = body.business_id as string | undefined;
    const financialWindow = parseFinancialWindowFromRequestBody(body);

    if (!businessId) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
    }

    const gate = await assertAiInsightsAccess(supabase, businessId, user.id);
    if (!gate.ok) return gate.response;

    const insights = await generateInsights(supabase, businessId, financialWindow);

    await logActivity(supabase, {
      business_id: businessId,
      type: 'ai_insight_generated',
      title: `${insights.length} AI insights generated`,
      metadata: { count: insights.length },
    });

    return NextResponse.json({ insights });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Insights generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
