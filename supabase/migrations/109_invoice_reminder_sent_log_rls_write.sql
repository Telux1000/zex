-- Manual "Send reminder" uses the logged-in user's Supabase client (JWT), which is subject to RLS.
-- Cron uses the service role and bypasses RLS. The reminder log only had a SELECT policy, so
-- INSERT to claim a send (and DELETE rollback on failed Postmark) failed for real users.
-- This blocked payment reminders from the UI entirely.

DROP POLICY IF EXISTS "invoice_reminder_log_insert" ON public.invoice_reminder_sent_log;
CREATE POLICY "invoice_reminder_log_insert" ON public.invoice_reminder_sent_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_id
        AND i.business_id = business_id
    )
    AND (
      public.business_perm(business_id, auth.uid(), 'edit_invoice')
      OR public.business_perm(business_id, auth.uid(), 'manage_invoices')
    )
  );

DROP POLICY IF EXISTS "invoice_reminder_log_delete" ON public.invoice_reminder_sent_log;
CREATE POLICY "invoice_reminder_log_delete" ON public.invoice_reminder_sent_log
  FOR DELETE
  USING (
    public.business_perm(business_id, auth.uid(), 'edit_invoice')
    OR public.business_perm(business_id, auth.uid(), 'manage_invoices')
  );
