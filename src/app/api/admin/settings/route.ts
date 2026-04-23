import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApiAccess } from '@/lib/admin/auth';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { logAdminAuditEvent } from '@/lib/admin/audit';
import { fetchSignupSettings, mergeSignupSettingsRow, normalizeSignupMode } from '@/lib/auth/signup-control';
import {
  fetchAppSystemSettings,
  normalizeSystemMode,
  SYSTEM_MODES,
} from '@/lib/system-access';
import { fetchInternalSecuritySettings } from '@/lib/admin/internal-security-settings';
import {
  fetchAdminPlatformSettings,
  mergeAdminPlatformSettingsRow,
  invalidateAdminPlatformSettingsCache,
  type AdminPlatformSettingsDTO,
} from '@/lib/admin/admin-platform-settings';
import {
  internalSecurityPolicyPatchSchema,
  persistInternalSecurityPolicyPatch,
} from '@/lib/admin/internal-security-policy-persist';

const planEnum = z.enum(['starter', 'growth', 'professional', 'enterprise']);

function nullableInt(min: number, max: number) {
  return z.union([z.number().int().min(min).max(max), z.null()]);
}

const platformSectionSchema = z
  .object({
    section: z.literal('platform'),
    feature_ai_assistant_enabled: z.boolean().optional(),
    feature_reminders_enabled: z.boolean().optional(),
    feature_scheduled_send_enabled: z.boolean().optional(),
    default_new_account_plan: planEnum.optional(),
    starter_monthly_invoice_limit: z.number().int().min(1).max(100000).optional(),
    growth_monthly_invoice_limit: nullableInt(1, 100000).optional(),
    professional_monthly_invoice_limit: nullableInt(1, 100000).optional(),
    enterprise_monthly_invoice_limit: nullableInt(1, 100000).optional(),
  })
  .strict();

const notificationsSectionSchema = z
  .object({
    section: z.literal('notifications'),
    admin_alerts_email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
    system_sender_label: z.union([z.string().max(120), z.literal(''), z.null()]).optional(),
  })
  .strict();

const billingSectionSchema = z
  .object({
    section: z.literal('billing'),
    trial_days: z.number().int().min(0).max(730).optional(),
    plan_price_starter_cents: z.number().int().min(0).nullable().optional(),
    plan_price_growth_cents: z.number().int().min(0).nullable().optional(),
    plan_price_professional_cents: z.number().int().min(0).nullable().optional(),
    plan_price_enterprise_cents: z.number().int().min(0).nullable().optional(),
  })
  .strict();

const aiSectionSchema = z
  .object({
    section: z.literal('ai'),
    ai_assistant_daily_requests_per_user: z.number().int().min(1).max(100000).optional(),
    reminder_default_first_before_due_days: nullableInt(0, 90).optional(),
    scheduling_min_lead_minutes: z.number().int().min(1).max(10080).optional(),
  })
  .strict();

const authenticationSectionSchema = z
  .object({ section: z.literal('authentication') })
  .merge(internalSecurityPolicyPatchSchema)
  .strict();

const signupSectionSchema = z
  .object({
    section: z.literal('signup'),
    signup_mode: z.enum(['OPEN', 'CLOSED', 'INVITE_ONLY']).optional(),
    signup_message: z.union([z.string().max(2000), z.literal(''), z.null()]).optional(),
  })
  .strict();

const systemAccessSectionSchema = z
  .object({
    section: z.literal('system_access'),
    system_mode: z.enum(SYSTEM_MODES).optional(),
    system_message: z.union([z.string().max(2000), z.literal(''), z.null()]).optional(),
    emergency_admin_access_enabled: z.boolean().optional(),
  })
  .strict();

const patchSchema = z.discriminatedUnion('section', [
  platformSectionSchema,
  notificationsSectionSchema,
  billingSectionSchema,
  aiSectionSchema,
  authenticationSectionSchema,
  signupSectionSchema,
  systemAccessSectionSchema,
]);

function parseSupabaseHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || '';
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

export async function GET() {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  const [platform, security, signup, systemAccess] = await Promise.all([
    fetchAdminPlatformSettings(admin),
    fetchInternalSecuritySettings(admin),
    fetchSignupSettings(admin),
    fetchAppSystemSettings(admin),
  ]);

  const environment = {
    node_env: process.env.NODE_ENV ?? 'development',
    supabase_host: parseSupabaseHost(),
    postmark_configured: Boolean(process.env.POSTMARK_SERVER_TOKEN?.trim()),
    paddle_billing_api_configured: Boolean(process.env.PADDLE_BILLING_API_KEY?.trim()),
    paddle_billing_webhook_configured: Boolean(process.env.PADDLE_BILLING_WEBHOOK_SECRET?.trim()),
    app_url_configured: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
  };

  return NextResponse.json({
    platform,
    security,
    signup,
    system_access: systemAccess,
    environment,
    can_edit: gate.adminRole === 'owner',
    can_edit_signup: gate.adminRole === 'owner' || gate.adminRole === 'admin',
  });
}

