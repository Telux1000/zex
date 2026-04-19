-- Canonical invoice-level refund aggregates and succeeded payment rows (server-side).
-- Called from Next.js API with service_role only after normal auth + manage_payments checks.

CREATE OR REPLACE FUNCTION public.invoice_refund_modal_summary(p_invoice_id uuid)
RETURNS TABLE (
  amount_paid numeric,
  refunded_so_far numeric,
  available_refundable_amount numeric,
  succeeded_payment_count bigint,
  latest_paid_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH succ AS (
    SELECT
      p.id,
      p.amount::numeric AS amount,
      p.amount_in_invoice_currency::numeric AS aic,
      p.currency,
      p.paid_at,
      p.created_at,
      upper(trim(coalesce(nullif(trim(both from coalesce(i.currency::text, '')), ''), 'USD'))) AS inv_cur
    FROM public.payments p
    INNER JOIN public.invoices i ON i.id = p.invoice_id
    WHERE p.invoice_id = p_invoice_id
      AND lower(trim(coalesce(p.status::text, ''))) = 'succeeded'
  ),
  succ_norm AS (
    SELECT
      s.id,
      upper(trim(coalesce(nullif(trim(both from coalesce(s.currency::text, '')), ''), 'USD'))) AS pay_cur,
      s.inv_cur,
      s.amount,
      coalesce(s.aic, 0::numeric) AS aic,
      coalesce(s.paid_at, s.created_at) AS paid_or_created
    FROM succ s
  ),
  gross AS (
    SELECT
      round(
        (
          CASE
            WHEN n.pay_cur = n.inv_cur THEN
              CASE
                WHEN n.amount > 0 AND n.aic > 0 THEN greatest(n.amount, n.aic)
                WHEN n.amount > 0 THEN n.amount
                WHEN n.aic > 0 THEN n.aic
                ELSE 0::numeric
              END
            ELSE
              CASE
                WHEN n.aic > 0 THEN n.aic
                WHEN n.amount > 0 THEN n.amount
                ELSE 0::numeric
              END
          END
        )::numeric,
        2
      ) AS g
    FROM succ_norm n
  ),
  ref AS (
    SELECT round(coalesce(sum(r.amount::numeric), 0), 2) AS ref_sum
    FROM public.payment_refunds r
    INNER JOIN public.payments p ON p.id = r.payment_id
    WHERE p.invoice_id = p_invoice_id
      AND lower(trim(coalesce(r.status::text, ''))) IN ('succeeded', 'pending')
  ),
  ag AS (
    SELECT
      (SELECT coalesce(sum(g.g), 0) FROM gross g) AS ap,
      (SELECT ref_sum FROM ref) AS rf,
      (SELECT count(*)::bigint FROM gross g) AS cnt,
      (SELECT max(s.paid_or_created) FROM succ_norm s) AS latest
  )
  SELECT
    round(ag.ap::numeric, 2) AS amount_paid,
    round(ag.rf::numeric, 2) AS refunded_so_far,
    round(greatest(ag.ap - ag.rf, 0::numeric), 2) AS available_refundable_amount,
    ag.cnt AS succeeded_payment_count,
    ag.latest AS latest_paid_at
  FROM ag;
$fn$;

CREATE OR REPLACE FUNCTION public.invoice_refund_succeeded_payments(p_invoice_id uuid)
RETURNS SETOF public.payments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT *
  FROM public.payments
  WHERE invoice_id = p_invoice_id
    AND lower(trim(coalesce(status::text, ''))) = 'succeeded'
  ORDER BY paid_at DESC NULLS LAST, created_at DESC;
$fn$;

REVOKE ALL ON FUNCTION public.invoice_refund_modal_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoice_refund_succeeded_payments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_refund_modal_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_refund_succeeded_payments(uuid) TO service_role;
