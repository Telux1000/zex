-- Fix customers where business/company name was stored in contact name (name).
-- Move name to company and clear name when company is empty and name looks like a company name.
-- Safe to run multiple times (idempotent for already-corrected rows).

UPDATE public.customers
SET
  company = trim(name),
  name = ''
WHERE
  (company IS NULL OR trim(company) = '')
  AND trim(name) <> ''
  AND name ~* '(ltd|llc|inc|corp|plc|limited|gmbh)\.?\s*$';
