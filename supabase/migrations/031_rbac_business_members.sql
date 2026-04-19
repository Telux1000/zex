-- RBAC: per-business members (owner remains businesses.owner_id; members in business_members).

CREATE TABLE IF NOT EXISTS public.business_members (
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'accountant', 'staff', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_members_user ON public.business_members(user_id);
CREATE INDEX IF NOT EXISTS idx_business_members_business ON public.business_members(business_id);

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.business_can_see(p_business_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id AND b.owner_id = p_user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.business_members m
    WHERE m.business_id = p_business_id AND m.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.business_perm(p_business_id uuid, p_user_id uuid, p_perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = p_business_id AND b.owner_id = p_user_id) THEN
    RETURN true;
  END IF;

  SELECT bm.role INTO r
  FROM public.business_members bm
  WHERE bm.business_id = p_business_id AND bm.user_id = p_user_id
  LIMIT 1;

  IF r IS NULL THEN
    RETURN false;
  END IF;

  IF p_perm IN ('view_data', 'view_only', 'view_reports') THEN
    RETURN true;
  END IF;

  IF p_perm = 'manage_users' THEN
    RETURN r = 'admin';
  END IF;

  IF p_perm = 'manage_settings' THEN
    RETURN r = 'admin';
  END IF;

  IF p_perm = 'manage_invoices' THEN
    RETURN r IN ('admin', 'accountant');
  END IF;

  IF p_perm = 'manage_customers' THEN
    RETURN r = 'admin';
  END IF;

  IF p_perm = 'manage_payments' THEN
    RETURN r IN ('admin', 'accountant');
  END IF;

  IF p_perm = 'create_invoice' THEN
    RETURN r IN ('admin', 'accountant', 'staff');
  END IF;

  IF p_perm = 'create_customer' THEN
    RETURN r IN ('admin', 'staff');
  END IF;

  IF p_perm = 'edit_invoice' THEN
    RETURN r IN ('admin', 'accountant', 'staff');
  END IF;

  IF p_perm = 'delete_invoice' THEN
    RETURN r IN ('admin', 'accountant');
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "bm_select" ON public.business_members;
CREATE POLICY "bm_select" ON public.business_members FOR SELECT
  USING (public.business_can_see(business_id, auth.uid()));

DROP POLICY IF EXISTS "bm_insert" ON public.business_members;
CREATE POLICY "bm_insert" ON public.business_members FOR INSERT
  WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_users'));

DROP POLICY IF EXISTS "bm_update" ON public.business_members;
CREATE POLICY "bm_update" ON public.business_members FOR UPDATE
  USING (public.business_perm(business_id, auth.uid(), 'manage_users'))
  WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_users'));

DROP POLICY IF EXISTS "bm_delete" ON public.business_members;
CREATE POLICY "bm_delete" ON public.business_members FOR DELETE
  USING (public.business_perm(business_id, auth.uid(), 'manage_users'));

-- businesses
DROP POLICY IF EXISTS "Users can manage own businesses" ON public.businesses;
DROP POLICY IF EXISTS "businesses_select" ON public.businesses;
DROP POLICY IF EXISTS "businesses_insert" ON public.businesses;
DROP POLICY IF EXISTS "businesses_update" ON public.businesses;
DROP POLICY IF EXISTS "businesses_delete" ON public.businesses;

CREATE POLICY "businesses_select" ON public.businesses FOR SELECT
  USING (public.business_can_see(id, auth.uid()));

CREATE POLICY "businesses_insert" ON public.businesses FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "businesses_update" ON public.businesses FOR UPDATE
  USING (auth.uid() = owner_id OR public.business_perm(id, auth.uid(), 'manage_settings'))
  WITH CHECK (auth.uid() = owner_id OR public.business_perm(id, auth.uid(), 'manage_settings'));

CREATE POLICY "businesses_delete" ON public.businesses FOR DELETE
  USING (auth.uid() = owner_id);

-- customers
DROP POLICY IF EXISTS "Users can manage customers of own businesses" ON public.customers;
DROP POLICY IF EXISTS "customers_select" ON public.customers;
DROP POLICY IF EXISTS "customers_insert" ON public.customers;
DROP POLICY IF EXISTS "customers_update" ON public.customers;
DROP POLICY IF EXISTS "customers_delete" ON public.customers;

CREATE POLICY "customers_select" ON public.customers FOR SELECT
  USING (public.business_perm(business_id, auth.uid(), 'view_data'));

CREATE POLICY "customers_insert" ON public.customers FOR INSERT
  WITH CHECK (
    public.business_perm(business_id, auth.uid(), 'create_customer')
    OR public.business_perm(business_id, auth.uid(), 'manage_customers')
  );

CREATE POLICY "customers_update" ON public.customers FOR UPDATE
  USING (public.business_perm(business_id, auth.uid(), 'manage_customers'))
  WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_customers'));

CREATE POLICY "customers_delete" ON public.customers FOR DELETE
  USING (public.business_perm(business_id, auth.uid(), 'manage_customers'));

-- invoices
DROP POLICY IF EXISTS "Users can manage invoices of own businesses" ON public.invoices;
DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete" ON public.invoices;

CREATE POLICY "invoices_select" ON public.invoices FOR SELECT
  USING (public.business_perm(business_id, auth.uid(), 'view_data'));

CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT
  WITH CHECK (
    public.business_perm(business_id, auth.uid(), 'create_invoice')
    OR public.business_perm(business_id, auth.uid(), 'manage_invoices')
  );

CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE
  USING (public.business_perm(business_id, auth.uid(), 'edit_invoice'))
  WITH CHECK (public.business_perm(business_id, auth.uid(), 'edit_invoice'));

CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE
  USING (public.business_perm(business_id, auth.uid(), 'delete_invoice'));

-- invoice_items
DROP POLICY IF EXISTS "Users can manage invoice items of own invoices" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete" ON public.invoice_items;

CREATE POLICY "invoice_items_select" ON public.invoice_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id AND public.business_perm(i.business_id, auth.uid(), 'view_data')
    )
  );

