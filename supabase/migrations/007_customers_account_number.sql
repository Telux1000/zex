-- Add unique Customer Account Number to customers.
-- Format: first 3 letters of company (or name) + sequential number, e.g. BRI0001 (no dashes).
-- Generated on insert; stored in column for display and linking.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS account_number TEXT;

-- Uniqueness per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_account_number
  ON public.customers(business_id, account_number)
  WHERE account_number IS NOT NULL;

-- Backfill: generate account numbers for existing rows (optional; run once)
-- New inserts will set account_number via API. This allows existing rows to get a value if you run it.
-- DO $$
-- DECLARE
--   r RECORD;
--   prefix TEXT;
--   next_num INT;
-- BEGIN
--   FOR r IN SELECT id, business_id, name, company FROM public.customers WHERE account_number IS NULL
--   LOOP
--     prefix := UPPER(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(r.company), ''), r.name), '[^A-Za-z]', '', 'g'));
--     prefix := CASE WHEN LENGTH(prefix) >= 3 THEN LEFT(prefix, 3) WHEN LENGTH(prefix) > 0 THEN LPAD(prefix, 3, '0') ELSE 'CUS' END;
--     SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(account_number, '[^0-9]', '', 'g') AS INT)), 0) + 1 INTO next_num
--       FROM public.customers WHERE business_id = r.business_id AND account_number LIKE prefix || '%';
--     UPDATE public.customers SET account_number = prefix || LPAD(next_num::TEXT, 4, '0') WHERE id = r.id;
--   END LOOP;
-- END $$;

COMMENT ON COLUMN public.customers.account_number IS 'Unique per-business: first 3 letters of company/name + 4-digit sequence, e.g. BRI0001';
