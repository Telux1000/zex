-- Link internal support tickets to subscriber accounts/businesses.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS target_business_id UUID NULL REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_target_business
  ON public.support_tickets(target_business_id);
