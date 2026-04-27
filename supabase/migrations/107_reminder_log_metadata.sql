-- Extra columns for idempotency/debug on payment reminder sends.
ALTER TABLE public.invoice_reminder_sent_log
  ADD COLUMN IF NOT EXISTS reminder_type text,
  ADD COLUMN IF NOT EXISTS trigger_source text;

COMMENT ON COLUMN public.invoice_reminder_sent_log.reminder_type IS
  'Zenzex copy bucket, e.g. before_due, due_today, overdue, final_reminder.';
COMMENT ON COLUMN public.invoice_reminder_sent_log.trigger_source IS
  'cron | manual | assistant — who/what requested the send.';

-- Fast lookup: same billable day in UTC.
CREATE INDEX IF NOT EXISTS idx_invoice_reminder_log_invoice_utcdate
  ON public.invoice_reminder_sent_log (invoice_id, ((sent_at AT TIME ZONE 'UTC')::date));
