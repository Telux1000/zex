-- Billing unit per line (products + services): item, hour, day, custom label, etc.

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS unit_label TEXT NOT NULL DEFAULT 'item';

COMMENT ON COLUMN public.invoice_items.unit_label IS
  'Billing unit slug: item, hour, day, week, month, session, project, or a short custom label (e.g. milestone, package).';
