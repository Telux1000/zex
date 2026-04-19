-- Recurring invoice automation: schedule + frozen template snapshot per rule.

CREATE TABLE IF NOT EXISTS public.recurring_invoice_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  template_snapshot JSONB NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date DATE NOT NULL,
  next_run_date DATE NOT NULL,
  end_condition_type TEXT NOT NULL CHECK (end_condition_type IN ('never', 'end_date', 'count')),
  end_date DATE,
  end_after_count INTEGER CHECK (end_after_count IS NULL OR end_after_count >= 1),
  automation_mode TEXT NOT NULL DEFAULT 'draft' CHECK (automation_mode IN ('draft', 'auto_send')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  invoices_generated_count INTEGER NOT NULL DEFAULT 0,
  last_generated_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recurring_end_date_consistency CHECK (
    end_condition_type <> 'end_date' OR end_date IS NOT NULL
  ),
  CONSTRAINT recurring_count_consistency CHECK (
    end_condition_type <> 'count' OR end_after_count IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_business_status_next
  ON public.recurring_invoice_rules (business_id, status, next_run_date);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_cron
  ON public.recurring_invoice_rules (status, next_run_date)
  WHERE status = 'active';

COMMENT ON TABLE public.recurring_invoice_rules IS 'Scheduled invoice generation from a frozen line-item template; processed daily via cron.';

ALTER TABLE public.recurring_invoice_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_rules_select" ON public.recurring_invoice_rules;
CREATE POLICY "recurring_rules_select" ON public.recurring_invoice_rules FOR SELECT
  USING (public.business_can_see(business_id, auth.uid()));

DROP POLICY IF EXISTS "recurring_rules_insert" ON public.recurring_invoice_rules;
CREATE POLICY "recurring_rules_insert" ON public.recurring_invoice_rules FOR INSERT
  WITH CHECK (
    public.business_perm(business_id, auth.uid(), 'create_invoice')
    OR public.business_perm(business_id, auth.uid(), 'manage_invoices')
  );

DROP POLICY IF EXISTS "recurring_rules_update" ON public.recurring_invoice_rules;
CREATE POLICY "recurring_rules_update" ON public.recurring_invoice_rules FOR UPDATE
  USING (
    public.business_perm(business_id, auth.uid(), 'create_invoice')
    OR public.business_perm(business_id, auth.uid(), 'manage_invoices')
  );

DROP POLICY IF EXISTS "recurring_rules_delete" ON public.recurring_invoice_rules;
CREATE POLICY "recurring_rules_delete" ON public.recurring_invoice_rules FOR DELETE
  USING (public.business_perm(business_id, auth.uid(), 'manage_invoices'));

DROP TRIGGER IF EXISTS recurring_invoice_rules_updated_at ON public.recurring_invoice_rules;
CREATE TRIGGER recurring_invoice_rules_updated_at
  BEFORE UPDATE ON public.recurring_invoice_rules
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