CREATE POLICY "invoice_items_insert" ON public.invoice_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND (
          public.business_perm(i.business_id, auth.uid(), 'create_invoice')
          OR public.business_perm(i.business_id, auth.uid(), 'manage_invoices')
        )
    )
  );

CREATE POLICY "invoice_items_update" ON public.invoice_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id AND public.business_perm(i.business_id, auth.uid(), 'edit_invoice')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id AND public.business_perm(i.business_id, auth.uid(), 'edit_invoice')
    )
  );

CREATE POLICY "invoice_items_delete" ON public.invoice_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id AND public.business_perm(i.business_id, auth.uid(), 'delete_invoice')
    )
  );

-- payments
DROP POLICY IF EXISTS "Users can manage payments of own businesses" ON public.payments;
DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_update" ON public.payments;
DROP POLICY IF EXISTS "payments_delete" ON public.payments;

CREATE POLICY "payments_select" ON public.payments FOR SELECT
  USING (public.business_perm(business_id, auth.uid(), 'view_data'));

CREATE POLICY "payments_insert" ON public.payments FOR INSERT
  WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_payments'));

CREATE POLICY "payments_update" ON public.payments FOR UPDATE
  USING (public.business_perm(business_id, auth.uid(), 'manage_payments'))
  WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_payments'));

CREATE POLICY "payments_delete" ON public.payments FOR DELETE
  USING (public.business_perm(business_id, auth.uid(), 'manage_payments'));

