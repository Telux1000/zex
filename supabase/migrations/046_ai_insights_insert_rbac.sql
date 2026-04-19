-- Restrict ai_insights inserts to members who may view business financial data (aligns with app RBAC).

DO $rbac_ai_insights_ins$
BEGIN
  IF to_regclass('public.ai_insights') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Service role can insert insights" ON public.ai_insights;
  CREATE POLICY "ai_insights_insert" ON public.ai_insights FOR INSERT
    WITH CHECK (public.business_perm(business_id, auth.uid(), 'view_data'));
END $rbac_ai_insights_ins$;