export async function PATCH(req: Request) {
  const gate = await requireAdminApiAccess();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const section = parsed.data.section;
  const isSignupPatch = section === 'signup';
  const canEditSignup = gate.adminRole === 'owner' || gate.adminRole === 'admin';
  if (isSignupPatch ? !canEditSignup : gate.adminRole !== 'owner') {
    return NextResponse.json({ error: 'Insufficient role to change this setting.' }, { status: 403 });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });

  if (parsed.data.section === 'authentication') {
    const { section: _s, ...secPatch } = parsed.data;
    const r = await persistInternalSecurityPolicyPatch({
      admin,
      gate: { user: gate.user, supabase: gate.supabase, adminRole: gate.adminRole },
      patch: secPatch,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const platform = await fetchAdminPlatformSettings(admin);
    return NextResponse.json({ platform, security: r.policies });
  }
  if (parsed.data.section === 'signup') {
    const current = await fetchSignupSettings(admin);
    const nextMode = parsed.data.signup_mode ? normalizeSignupMode(parsed.data.signup_mode) : current.signup_mode;
    const nextMessage =
      parsed.data.signup_message === undefined
        ? current.signup_message
        : parsed.data.signup_message === null || parsed.data.signup_message === ''
          ? null
          : String(parsed.data.signup_message).trim().slice(0, 2000);

    const { data: persistedSignupRow, error: upErr } = await admin
      .from('app_settings')
      .upsert({
        id: 'default',
        signup_mode: nextMode,
        signup_message: nextMessage,
        updated_at: new Date().toISOString(),
        updated_by: gate.user.id,
      }, { onConflict: 'id' })
      .select('*')
      .single();
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    const persistedSignup = mergeSignupSettingsRow(
      (persistedSignupRow ?? null) as Record<string, unknown> | null
    );

    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: 'admin_signup_mode_changed',
      targetType: 'app_settings',
      targetId: 'default',
      metadata: {
        previous: { signup_mode: current.signup_mode, signup_message: current.signup_message },
        next: {
          signup_mode: persistedSignup.signup_mode,
          signup_message: persistedSignup.signup_message,
        },
      },
    });

    return NextResponse.json({
      signup: persistedSignup,
    });
  }
  if (parsed.data.section === 'system_access') {
    const current = await fetchAppSystemSettings(admin);
    const nextMode = parsed.data.system_mode
      ? normalizeSystemMode(parsed.data.system_mode)
      : current.system_mode;
    const nextMessage =
      parsed.data.system_message === undefined
        ? current.system_message
        : parsed.data.system_message === null || parsed.data.system_message === ''
          ? null
          : String(parsed.data.system_message).trim().slice(0, 2000);
    const nextEmergencyAdminAccessEnabled =
      parsed.data.emergency_admin_access_enabled === undefined
        ? current.emergency_admin_access_enabled
        : Boolean(parsed.data.emergency_admin_access_enabled);

    const nowIso = new Date().toISOString();
    const { error: upErr } = await admin
      .from('app_settings')
      .update({
        system_mode: nextMode,
        system_message: nextMessage,
        emergency_admin_access_enabled: nextEmergencyAdminAccessEnabled,
        updated_at: nowIso,
        updated_by: gate.user.id,
      })
      .eq('id', 'default');
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    if (current.system_mode !== nextMode) {
      await admin.from('app_system_mode_audit_logs').insert({
        previous_mode: current.system_mode,
        new_mode: nextMode,
        changed_by: gate.user.id,
      });
    }

    await logAdminAuditEvent({
      supabase: gate.supabase,
      actorUserId: gate.user.id,
      actorRole: gate.adminRole,
      action: 'admin_system_mode_changed',
      targetType: 'app_settings',
      targetId: 'default',
      metadata: {
        previous: {
          system_mode: current.system_mode,
          system_message: current.system_message,
          emergency_admin_access_enabled: current.emergency_admin_access_enabled,
        },
        next: {
          system_mode: nextMode,
          system_message: nextMessage,
          emergency_admin_access_enabled: nextEmergencyAdminAccessEnabled,
        },
      },
    });

    return NextResponse.json({
      system_access: {
        system_mode: nextMode,
        system_message: nextMessage,
        emergency_admin_access_enabled: nextEmergencyAdminAccessEnabled,
      },
    });
  }

  const { data: rawRow, error: loadErr } = await admin
    .from('admin_platform_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (loadErr) {
    console.error('[admin_platform_settings]', loadErr);
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const before = mergeAdminPlatformSettingsRow((rawRow ?? null) as Record<string, unknown> | null);
  const next: AdminPlatformSettingsDTO = { ...before };
  const patch = parsed.data;

  switch (patch.section) {
    case 'platform': {
      if (patch.feature_ai_assistant_enabled !== undefined) {
        next.feature_ai_assistant_enabled = patch.feature_ai_assistant_enabled;
      }
      if (patch.feature_reminders_enabled !== undefined) {
        next.feature_reminders_enabled = patch.feature_reminders_enabled;
      }
      if (patch.feature_scheduled_send_enabled !== undefined) {
        next.feature_scheduled_send_enabled = patch.feature_scheduled_send_enabled;
      }
      if (patch.default_new_account_plan !== undefined) {
        next.default_new_account_plan = patch.default_new_account_plan;
      }
      if (patch.starter_monthly_invoice_limit !== undefined) {
        next.starter_monthly_invoice_limit = patch.starter_monthly_invoice_limit;
      }
      if (patch.growth_monthly_invoice_limit !== undefined) {
        next.growth_monthly_invoice_limit = patch.growth_monthly_invoice_limit;
      }
      if (patch.professional_monthly_invoice_limit !== undefined) {
        next.professional_monthly_invoice_limit = patch.professional_monthly_invoice_limit;
      }
      if (patch.enterprise_monthly_invoice_limit !== undefined) {
        next.enterprise_monthly_invoice_limit = patch.enterprise_monthly_invoice_limit;
      }
      break;
    }
    case 'notifications': {
      if (patch.admin_alerts_email !== undefined) {
        const v = patch.admin_alerts_email;
        next.admin_alerts_email = v === null || v === '' ? null : String(v).trim();
      }
      if (patch.system_sender_label !== undefined) {
        const v = patch.system_sender_label;
        next.system_sender_label = v === null || v === '' ? null : String(v).trim().slice(0, 120);
      }
      break;
    }
    case 'billing': {
      if (patch.trial_days !== undefined) next.trial_days = patch.trial_days;
      if (patch.plan_price_starter_cents !== undefined) {
        next.plan_price_starter_cents = patch.plan_price_starter_cents;
      }
      if (patch.plan_price_growth_cents !== undefined) {
        next.plan_price_growth_cents = patch.plan_price_growth_cents;
      }
      if (patch.plan_price_professional_cents !== undefined) {
        next.plan_price_professional_cents = patch.plan_price_professional_cents;
      }
      if (patch.plan_price_enterprise_cents !== undefined) {
        next.plan_price_enterprise_cents = patch.plan_price_enterprise_cents;
      }
      break;
    }
    case 'ai': {
      if (patch.ai_assistant_daily_requests_per_user !== undefined) {
        next.ai_assistant_daily_requests_per_user = patch.ai_assistant_daily_requests_per_user;
      }
      if (patch.reminder_default_first_before_due_days !== undefined) {
        next.reminder_default_first_before_due_days = patch.reminder_default_first_before_due_days;
      }
      if (patch.scheduling_min_lead_minutes !== undefined) {
        next.scheduling_min_lead_minutes = patch.scheduling_min_lead_minutes;
      }
      break;
    }
    default:
      break;
  }

  const { error: upErr } = await admin
    .from('admin_platform_settings')
    .update({
      feature_ai_assistant_enabled: next.feature_ai_assistant_enabled,
      feature_reminders_enabled: next.feature_reminders_enabled,
      feature_scheduled_send_enabled: next.feature_scheduled_send_enabled,
      default_new_account_plan: next.default_new_account_plan,
      starter_monthly_invoice_limit: next.starter_monthly_invoice_limit,
      growth_monthly_invoice_limit: next.growth_monthly_invoice_limit,
      professional_monthly_invoice_limit: next.professional_monthly_invoice_limit,
      enterprise_monthly_invoice_limit: next.enterprise_monthly_invoice_limit,
      trial_days: next.trial_days,
      admin_alerts_email: next.admin_alerts_email,
      system_sender_label: next.system_sender_label,
      plan_price_starter_cents: next.plan_price_starter_cents,
      plan_price_growth_cents: next.plan_price_growth_cents,
      plan_price_professional_cents: next.plan_price_professional_cents,
      plan_price_enterprise_cents: next.plan_price_enterprise_cents,
      ai_assistant_daily_requests_per_user: next.ai_assistant_daily_requests_per_user,
      reminder_default_first_before_due_days: next.reminder_default_first_before_due_days,
      scheduling_min_lead_minutes: next.scheduling_min_lead_minutes,
      updated_at: new Date().toISOString(),
      updated_by_user_id: gate.user.id,
    })
    .eq('id', 'default');

  if (upErr) {
    console.error('[admin_platform_settings]', upErr);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  invalidateAdminPlatformSettingsCache();

  const keys = Object.keys(next).filter(
    (k) => !['updated_at', 'updated_by_user_id'].includes(k)
  ) as (keyof AdminPlatformSettingsDTO)[];
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(next[k]);
    if (a !== b) changed[k] = { from: before[k], to: next[k] };
  }

  await logAdminAuditEvent({
    supabase: gate.supabase,
    actorUserId: gate.user.id,
    actorRole: gate.adminRole,
    action: 'admin_platform_settings_updated',
    targetType: 'admin_platform_settings',
    targetId: 'default',
    metadata: { section: patch.section, changed },
  });

  const platform = mergeAdminPlatformSettingsRow(
    ((
      await admin.from('admin_platform_settings').select('*').eq('id', 'default').maybeSingle()
    ).data ?? null) as Record<string, unknown> | null
  );

  return NextResponse.json({ platform });
}
