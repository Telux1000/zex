-- Provider-neutral name for the locked plan + billing cycle reference (opaque; not always Stripe).
ALTER TABLE public.profiles
  RENAME COLUMN selected_stripe_price_id TO selected_catalog_price_id;

COMMENT ON COLUMN public.profiles.selected_catalog_price_id IS
  'Opaque catalog or internal billing key for the selected plan and billing interval.';

NOTIFY pgrst, 'reload schema';
