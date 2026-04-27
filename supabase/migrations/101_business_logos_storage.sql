-- Public bucket for per-business logo files (object key: {business_id}/logo-...; see BusinessProfileForm + import-logo).
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Client uploads use the end-user Supabase client (not service role), so RLS on storage.objects must allow writes
-- for users who can manage business settings (owner, or business_members.role = 'admin' with manage_settings).
DROP POLICY IF EXISTS "business_logos_insert" ON storage.objects;
CREATE POLICY "business_logos_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-logos'
    AND length(trim(COALESCE(name, ''))) > 0
    -- Compare path prefix as text; never cast path to uuid (invalid or non-uuid prefixes must fail closed without error).
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
    -- Compare path prefix as text; never cast path to uuid.
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
    -- Compare path prefix as text; never cast path to uuid (invalid or non-uuid prefixes must fail closed without error).
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
    -- Compare path prefix as text; never cast path to uuid (invalid or non-uuid prefixes must fail closed without error).
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
