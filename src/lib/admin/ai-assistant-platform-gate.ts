import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';

const USAGE_TARGET_KEY = 'business_assistant_api';

export async function countBusinessAssistantApiUsageToday(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await admin
    .from('product_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'feature_use')
    .eq('target_key', USAGE_TARGET_KEY)
    .gte('created_at', start.toISOString());
  if (error) {
    console.error('[ai-assistant-usage]', error);
    return 0;
  }
  return count ?? 0;
}

export async function recordBusinessAssistantApiUsage(
  admin: SupabaseClient,
  params: { userId: string; businessId: string }
): Promise<void> {
  const { error } = await admin.from('product_usage_events').insert({
    user_id: params.userId,
    business_id: params.businessId,
    kind: 'feature_use',
    target_key: USAGE_TARGET_KEY,
  });
  if (error) {
    console.error('[ai-assistant-usage] insert', error);
  }
}

/** When the service role client is missing, gates are skipped so local dev without keys still works. */
export async function gateBusinessAssistantPlatformLimits(params: {
  admin: SupabaseClient | null;
  userId: string;
}): Promise<NextResponse | null> {
  const { admin, userId } = params;
  if (!admin) return null;
  const platform = await fetchAdminPlatformSettings(admin);
  if (!platform.feature_ai_assistant_enabled) {
    return NextResponse.json(
      {
        error: 'The AI assistant is turned off for this platform.',
        assistant_text: 'AI is temporarily unavailable. Please contact support if this persists.',
        code: 'platform_ai_disabled',
      },
      { status: 403 }
    );
  }
  const used = await countBusinessAssistantApiUsageToday(admin, userId);
  if (used >= platform.ai_assistant_daily_requests_per_user) {
    return NextResponse.json(
      {
        error: 'Daily AI assistant request limit reached.',
        assistant_text: 'You have reached today’s AI usage limit. Try again tomorrow or contact your administrator.',
        code: 'ai_daily_limit',
      },
      { status: 429 }
    );
  }
  return null;
}

export async function assertPlatformInvoiceWizardAiEnabled(
  admin: SupabaseClient | null
): Promise<NextResponse | null> {
  if (!admin) return null;
  const platform = await fetchAdminPlatformSettings(admin);
  if (!platform.feature_ai_assistant_enabled) {
    return NextResponse.json(
      {
        error: 'The AI assistant is turned off for this platform.',
        code: 'platform_ai_disabled',
      },
      { status: 403 }
    );
  }
  return null;
}
