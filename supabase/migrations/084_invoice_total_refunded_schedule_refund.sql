-- Cumulative refunds on invoice row (net paid = amount_paid after refund updates).
-- Payment schedule: explicit refund rows for audit visibility.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS total_refunded NUMERIC(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.total_refunded IS 'Cumulative refunds (succeeded/pending). amount_paid stays gross captured; balance_due = total - amount_paid + total_refunded; net retained = amount_paid - total_refunded.';

UPDATE public.invoices i
SET total_refunded = sub.rf
FROM (
  SELECT
    r.invoice_id,
    round(coalesce(sum(r.amount::numeric), 0), 2) AS rf
  FROM public.payment_refunds r
  WHERE lower(trim(coalesce(r.status::text, ''))) IN ('succeeded', 'pending')
  GROUP BY r.invoice_id
) sub
WHERE i.id = sub.invoice_id
  AND (i.total_refunded IS NULL OR i.total_refunded = 0);

-- Align balance_due with gross paid + refunds (receivable reopens when refunds exceed “unused” credit).
UPDATE public.invoices i
SET balance_due = round(
  greatest(
    0::numeric,
    coalesce(i.total, 0)::numeric - coalesce(i.amount_paid, 0)::numeric + coalesce(i.total_refunded, 0)::numeric
  ),
  2
)
WHERE coalesce(i.total_refunded, 0) > 0;

ALTER TABLE public.invoice_payment_schedule_items
  DROP CONSTRAINT IF EXISTS invoice_payment_schedule_status_chk;

ALTER TABLE public.invoice_payment_schedule_items
  ADD CONSTRAINT invoice_payment_schedule_status_chk
  CHECK (status IN ('pending', 'paid', 'refund'));
