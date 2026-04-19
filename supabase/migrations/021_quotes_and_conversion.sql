DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_status') THEN
    CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'quote_created';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'quote_sent';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'quote_accepted';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'quote_rejected';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'quote_converted';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE NULL,
  notes TEXT NULL,
  status quote_status NOT NULL DEFAULT 'draft',
  converted_invoice_id UUID NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, quote_number)
);

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NULL,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotes_business_created ON public.quotes(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_business_status ON public.quotes(business_id, status);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.quote_items(quote_id);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage quotes of own businesses" ON public.quotes;
CREATE POLICY "Users can manage quotes of own businesses" ON public.quotes
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can manage quote items of own quotes" ON public.quote_items;
CREATE POLICY "Users can manage quote items of own quotes" ON public.quote_items
FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM public.quotes q
    JOIN public.businesses b ON b.id = q.business_id
    WHERE q.id = quote_id AND b.owner_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION next_quote_number(p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(quote_number, '[^0-9]', '', 'g') AS INT)), 0) + 1
  INTO next_num
  FROM public.quotes
  WHERE business_id = p_business_id;

  RETURN 'QT-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

