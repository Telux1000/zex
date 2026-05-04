import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';
import { coerceMetricSessionContextFromClient } from '@/lib/business-assistant/metric-session-context';
import {
  parseAssistantActiveContextBody,
  runBusinessAssistantClaudeTurn,
} from '@/lib/business-assistant/claude/run-business-assistant-claude-turn';
import { coerceAssistantResponseMetaFromUnknown } from '@/lib/business-assistant/claude/assistant-response-meta';
import { isSafeIanaTimeZone } from '@/lib/dashboard/date-range';
import { featureUpgradeMessage, hasPlanFeature } from '@/lib/billing/plans';
import { assertWorkspaceCoreWriteAccess, getOwnerBillingPlanAfterReconcile } from '@/lib/billing/subscription-access';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import {
  gateBusinessAssistantPlatformLimits,
  recordBusinessAssistantApiUsage,
} from '@/lib/admin/ai-assistant-platform-gate';

const tailSchema = z.array(
  z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(32000),
  })
);

const bodySchema = z.object({
  business_id: z.string().uuid(),
  session_id: z.string().min(8).max(200),
  user_text: z.string().min(1).max(32000),
  workspace_timezone: z.string().min(2).max(120).optional().nullable(),
  metric_session_context: z.unknown().optional().nullable(),
  assistant_active_context: z.unknown().optional().nullable(),
  prior_assistant_response_meta: z.unknown().optional().nullable(),
  conversation_tail: tailSchema.optional().default([]),
});

/**
 * Claude-powered Business Assistant (tools → source-of-truth backend).
 * Does not replace invoice-wizard; client merges `assistant_text` into chat UI.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', assistant_text: 'Something was wrong with that message. Please try again.' },
        { status: 400 }
      );
    }

    const { business_id: businessId, user_text: userText, session_id: sessionId } = parsed.data;

    const serviceAdmin = getSupabaseServiceAdmin();
    const platformGate = await gateBusinessAssistantPlatformLimits({
      admin: serviceAdmin,
      userId: user.id,
    });
    if (platformGate) return platformGate;

    const gate = await assertBusinessPermission(supabase, businessId, user.id, 'create_invoice');
    if (!gate.ok) return gate.response;

    const { data: business } = await supabase
      .from('businesses')
      .select('id, owner_id, currency, timezone, invoice_settings')
      .eq('id', businessId)
      .maybeSingle();
    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    const ownerId = String((business as { owner_id: string }).owner_id);
    const subGate = await assertWorkspaceCoreWriteAccess(supabase, ownerId);
    if (!subGate.ok) return subGate.response;

    const billingPlan = await getOwnerBillingPlanAfterReconcile(supabase, ownerId);
    if (!hasPlanFeature(billingPlan, 'ai_assistant')) {
      return NextResponse.json(
        {
          error: featureUpgradeMessage('ai_assistant'),
          assistant_text: 'AI Assistant is available on Growth. Upgrade to continue.',
          code: 'plan_feature_ai_assistant',
          current_plan: billingPlan,
          cta: 'Upgrade',
        },
        { status: 403 }
      );
    }

    const reportingCurrency = getBusinessBaseCurrency(
      business as {
        currency?: string | null;
        invoice_settings?: { default_currency?: string | null } | null;
      }
    );

    const tzRaw = parsed.data.workspace_timezone?.trim() ?? '';
    const businessTzRaw = String((business as { timezone?: string | null }).timezone ?? '').trim();
    const businessTimezone = businessTzRaw && isSafeIanaTimeZone(businessTzRaw) ? businessTzRaw : null;
    const workspaceTimezone = tzRaw && isSafeIanaTimeZone(tzRaw) ? tzRaw : businessTimezone;

    const metricSession = coerceMetricSessionContextFromClient(parsed.data.metric_session_context);
    const activeContext = parseAssistantActiveContextBody(parsed.data.assistant_active_context);
    const priorMeta = coerceAssistantResponseMetaFromUnknown(parsed.data.prior_assistant_response_meta);

    const result = await runBusinessAssistantClaudeTurn({
      supabase,
      businessId,
      userId: user.id,
      reportingCurrency,
      workspaceTimezone,
      role: gate.role,
      userText,
      conversationTail: parsed.data.conversation_tail,
      priorMetricSession: metricSession,
      priorActiveContext: activeContext,
      priorAssistantResponseMeta: priorMeta,
    });

    if (serviceAdmin) {
      await recordBusinessAssistantApiUsage(serviceAdmin, { userId: user.id, businessId });
    }

    return NextResponse.json({
      assistant_text: result.assistant_text,
      chat_cards: result.chat_cards,
      metric_session_context: result.metric_session_context,
      assistant_active_context: result.assistant_active_context,
      assistant_response_meta: result.assistant_response_meta,
      session_id: sessionId,
    });
  } catch (e) {
    console.error('[business-assistant]', e);
    return NextResponse.json(
      {
        error: 'assistant_failed',
        assistant_text: 'Something went wrong while answering. Please try again in a moment.',
      },
      { status: 422 }
    );
  }
}