-- invoice_themes (optional: table exists in full schema from 001; skip if DB skipped that migration)
DO $rbac_invoice_themes$
BEGIN
  IF to_regclass('public.invoice_themes') IS NULL THEN
    RETURN;
  END IF;
  DROP POLICY IF EXISTS "Users can manage themes of own businesses" ON public.invoice_themes;
  DROP POLICY IF EXISTS "invoice_themes_select" ON public.invoice_themes;
  DROP POLICY IF EXISTS "invoice_themes_insert" ON public.invoice_themes;
  DROP POLICY IF EXISTS "invoice_themes_update" ON public.invoice_themes;
  DROP POLICY IF EXISTS "invoice_themes_delete" ON public.invoice_themes;

  CREATE POLICY "invoice_themes_select" ON public.invoice_themes FOR SELECT
    USING (public.business_perm(business_id, auth.uid(), 'view_data'));

  CREATE POLICY "invoice_themes_insert" ON public.invoice_themes FOR INSERT
    WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_settings'));

  CREATE POLICY "invoice_themes_update" ON public.invoice_themes FOR UPDATE
    USING (public.business_perm(business_id, auth.uid(), 'manage_settings'))
    WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_settings'));

  CREATE POLICY "invoice_themes_delete" ON public.invoice_themes FOR DELETE
    USING (public.business_perm(business_id, auth.uid(), 'manage_settings'));
END $rbac_invoice_themes$;

-- activity_events (from 001; skip if missing)
DO $rbac_activity$
BEGIN
  IF to_regclass('public.activity_events') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can read activity of own businesses" ON public.activity_events;
  DROP POLICY IF EXISTS "activity_events_select" ON public.activity_events;
  CREATE POLICY "activity_events_select" ON public.activity_events FOR SELECT
    USING (public.business_can_see(business_id, auth.uid()));
END $rbac_activity$;

-- ai_insights (from 001; skip if missing)
DO $rbac_insights$
BEGIN
  IF to_regclass('public.ai_insights') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can read insights of own businesses" ON public.ai_insights;
  DROP POLICY IF EXISTS "ai_insights_select" ON public.ai_insights;
  CREATE POLICY "ai_insights_select" ON public.ai_insights FOR SELECT
    USING (public.business_can_see(business_id, auth.uid()));
END $rbac_insights$;

-- quotes + quote_items (from 021; skip if missing)
DO $rbac_quotes$
BEGIN
  IF to_regclass('public.quotes') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can manage quotes of own businesses" ON public.quotes;
  DROP POLICY IF EXISTS "quotes_select" ON public.quotes;
  DROP POLICY IF EXISTS "quotes_insert" ON public.quotes;
  DROP POLICY IF EXISTS "quotes_update" ON public.quotes;
  DROP POLICY IF EXISTS "quotes_delete" ON public.quotes;

  CREATE POLICY "quotes_select" ON public.quotes FOR SELECT
    USING (public.business_perm(business_id, auth.uid(), 'view_data'));

  CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT
    WITH CHECK (
      public.business_perm(business_id, auth.uid(), 'create_invoice')
      OR public.business_perm(business_id, auth.uid(), 'manage_invoices')
    );

  CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE
    USING (public.business_perm(business_id, auth.uid(), 'edit_invoice'))
    WITH CHECK (public.business_perm(business_id, auth.uid(), 'edit_invoice'));

  CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE
    USING (public.business_perm(business_id, auth.uid(), 'delete_invoice'));

  IF to_regclass('public.quote_items') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can manage quote items of own quotes" ON public.quote_items;
  DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
  DROP POLICY IF EXISTS "quote_items_insert" ON public.quote_items;
  DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
  DROP POLICY IF EXISTS "quote_items_delete" ON public.quote_items;

  CREATE POLICY "quote_items_select" ON public.quote_items FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_id AND public.business_perm(q.business_id, auth.uid(), 'view_data')
      )
    );

  CREATE POLICY "quote_items_insert" ON public.quote_items FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_id
          AND (
            public.business_perm(q.business_id, auth.uid(), 'create_invoice')
            OR public.business_perm(q.business_id, auth.uid(), 'manage_invoices')
          )
      )
    );

  CREATE POLICY "quote_items_update" ON public.quote_items FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_id AND public.business_perm(q.business_id, auth.uid(), 'edit_invoice')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_id AND public.business_perm(q.business_id, auth.uid(), 'edit_invoice')
      )
    );

  CREATE POLICY "quote_items_delete" ON public.quote_items FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_id AND public.business_perm(q.business_id, auth.uid(), 'delete_invoice')
      )
    );
END $rbac_quotes$;

