-- Scheduled invoice send (draft only; cleared when sent or cancelled)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS scheduled_send_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_send_timezone text;

CREATE INDEX IF NOT EXISTS invoices_scheduled_send_due_idx
  ON invoices (scheduled_send_at)
  WHERE status = 'draft' AND scheduled_send_at IS NOT NULL;
