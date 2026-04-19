-- Customer default reminder rules; invoice overrides + scheduled one-off reminders.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS reminder_settings jsonb DEFAULT NULL;

COMMENT ON COLUMN public.customers.reminder_settings IS 'JSON: automaticReminders (bool), reminderTiming: [{ days, relativeTo: before_due|after_due }]';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS use_customer_reminder_defaults boolean NOT NULL DEFAULT true;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reminder_settings jsonb DEFAULT NULL;

COMMENT ON COLUMN public.invoices.use_customer_reminder_defaults IS 'When true, use customer reminder_timing; invoice may still set scheduledReminderAt';
COMMENT ON COLUMN public.invoices.reminder_settings IS 'JSON: scheduledReminderAt (ISO), or full override: automaticReminders, reminderTiming';

CREATE TABLE IF NOT EXISTS public.invoice_reminder_sent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('offset', 'scheduled', 'manual')),
  dedupe_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminder_sent_log_invoice ON public.invoice_reminder_sent_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminder_sent_log_business_sent ON public.invoice_reminder_sent_log(business_id, sent_at DESC);

ALTER TABLE public.invoice_reminder_sent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read invoice reminder log" ON public.invoice_reminder_sent_log;
CREATE POLICY "Owners read invoice reminder log" ON public.invoice_reminder_sent_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));
