import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationPreferenceSettings } from '@/types/notifications';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceSettings = {
  invoice_sent_emails: true,
  payment_received_alerts: true,
  payment_reminders: true,
  overdue_reminders: true,
  quote_emails: true,
  ai_insight_emails: true,
  internal_operational_alerts: true,
};

export async function getNotificationPreferences(
  supabase: SupabaseClient,
  businessId: string
): Promise<NotificationPreferenceSettings> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(
      'invoice_sent_emails, payment_received_alerts, payment_reminders, overdue_reminders, quote_emails, ai_insight_emails, internal_operational_alerts'
    )
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

  return {
    invoice_sent_emails: Boolean(data.invoice_sent_emails),
    payment_received_alerts: Boolean(data.payment_received_alerts),
    payment_reminders: Boolean(data.payment_reminders),
    overdue_reminders: Boolean(data.overdue_reminders),
    quote_emails: Boolean(data.quote_emails),
    ai_insight_emails: Boolean(data.ai_insight_emails),
    internal_operational_alerts: Boolean(data.internal_operational_alerts),
  };
}

export async function saveNotificationPreferences(
  supabase: SupabaseClient,
  businessId: string,
  prefs: NotificationPreferenceSettings
) {
  const { error } = await supabase.from('notification_preferences').upsert(
    {
      business_id: businessId,
      ...prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id' }
  );
  if (error) throw new Error(error.message);
}

