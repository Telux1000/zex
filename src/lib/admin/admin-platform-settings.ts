import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingPlan } from '@/lib/billing/plans';
import { normalizeBillingPlan, pricingPlans, type PricingPlan } from '@/lib/billing/plans';
import type { ReminderTimingEntry } from '@/lib/invoices/reminder-settings';
import { defaultCustomerReminderSettings } from '@/lib/invoices/reminder-settings';
import { normalizeBillingProviderMode, type BillingProviderMode } from '@/lib/billing/saas-billing-config';

export type AdminPlatformSettingsDTO = {
  /** When false, hide public waitlist on marketing site and reject new signups via POST /api/waitlist. */
  waitlist_enabled: boolean;
  feature_ai_assistant_enabled: boolean;
  feature_reminders_enabled: boolean;
  feature_scheduled_send_enabled: boolean;
  default_new_account_plan: BillingPlan;
  starter_monthly_invoice_limit: number;
  growth_monthly_invoice_limit: number | null;
  professional_monthly_invoice_limit: number | null;
  enterprise_monthly_invoice_limit: number | null;
  trial_days: number;
  admin_alerts_email: string | null;
  system_sender_label: string | null;
  plan_price_starter_cents: number | null;
  plan_price_growth_cents: number | null;
  plan_price_professional_cents: number | null;
  plan_price_enterprise_cents: number | null;
  billing_provider_mode: BillingProviderMode;
  ai_assistant_daily_requests_per_user: number;
  reminder_default_first_before_due_days: number | null;
  scheduling_min_lead_minutes: number;
  updated_at: string | null;
  updated_by_user_id: string | null;
};

const DEFAULT_ROW: AdminPlatformSettingsDTO = {
  waitlist_enabled: true,
  feature_ai_assistant_enabled: true,
  feature_reminders_enabled: true,
  feature_scheduled_send_enabled: true,
  default_new_account_plan: 'starter',
  starter_monthly_invoice_limit: 10,
  growth_monthly_invoice_limit: null,
  professional_monthly_invoice_limit: null,
  enterprise_monthly_invoice_limit: null,
  trial_days: 14,
  admin_alerts_email: null,
  system_sender_label: null,
  plan_price_starter_cents: null,
  plan_price_growth_cents: null,
  plan_price_professional_cents: null,
  plan_price_enterprise_cents: null,
  billing_provider_mode: 'flutterwave_primary_paystack_fallback',
  ai_assistant_daily_requests_per_user: 50,
  reminder_default_first_before_due_days: null,
  scheduling_min_lead_minutes: 60,
  updated_at: null,
  updated_by_user_id: null,
};

let cache: { at: number; value: AdminPlatformSettingsDTO } | null = null;
const CACHE_MS = 45_000;

export function invalidateAdminPlatformSettingsCache() {
  cache = null;
}

