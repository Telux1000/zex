COMMENT ON COLUMN public.profiles.pending_checkout_provider IS
  'Processor key for an incomplete paid checkout (flutterwave, paystack, stripe; legacy value may be paddle).';

NOTIFY pgrst, 'reload schema';
