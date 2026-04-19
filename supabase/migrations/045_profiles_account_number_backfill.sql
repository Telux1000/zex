-- Backfill profiles.account_number (Z0001, …) for rows missing it; preserve non-empty values; single transaction + lock.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_number TEXT;

CREATE SEQUENCE IF NOT EXISTS public.user_account_number_seq;

BEGIN;

LOCK TABLE public.profiles IN EXCLUSIVE MODE;

WITH
  existing_max AS (
    SELECT COALESCE(
      MAX(SUBSTRING(TRIM(account_number) FROM 2)::bigint),
      0::bigint
    ) AS n
    FROM public.profiles
    WHERE account_number ~ '^Z[0-9]{4}$'
  ),
  need_numbers AS (
    SELECT
      id,
      row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
    FROM public.profiles
    WHERE account_number IS NULL OR TRIM(COALESCE(account_number, '')) = ''
  )
UPDATE public.profiles p
SET account_number = 'Z' || lpad((em.n + nn.rn)::text, 4, '0')
FROM need_numbers nn
CROSS JOIN existing_max em
WHERE p.id = nn.id;

SELECT setval(
  'public.user_account_number_seq',
  GREATEST(
    1::bigint,
    (
      SELECT COALESCE(MAX(SUBSTRING(TRIM(account_number) FROM 2)::bigint), 0::bigint)
      FROM public.profiles
      WHERE account_number ~ '^Z[0-9]{4}$'
    )
  )
);

COMMIT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_number_key ON public.profiles (account_number);

NOTIFY pgrst, 'reload schema';