-- expenses (from 015; skip if missing)
DO $rbac_expenses$
BEGIN
  IF to_regclass('public.expenses') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can manage expenses of own businesses" ON public.expenses;
  DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
  DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
  DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
  DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;

  CREATE POLICY "expenses_select" ON public.expenses FOR SELECT
    USING (public.business_perm(business_id, auth.uid(), 'view_data'));

  CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT
    WITH CHECK (
      public.business_perm(business_id, auth.uid(), 'edit_invoice')
      OR public.business_perm(business_id, auth.uid(), 'manage_invoices')
    );

  CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE
    USING (public.business_perm(business_id, auth.uid(), 'manage_invoices'))
    WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_invoices'));

  CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE
    USING (public.business_perm(business_id, auth.uid(), 'manage_invoices'));
END $rbac_expenses$;

-- audit_logs (from 028; skip if missing)
DO $rbac_audit$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can read audit logs of own businesses" ON public.audit_logs;
  DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
  CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT
    USING (public.business_can_see(business_id, auth.uid()));

  DROP POLICY IF EXISTS "Users can insert audit logs for own businesses" ON public.audit_logs;
  DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
  CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
      OR public.business_perm(business_id, auth.uid(), 'manage_settings')
    );
END $rbac_audit$;

-- invoice_reminder_sent_log (from 027; skip if missing)
DO $rbac_reminder_log$
BEGIN
  IF to_regclass('public.invoice_reminder_sent_log') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Owners read invoice reminder log" ON public.invoice_reminder_sent_log;
  CREATE POLICY "invoice_reminder_log_select" ON public.invoice_reminder_sent_log FOR SELECT
    USING (public.business_perm(business_id, auth.uid(), 'view_data'));
END $rbac_reminder_log$;

-- notifications (from 025; skip if missing)
DO $rbac_notifications$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can read notifications of own businesses" ON public.notifications;
  DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
  CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
    USING (public.business_can_see(business_id, auth.uid()));

  DROP POLICY IF EXISTS "Users can manage notifications of own businesses" ON public.notifications;
  DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
  DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
  DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;

  CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

  CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
    USING (public.business_can_see(business_id, auth.uid()))
    WITH CHECK (public.business_can_see(business_id, auth.uid()));

  CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE
    USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));
END $rbac_notifications$;

-- notification_preferences (from 026; skip if missing)
DO $rbac_notif_prefs$
BEGIN
  IF to_regclass('public.notification_preferences') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can manage notification preferences of own businesses" ON public.notification_preferences;
  DROP POLICY IF EXISTS "notification_preferences_select" ON public.notification_preferences;
  DROP POLICY IF EXISTS "notification_preferences_insert" ON public.notification_preferences;
  DROP POLICY IF EXISTS "notification_preferences_update" ON public.notification_preferences;
  DROP POLICY IF EXISTS "notification_preferences_delete" ON public.notification_preferences;

  CREATE POLICY "notification_preferences_select" ON public.notification_preferences FOR SELECT
    USING (public.business_can_see(business_id, auth.uid()));

  CREATE POLICY "notification_preferences_insert" ON public.notification_preferences FOR INSERT
    WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_settings'));

  CREATE POLICY "notification_preferences_update" ON public.notification_preferences FOR UPDATE
    USING (public.business_perm(business_id, auth.uid(), 'manage_settings'))
    WITH CHECK (public.business_perm(business_id, auth.uid(), 'manage_settings'));

  CREATE POLICY "notification_preferences_delete" ON public.notification_preferences FOR DELETE
    USING (public.business_perm(business_id, auth.uid(), 'manage_settings'));
END $rbac_notif_prefs$;

-- email_messages (from 026; skip if missing)
DO $rbac_email_msg$
BEGIN
  IF to_regclass('public.email_messages') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Users can read email messages of own businesses" ON public.email_messages;
  CREATE POLICY "email_messages_select" ON public.email_messages FOR SELECT
    USING (public.business_can_see(business_id, auth.uid()));
END $rbac_email_msg$;

NOTIFY pgrst, 'reload schema';