export function mergeAdminPlatformSettingsRow(row: Record<string, unknown> | null): AdminPlatformSettingsDTO {
  if (!row) return { ...DEFAULT_ROW };
  const n = (k: string) => {
    const v = row[k];
    if (v === null || v === undefined) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  return {
    waitlist_enabled: row.waitlist_enabled === false ? false : true,
    feature_ai_assistant_enabled: Boolean(row.feature_ai_assistant_enabled),
    feature_reminders_enabled: Boolean(row.feature_reminders_enabled),
    feature_scheduled_send_enabled: Boolean(row.feature_scheduled_send_enabled),
    default_new_account_plan: normalizeBillingPlan(row.default_new_account_plan),
    starter_monthly_invoice_limit: Math.max(1, n('starter_monthly_invoice_limit') ?? DEFAULT_ROW.starter_monthly_invoice_limit),
    growth_monthly_invoice_limit: n('growth_monthly_invoice_limit'),
    professional_monthly_invoice_limit: n('professional_monthly_invoice_limit'),
    enterprise_monthly_invoice_limit: n('enterprise_monthly_invoice_limit'),
    trial_days: Math.max(0, Math.min(730, Math.floor(n('trial_days') ?? DEFAULT_ROW.trial_days))),
    admin_alerts_email: row.admin_alerts_email != null ? String(row.admin_alerts_email).trim() || null : null,
    system_sender_label: row.system_sender_label != null ? String(row.system_sender_label).trim().slice(0, 120) || null : null,
    plan_price_starter_cents: n('plan_price_starter_cents'),
    plan_price_growth_cents: n('plan_price_growth_cents'),
    plan_price_professional_cents: n('plan_price_professional_cents'),
    plan_price_enterprise_cents: n('plan_price_enterprise_cents'),
    billing_provider_mode: normalizeBillingProviderMode(row.billing_provider_mode),
    ai_assistant_daily_requests_per_user: Math.max(
      1,
      Math.floor(n('ai_assistant_daily_requests_per_user') ?? DEFAULT_ROW.ai_assistant_daily_requests_per_user)
    ),
    reminder_default_first_before_due_days: (() => {
      const rd = row.reminder_default_first_before_due_days;
      if (rd === null || rd === undefined) return null;
      const n = Math.floor(Number(rd));
      if (!Number.isFinite(n)) return null;
      return Math.max(0, Math.min(90, n));
    })(),
    scheduling_min_lead_minutes: Math.max(
      1,
      Math.min(10080, Math.floor(n('scheduling_min_lead_minutes') ?? DEFAULT_ROW.scheduling_min_lead_minutes))
    ),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    updated_by_user_id: row.updated_by_user_id ? String(row.updated_by_user_id) : null,
  };
}

export async function fetchAdminPlatformSettings(admin: SupabaseClient): Promise<AdminPlatformSettingsDTO> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.value;
  }
  const { data, error } = await admin.from('admin_platform_settings').select('*').eq('id', 'default').maybeSingle();
  if (error || !data) {
    const v = { ...DEFAULT_ROW };
    cache = { at: now, value: v };
    return v;
  }
  const v = mergeAdminPlatformSettingsRow(data as Record<string, unknown>);
  cache = { at: now, value: v };
  return v;
}

export function effectivePlanMonthlyCents(plan: BillingPlan, settings: AdminPlatformSettingsDTO): number {
  const row = pricingPlans.find((p) => p.id === plan);
  if (row?.isFree) return 0;
  const key =
    plan === 'starter'
      ? settings.plan_price_starter_cents
      : plan === 'growth'
        ? settings.plan_price_growth_cents
        : plan === 'professional'
          ? settings.plan_price_professional_cents
          : settings.plan_price_enterprise_cents;
  if (key != null && Number.isFinite(key) && key >= 0) return Math.round(key);
  return row?.priceMonthlyCents ?? pricingPlans[0].priceMonthlyCents;
}

export function pricingPlansWithPlatformOverrides(settings: AdminPlatformSettingsDTO): PricingPlan[] {
  return pricingPlans.map((p) => ({
    ...p,
    priceMonthlyCents: effectivePlanMonthlyCents(p.id, settings),
  }));
}

export function monthlyInvoiceLimitForPlan(plan: BillingPlan, settings: AdminPlatformSettingsDTO): number | null {
  switch (plan) {
    case 'starter':
      return settings.starter_monthly_invoice_limit;
    case 'growth':
      return settings.growth_monthly_invoice_limit;
    case 'professional':
      return settings.professional_monthly_invoice_limit;
    case 'enterprise':
      return settings.enterprise_monthly_invoice_limit;
    default:
      return settings.starter_monthly_invoice_limit;
  }
}

/** Fallback timing when customer/invoice rows omit timing (uses platform first offset before due). */
export function platformFallbackReminderTiming(settings: AdminPlatformSettingsDTO): ReminderTimingEntry[] {
  const defaults = defaultCustomerReminderSettings().reminderTiming;
  const firstBefore =
    settings.reminder_default_first_before_due_days != null
      ? settings.reminder_default_first_before_due_days
      : (defaults[0]?.days ?? 3);
  const second = defaults[1] ?? { days: 3, relativeTo: 'after_due' as const };
  return [
    { days: firstBefore, relativeTo: 'before_due' },
    second,
  ];
}
