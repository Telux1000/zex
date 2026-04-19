-- New rows must not get country = 'US' before the user saves Business Profile.
-- That default made the client treat "no choice" as a saved US and skip geo/locale prefill.
ALTER TABLE public.businesses
  ALTER COLUMN country DROP DEFAULT;
