-- Supabase: uploads with { upsert: true } can require storage.objects FOR SELECT (and related checks) in addition
-- to INSERT/UPDATE. Add SELECT for the same business logo gate as 103.
DROP POLICY IF EXISTS "business_logos_select" ON storage.objects;
CREATE POLICY "business_logos_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND public.storage_can_manage_business_logo(name, (select auth.uid()))
  );

-- Public bucket: customer invoice pages and email clients load logo URLs without a session. Allow anon read
-- of objects in this bucket (the URL is a random path per upload; RLS is not a secrecy boundary here).
DROP POLICY IF EXISTS "business_logos_select_public" ON storage.objects;
CREATE POLICY "business_logos_select_public"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'business-logos');

NOTIFY pgrst, 'reload schema';
