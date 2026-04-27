-- Per-workspace (business) saved line items: autocomplete + light library, learned from invoice/quote usage.

CREATE TABLE IF NOT EXISTS public.saved_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  /** Lowercased, trimmed, collapsed spaces — matches invoice line "identity" for deduplication. */
  normalized_name TEXT NOT NULL,
  description TEXT,
  unit_label TEXT NOT NULL DEFAULT 'item',
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL,
  tax_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  line_type TEXT NOT NULL DEFAULT 'custom' CHECK (line_type IN ('service', 'product', 'custom')),
  usage_count INT NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (business_id, normalized_name, unit_label, currency)
);

CREATE INDEX IF NOT EXISTS idx_saved_line_items_business_active
  ON public.saved_line_items (business_id, currency)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_saved_line_items_business_name
  ON public.saved_line_items (business_id, normalized_name)
  WHERE archived_at IS NULL;

ALTER TABLE public.saved_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_line_items_select" ON public.saved_line_items;
CREATE POLICY "saved_line_items_select" ON public.saved_line_items
  FOR SELECT
  TO authenticated
  USING (public.business_can_see (business_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "saved_line_items_insert" ON public.saved_line_items;
CREATE POLICY "saved_line_items_insert" ON public.saved_line_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.business_can_see (business_id, (SELECT auth.uid()))
    AND (
      public.business_perm (business_id, (SELECT auth.uid()), 'create_invoice')
      OR public.business_perm (business_id, (SELECT auth.uid()), 'edit_invoice')
    )
  );

DROP POLICY IF EXISTS "saved_line_items_update" ON public.saved_line_items;
CREATE POLICY "saved_line_items_update" ON public.saved_line_items
  FOR UPDATE
  TO authenticated
  USING (
    public.business_can_see (business_id, (SELECT auth.uid()))
    AND public.business_perm (business_id, (SELECT auth.uid()), 'edit_invoice')
  )
  WITH CHECK (
    public.business_can_see (business_id, (SELECT auth.uid()))
    AND public.business_perm (business_id, (SELECT auth.uid()), 'edit_invoice')
  );

DROP POLICY IF EXISTS "saved_line_items_delete" ON public.saved_line_items;
CREATE POLICY "saved_line_items_delete" ON public.saved_line_items
  FOR DELETE
  TO authenticated
  USING (
    public.business_can_see (business_id, (SELECT auth.uid()))
    AND public.business_perm (business_id, (SELECT auth.uid()), 'edit_invoice')
  );

COMMENT ON TABLE public.saved_line_items IS
  'Reusable line templates per business: learned from invoice/quote lines and optional manual edit; not a product catalog.';

NOTIFY pgrst, 'reload schema';
