-- Fix 101: policies used (split_part(name,'/',1))::uuid which throws if the first path segment is not a
-- valid UUID (e.g. a mistaken folder or filename), surfacing "invalid input syntax for type uuid".
-- Recreate the same three policies with id::text / business_id::text = split_part(...) (no path cast to uuid).
DROP POLICY IF EXISTS "business_logos_insert" ON storage.objects;
CREATE POLICY "business_logos_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-logos'
    AND length(trim(COALESCE(name, ''))) > 0
    AND (
      EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id::text = split_part(name, '/', 1)
          AND b.owner_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_members m
        WHERE m.business_id::text = split_part(name, '/', 1)
          AND m.user_id = (SELECT auth.uid())
          AND m.role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "business_logos_update" ON storage.objects;
CREATE POLICY "business_logos_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND length(trim(COALESCE(name, ''))) > 0
    AND (
      EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id::text = split_part(name, '/', 1)
          AND b.owner_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_members m
        WHERE m.business_id::text = split_part(name, '/', 1)
          AND m.user_id = (SELECT auth.uid())
          AND m.role = 'admin'
      )
    )
  )
  WITH CHECK (
    bucket_id = 'business-logos'
    AND length(trim(COALESCE(name, ''))) > 0
    AND (
      EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id::text = split_part(name, '/', 1)
          AND b.owner_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_members m
        WHERE m.business_id::text = split_part(name, '/', 1)
          AND m.user_id = (SELECT auth.uid())
          AND m.role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "business_logos_delete" ON storage.objects;
CREATE POLICY "business_logos_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND length(trim(COALESCE(name, ''))) > 0
    AND (
      EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id::text = split_part(name, '/', 1)
          AND b.owner_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_members m
        WHERE m.business_id::text = split_part(name, '/', 1)
          AND m.user_id = (SELECT auth.uid())
          AND m.role = 'admin'
      )
    )
  );

NOTIFY pgrst, 'reload schema';
