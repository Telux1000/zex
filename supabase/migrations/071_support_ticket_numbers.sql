-- Sequential public ticket numbers (T-1001, …) for support_tickets; stable and unique.

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq
  AS INTEGER
  START WITH 1001
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_number INTEGER;

UPDATE public.support_tickets t
SET ticket_number = sub.n
FROM (
  SELECT id, 1000 + row_number() OVER (ORDER BY created_at ASC) AS n
  FROM public.support_tickets
  WHERE ticket_number IS NULL
) sub
WHERE t.id = sub.id;

SELECT setval(
  'public.support_ticket_number_seq',
  (SELECT COALESCE(MAX(ticket_number), 1000) FROM public.support_tickets)
);

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number SET DEFAULT nextval('public.support_ticket_number_seq');

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number SET NOT NULL;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_ticket_number_key;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);

ALTER SEQUENCE public.support_ticket_number_seq OWNED BY public.support_tickets.ticket_number;

COMMENT ON COLUMN public.support_tickets.ticket_number IS
  'Monotonic display id; format as T-{ticket_number} in the app.';

NOTIFY pgrst, 'reload schema';
