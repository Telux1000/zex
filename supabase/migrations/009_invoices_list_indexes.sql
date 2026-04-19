-- Indexes for fast invoice list filtering, sorting, and search.
-- Use for server-side pagination and filters on /dashboard/invoices.

-- List by business + invoice number (search)
CREATE INDEX IF NOT EXISTS idx_invoices_business_number ON public.invoices(business_id, invoice_number);

-- List by business + created_at (default sort)
CREATE INDEX IF NOT EXISTS idx_invoices_business_created ON public.invoices(business_id, created_at DESC);

-- Composite for common filter: business + status + due_date
CREATE INDEX IF NOT EXISTS idx_invoices_business_status_due ON public.invoices(business_id, status, due_date);
