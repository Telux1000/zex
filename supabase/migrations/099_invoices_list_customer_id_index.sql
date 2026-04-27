-- Speeds invoice list when filtering by customer_id (RLS still applies).
CREATE INDEX IF NOT EXISTS idx_invoices_business_customer_id
  ON public.invoices (business_id, customer_id)
  WHERE customer_id IS NOT NULL;
