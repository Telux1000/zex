-- Optional consultant name per line (for derived Time Summary on invoices).
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS assignee TEXT;

COMMENT ON COLUMN public.invoice_items.assignee IS
  'Optional display name for who performed the work (consultant, agency staff). Used only when Time Summary is shown; not a separate time-tracking system.';

-- When true, invoice PDF/UI may show a read-only Time Summary grouped by assignee from hour-based lines.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS show_time_summary BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invoices.show_time_summary IS
  'When true, show a derived Time Summary (from line items with unit hour + optional assignee) on the invoice document.';
