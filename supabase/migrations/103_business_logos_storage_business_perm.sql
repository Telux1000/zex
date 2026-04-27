-- Storage policies on business-logos used plain SELECT on businesses / business_members under RLS, which
-- can miss rows in edge cases, and split_part(name,'/',1) is empty when name has a leading / (so checks never matched).
-- Delegate to the same public.business_perm(..., 'manage_settings') as the API (SECURITY DEFINER, consistent RBAC).
CREATE OR REPLACE FUNCTION public.storage_can_manage_business_logo(p_name text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripped text;
  v_first text;
  v_bid uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  v_stripped := ltrim(btrim(COALESCE(p_name, '')));
  v_stripped := regexp_replace(v_stripped, '^/+', '');
  v_first := split_part(v_stripped, '/', 1);
  IF v_first = '' OR v_first IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    v_bid := v_first::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;
  RETURN public.business_perm(v_bid, p_user_id, 'manage_settings');
END;
$$;

REVOKE ALL ON FUNCTION public.storage_can_manage_business_logo(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_can_manage_business_logo(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_can_manage_business_logo(text, uuid) TO service_role;

DROP POLICY IF EXISTS "business_logos_insert" ON storage.objects;
CREATE POLICY "business_logos_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-logos'
    AND public.storage_can_manage_business_logo(name, (select auth.uid()))
  );

DROP POLICY IF EXISTS "business_logos_update" ON storage.objects;
CREATE POLICY "business_logos_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND public.storage_can_manage_business_logo(name, (select auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'business-logos'
    AND public.storage_can_manage_business_logo(name, (select auth.uid()))
  );

DROP POLICY IF EXISTS "business_logos_delete" ON storage.objects;
CREATE POLICY "business_logos_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND public.storage_can_manage_business_logo(name, (select auth.uid()))
  );

NOTIFY pgrst, 'reload schema';
